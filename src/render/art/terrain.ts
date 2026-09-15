import { withAlpha } from "../color";
import { PALETTE } from "../palette";
import { circle, hash, radial, TAU } from "./common";

/** Paints one cell of open ground with stable, subtle variation. `x`, `y` is the cell. */
export function paintGround(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  left: number,
  top: number,
  s: number,
): void {
  ctx.fillStyle = (x + y) % 2 === 0 ? PALETTE.open : PALETTE.openAlt;
  ctx.fillRect(left, top, s, s);

  ctx.strokeStyle = PALETTE.tuft;
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.lineCap = "round";
  const tufts = Math.floor(hash(x, y, 1) * 3);
  for (let i = 0; i < tufts; i++) {
    const tx = left + s * (0.15 + hash(x, y, 10 + i) * 0.7);
    const ty = top + s * (0.2 + hash(x, y, 20 + i) * 0.65);
    ctx.beginPath();
    ctx.moveTo(tx - s * 0.04, ty);
    ctx.lineTo(tx - s * 0.06, ty - s * 0.07);
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx, ty - s * 0.09);
    ctx.moveTo(tx + s * 0.04, ty);
    ctx.lineTo(tx + s * 0.06, ty - s * 0.07);
    ctx.stroke();
  }
  if (hash(x, y, 2) > 0.6) {
    ctx.fillStyle = PALETTE.pebble;
    circle(
      ctx,
      left + s * (0.2 + hash(x, y, 3) * 0.6),
      top + s * (0.2 + hash(x, y, 4) * 0.6),
      s * 0.035,
    );
    ctx.fill();
  }

  ctx.strokeStyle = PALETTE.gridLine;
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, s - 1, s - 1);
}

export function paintRock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  left: number,
  top: number,
  s: number,
): void {
  paintGround(ctx, x, y, left, top, s);
  const cx = left + s / 2;
  const cy = top + s / 2;
  const points = 9;
  const outline: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * TAU + hash(x, y, 5) * TAU;
    const reach = s * (0.36 + hash(x, y, 30 + i) * 0.09);
    outline.push([cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach]);
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.12, s * 0.42, s * 0.3, 0, 0, TAU);
  ctx.fill();

  ctx.beginPath();
  for (const [px, py] of outline) ctx.lineTo(px, py);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(cx - s * 0.4, cy - s * 0.4, cx + s * 0.4, cy + s * 0.4);
  gradient.addColorStop(0, PALETTE.rockLight);
  gradient.addColorStop(1, PALETTE.rock);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = PALETTE.rockEdge;
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.1, cy - s * 0.14, s * 0.16, s * 0.08, -0.5, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.05, cy - s * 0.05);
  ctx.lineTo(cx + s * 0.12, cy + s * 0.08);
  ctx.lineTo(cx + s * 0.08, cy + s * 0.2);
  ctx.stroke();
}

export function paintSpawnTile(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  s: number,
): void {
  ctx.fillStyle = PALETTE.spawn;
  ctx.fillRect(left, top, s, s);
  ctx.strokeStyle = PALETTE.gridLine;
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, s - 1, s - 1);
}

export function paintExitTile(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  s: number,
): void {
  ctx.fillStyle = PALETTE.exit;
  ctx.fillRect(left, top, s, s);
  ctx.strokeStyle = PALETTE.exitMortar;
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  for (let row = 1; row < 3; row++) {
    ctx.moveTo(left, top + (s * row) / 3);
    ctx.lineTo(left + s, top + (s * row) / 3);
  }
  for (let row = 0; row < 3; row++) {
    const shift = row % 2 === 0 ? 0 : s / 4;
    for (let col = 0; col < 2; col++) {
      const bx = left + shift + (col * s) / 2 + s / 4;
      ctx.moveTo(bx, top + (s * row) / 3);
      ctx.lineTo(bx, top + (s * (row + 1)) / 3);
    }
  }
  ctx.stroke();
}

/**
 * The rift enemies pour out of. Drawn every frame; `rx`, `ry` are screen radii.
 * `surge` in [0, 1] flares it while a wave is spawning.
 */
export function paintPortal(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  now: number,
  surge: number,
): void {
  const color = PALETTE.portal;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  circle(ctx, 0, 0, 1);
  ctx.fillStyle = radial(ctx, 0, 0, 1, [
    [0, "#fff1f2"],
    [0.25, withAlpha(color, 0.9)],
    [0.7, withAlpha("#7f1d1d", 0.75)],
    [1, withAlpha("#450a0a", 0)],
  ]);
  ctx.fill();
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const turn = now / (900 - i * 180) + (i * TAU) / 3;
    ctx.beginPath();
    ctx.arc(0, 0, 0.45 + i * 0.17, turn, turn + 1.6);
    ctx.strokeStyle = withAlpha("#fecdd3", 0.55 + surge * 0.4);
    ctx.lineWidth = 0.06;
    ctx.stroke();
  }
  ctx.restore();
}

/** The crystal core behind the gate: the thing the player defends. */
export function paintCore(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  now: number,
  hurt: number,
): void {
  const color = hurt > 0 ? PALETTE.hpLow : PALETTE.core;
  const pulse = 0.5 + 0.5 * Math.sin(now / 520);
  const glow = s * (0.9 + pulse * 0.15 + hurt * 0.4);
  circle(ctx, cx, cy, glow);
  ctx.fillStyle = radial(ctx, cx, cy, glow, [
    [0, withAlpha(color, 0.45 + hurt * 0.3)],
    [1, withAlpha(color, 0)],
  ]);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.5);
  ctx.lineTo(cx + s * 0.28, cy - s * 0.05);
  ctx.lineTo(cx, cy + s * 0.5);
  ctx.lineTo(cx - s * 0.28, cy - s * 0.05);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(
    cx - s * 0.28,
    cy - s * 0.5,
    cx + s * 0.28,
    cy + s * 0.5,
  );
  gradient.addColorStop(0, "#f0fdf4");
  gradient.addColorStop(0.45, color);
  gradient.addColorStop(1, "#14532d");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.5);
  ctx.lineTo(cx, cy + s * 0.5);
  ctx.stroke();
}
