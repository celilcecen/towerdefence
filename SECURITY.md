# Security

Gridlock is a static, client-only game: no accounts, no backend, no cookies and no
third-party scripts. The attack surface is small by design, and what remains is
defended in layers.

## Controls

| Risk                       | Control                                                                                                                        | Enforced by                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Script injection (XSS)     | Strict Content Security Policy: `script-src 'self'`, no inline code, no `eval`                                                 | `deploy/security-headers.ts`, nginx, Playwright suite fails on any CSP violation |
| HTML injection             | DOM is built with `createElement` + `textContent`; `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` are banned | ESLint `no-restricted-properties`                                                |
| Clickjacking               | `frame-ancestors 'none'` and `X-Frame-Options: DENY`                                                                           | nginx, e2e header test                                                           |
| Tampered local data        | Saved records are parsed as untrusted input and rejected unless exactly valid                                                  | `parseRecord` + unit tests                                                       |
| Malformed commands         | Every command is validated at runtime, not only by the type system                                                             | command handlers + unit tests                                                    |
| Supply chain               | Zero runtime dependencies; dev dependencies audited in CI; GitHub Actions pinned to commit SHAs; Dependabot                    | `ci.yml`, `dependabot.yml`                                                       |
| Code-level vulnerabilities | CodeQL `security-extended` on every push and weekly                                                                            | `codeql.yml`                                                                     |
| Config drift               | nginx headers must equal the tested policy                                                                                     | `tests/deploy.test.ts`                                                           |
| Transport                  | HTTPS only, HSTS, Cloudflare in front of the origin                                                                            | nginx                                                                            |
| Unexpected HTTP methods    | Anything but `GET`/`HEAD` returns `405`; dotfiles return `404`                                                                 | nginx                                                                            |

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's
[private vulnerability reporting](https://github.com/celilcecen/towerdefence/security/advisories/new)
or email celilcecen@gmail.com. You will get a response within a few days.
