import { lighten, withAlpha } from "../color";
import { PALETTE } from "../palette";
import { circle, radial } from "./common";

/** A glowing dart pointing along `angle`. */
export function paintDart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  s: number,
  color: string,
): void {
  const length = s * 0.32;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = withAlpha(color, 0.3);
  ctx.lineWidth = Math.max(2, s * 0.11);
  ctx.beginPath();
  ctx.moveTo(x - dx * length, y - dy * length);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.strokeStyle = lighten(color, 0.55);
  ctx.lineWidth = Math.max(1.5, s * 0.045);
  ctx.beginPath();
  ctx.moveTo(x - dx * length * 0.7, y - dy * length * 0.7);
  ctx.lineTo(x + dx * s * 0.04, y + dy * s * 0.04);
  ctx.stroke();
  ctx.restore();
}

/** An iron cannonball with a hot rim and a ground shadow. */
export function paintShell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  color: string,
): void {
  const r = s * 0.11;
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.ellipse(x + r * 0.3, y + r * 1.2, r, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  circle(ctx, x, y, r * 1.7);
  ctx.fillStyle = radial(ctx, x, y, r * 1.7, [
    [0, withAlpha(color, 0.5)],
    [1, withAlpha(color, 0)],
  ]);
  ctx.fill();
  circle(ctx, x, y, r);
  ctx.fillStyle = radial(
    ctx,
    x,
    y,
    r,
    [
      [0, "#9ca3af"],
      [0.6, "#374151"],
      [1, "#0b0f14"],
    ],
    x - r * 0.4,
    y - r * 0.4,
  );
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.stroke();
}
