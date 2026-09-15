#!/usr/bin/env bash
# Builds Gridlock and activates it on the web server as an atomic release.
#
#   DEPLOY_HOST=user@host [DEPLOY_KEY=~/.ssh/key] bash scripts/deploy.sh
#
# Releases live in /var/www/gridlock/releases/<timestamp>-<commit>; the
# `current` symlink is swapped in one rename, so visitors never see a
# half-copied build. The last five releases are kept for instant rollback.
set -euo pipefail

: "${DEPLOY_HOST:?Set DEPLOY_HOST, for example deploy@203.0.113.10}"
SSH_OPTS=(-o BatchMode=yes)
if [ -n "${DEPLOY_KEY:-}" ]; then SSH_OPTS+=(-i "$DEPLOY_KEY"); fi

APP_DIR=/var/www/gridlock
URL=https://play.yctechnologies.com.tr

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "Refusing to deploy uncommitted changes." >&2
  exit 1
fi
RELEASE="$(date -u +%Y%m%d%H%M%S)-$(git rev-parse --short HEAD)"

echo "==> build $RELEASE"
npm run build
rm -rf .deploy && mkdir -p .deploy
tar -czf .deploy/release.tgz -C dist .
cp deploy/nginx/gridlock.conf deploy/nginx/security-headers.conf .deploy/

echo "==> upload"
scp "${SSH_OPTS[@]}" .deploy/release.tgz .deploy/gridlock.conf .deploy/security-headers.conf "$DEPLOY_HOST:/tmp/"

echo "==> activate"
ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "APP_DIR=$APP_DIR RELEASE=$RELEASE bash -s" <<'REMOTE'
set -euo pipefail
target="$APP_DIR/releases/$RELEASE"
mkdir -p "$target"
tar -xzf /tmp/release.tgz -C "$target"
chmod -R a+rX "$target"

# Install nginx config; roll back the files if the new config does not validate.
site=/etc/nginx/sites-available/gridlock.conf
snippet=/etc/nginx/snippets/gridlock-security-headers.conf
for f in "$site" "$snippet"; do [ -f "$f" ] && cp "$f" "$f.bak"; done
install -m 0644 /tmp/gridlock.conf "$site"
install -m 0644 /tmp/security-headers.conf "$snippet"
ln -sfn "$site" /etc/nginx/sites-enabled/gridlock.conf
if ! nginx -t 2>/tmp/gridlock-nginx-test.log; then
  cat /tmp/gridlock-nginx-test.log >&2
  for f in "$site" "$snippet"; do [ -f "$f.bak" ] && mv "$f.bak" "$f"; done
  exit 1
fi

ln -sfn "$target" "$APP_DIR/current.next"
mv -Tf "$APP_DIR/current.next" "$APP_DIR/current"
systemctl reload nginx

ls -1dt "$APP_DIR"/releases/* | tail -n +6 | xargs -r rm -rf
rm -f /tmp/release.tgz /tmp/gridlock.conf /tmp/security-headers.conf
REMOTE

echo "==> verify"
status=$(curl -sS -o /dev/null -w "%{http_code}" "$URL/")
[ "$status" = "200" ] || { echo "Expected 200 from $URL, got $status" >&2; exit 1; }
curl -sSI "$URL/" | grep -qi "^content-security-policy: default-src 'self'" \
  || { echo "Security headers missing on $URL" >&2; exit 1; }
echo "==> live: $URL ($RELEASE)"
