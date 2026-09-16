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

/**
 * A heavy mortar round: bigger than a cannonball, banded in bronze, with a
 * burning fuse. Its shadow falls far below because the shell is lobbed high.
 */
export function paintMortarShell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  color: string,
): void {
  const r = s * 0.16;
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  ctx.ellipse(x + r * 0.6, y + r * 2.4, r * 0.8, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  circle(ctx, x, y, r * 1.8);
  ctx.fillStyle = radial(ctx, x, y, r * 1.8, [
    [0, withAlpha(color, 0.45)],
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
      [0, "#a8a29e"],
      [0.55, "#3f3a36"],
      [1, "#0c0a09"],
    ],
    x - r * 0.4,
    y - r * 0.45,
  );
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(x - r, y - r * 0.14, r * 2, r * 0.28);
  ctx.restore();
  ctx.strokeStyle = "#0c0a09";
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.stroke();

  const fx = x + r * 0.55;
  const fy = y - r * 0.9;
  ctx.strokeStyle = "#57534e";
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.beginPath();
  ctx.moveTo(x + r * 0.35, y - r * 0.6);
  ctx.lineTo(fx, fy);
  ctx.stroke();
  circle(ctx, fx, fy, r * 0.5);
  ctx.fillStyle = radial(ctx, fx, fy, r * 0.5, [
    [0, "#fffbeb"],
    [0.35, lighten("#f59e0b", 0.2)],
    [1, withAlpha("#f97316", 0)],
  ]);
  ctx.fill();
}
