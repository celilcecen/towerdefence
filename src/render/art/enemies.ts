import { darken, lighten, withAlpha } from "../color";
import { enemyColor } from "../palette";
import { circle, linear, radial, TAU } from "./common";

type BodyPainter = (ctx: CanvasRenderingContext2D, r: number, color: string) => void;

export interface EnemyArt {
  /** Sprite width as a multiple of the enemy's collision radius; horns and spikes must fit inside. */
  readonly extent: number;
  /** The body seen from above, facing +x. `r` is the collision radius in pixels. */
  readonly body: BodyPainter;
}

const STEEL: readonly (readonly [number, string])[] = [
  [0, "#d1d5db"],
  [0.55, "#6b7280"],
  [1, "#374151"],
];

function eyes(
  ctx: CanvasRenderingContext2D,
  x: number,
  spread: number,
  size: number,
  iris = "#111827",
): void {
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x, side * spread, size, size * 0.85, 0, 0, TAU);
    ctx.fillStyle = "#f8fafc";
    ctx.fill();
    circle(ctx, x + size * 0.35, side * spread, size * 0.5);
    ctx.fillStyle = iris;
    ctx.fill();
  }
}

function glowingEyes(
  ctx: CanvasRenderingContext2D,
  x: number,
  spread: number,
  size: number,
  color: string,
): void {
  for (const side of [-1, 1]) {
    circle(ctx, x, side * spread, size * 2.2);
    ctx.fillStyle = radial(ctx, x, side * spread, size * 2.2, [
      [0, withAlpha(color, 0.6)],
      [1, withAlpha(color, 0)],
    ]);
    ctx.fill();
    circle(ctx, x, side * spread, size);
    ctx.fillStyle = lighten(color, 0.55);
    ctx.fill();
  }
}

function shadedFill(ctx: CanvasRenderingContext2D, r: number, color: string): CanvasGradient {
  return radial(
    ctx,
    0,
    0,
    r * 1.2,
    [
      [0, lighten(color, 0.35)],
      [0.6, color],
      [1, darken(color, 0.45)],
    ],
    r * 0.2,
    -r * 0.35,
  );
}

const runner: BodyPainter = (ctx, r, color) => {
  ctx.beginPath();
  ctx.moveTo(r * 1.3, 0);
  ctx.quadraticCurveTo(r * 0.4, -r * 1.05, -r * 0.95, -r * 0.9);
  ctx.lineTo(-r * 0.45, 0);
  ctx.lineTo(-r * 0.95, r * 0.9);
  ctx.quadraticCurveTo(r * 0.4, r * 1.05, r * 1.3, 0);
  ctx.fillStyle = linear(ctx, r * 1.3, 0, -r, 0, [
    [0, lighten(color, 0.3)],
    [1, darken(color, 0.4)],
  ]);
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.55);
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, -r * 0.5);
  ctx.lineTo(r * 0.15, 0);
  ctx.lineTo(-r * 0.1, r * 0.5);
  ctx.strokeStyle = darken(color, 0.35);
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.stroke();
  eyes(ctx, r * 0.55, r * 0.3, r * 0.2);
};

const grunt: BodyPainter = (ctx, r, color) => {
  const bone = "#ede3cf";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, side * r * 0.7);
    ctx.lineTo(-r * 0.75, side * r * 1.18);
    ctx.lineTo(-r * 0.55, side * r * 0.55);
    ctx.closePath();
    ctx.fillStyle = bone;
    ctx.fill();
  }
  circle(ctx, 0, 0, r);
  ctx.fillStyle = shadedFill(ctx, r, color);
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.55);
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.7, Math.PI * 0.62, Math.PI * 1.38);
  ctx.strokeStyle = darken(color, 0.4);
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.78, side * r * 0.14);
    ctx.lineTo(r * 1.08, side * r * 0.3);
    ctx.lineTo(r * 0.8, side * r * 0.36);
    ctx.closePath();
    ctx.fillStyle = bone;
    ctx.fill();
  }
  eyes(ctx, r * 0.38, r * 0.36, r * 0.24);
};

const brute: BodyPainter = (ctx, r, color) => {
  ctx.beginPath();
  ctx.ellipse(-r * 0.05, 0, r * 0.95, r * 0.9, 0, 0, TAU);
  ctx.fillStyle = shadedFill(ctx, r, color);
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.6);
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-r * 0.05, 0, r * 0.95, Math.PI * 0.6, Math.PI * 1.4);
  ctx.arc(-r * 0.05, 0, r * 0.45, Math.PI * 1.4, Math.PI * 0.6, true);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, -r, -r, -r * 0.2, r, STEEL);
  ctx.fill();
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();

  for (const side of [-1, 1]) {
    circle(ctx, -r * 0.05, side * r * 0.82, r * 0.4);
    ctx.fillStyle = radial(
      ctx,
      -r * 0.05,
      side * r * 0.82,
      r * 0.4,
      STEEL,
      -r * 0.15,
      side * r * 0.72,
    );
    ctx.fill();
    ctx.strokeStyle = "#1f2937";
    ctx.stroke();
    circle(ctx, -r * 0.05, side * r * 0.82, r * 0.08);
    ctx.fillStyle = "#e5e7eb";
    ctx.fill();
  }

  circle(ctx, r * 0.42, 0, r * 0.48);
  ctx.fillStyle = radial(ctx, r * 0.42, 0, r * 0.48, STEEL, r * 0.3, -r * 0.18);
  ctx.fill();
  ctx.strokeStyle = "#1f2937";
  ctx.stroke();
  ctx.fillStyle = "#0b0f14";
  ctx.beginPath();
  ctx.roundRect(r * 0.55, -r * 0.3, r * 0.3, r * 0.6, r * 0.08);
  ctx.fill();
  glowingEyes(ctx, r * 0.72, r * 0.15, r * 0.07, "#fde047");
};

const warden: BodyPainter = (ctx, r, color) => {
  const gold = "#facc15";
  const spikes = 12;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * TAU;
    const reach = i % 2 === 0 ? r * 1.1 : r * 0.9;
    ctx.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
  }
  ctx.closePath();
  ctx.fillStyle = radial(ctx, 0, 0, r * 1.1, [
    [0, darken(color, 0.25)],
    [1, darken(color, 0.7)],
  ]);
  ctx.fill();

  circle(ctx, 0, 0, r * 0.82);
  ctx.fillStyle = shadedFill(ctx, r * 0.82, color);
  ctx.fill();
  circle(ctx, 0, 0, r * 0.62);
  ctx.setLineDash([r * 0.12, r * 0.1]);
  ctx.strokeStyle = withAlpha(lighten(color, 0.6), 0.7);
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i < 5; i++) {
    const angle = Math.PI * (0.62 + (i / 4) * 0.76);
    const cx = Math.cos(angle) * r * 0.2;
    const cy = Math.sin(angle) * r * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle + 0.35) * r * 0.2, cy + Math.sin(angle + 0.35) * r * 0.2);
    ctx.lineTo(cx + Math.cos(angle) * r * 0.55, cy + Math.sin(angle) * r * 0.55);
    ctx.lineTo(cx + Math.cos(angle - 0.35) * r * 0.2, cy + Math.sin(angle - 0.35) * r * 0.2);
    ctx.closePath();
    ctx.fillStyle = gold;
    ctx.fill();
  }
  circle(ctx, -r * 0.05, 0, r * 0.26);
  ctx.strokeStyle = gold;
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();

  circle(ctx, r * 0.42, 0, r * 0.34);
  ctx.fillStyle = shadedFill(ctx, r * 0.34, lighten(color, 0.15));
  ctx.fill();
  glowingEyes(ctx, r * 0.6, r * 0.14, r * 0.07, "#f43f5e");
};

const blob: BodyPainter = (ctx, r, color) => {
  circle(ctx, 0, 0, r);
  ctx.fillStyle = shadedFill(ctx, r, color);
  ctx.fill();
  eyes(ctx, r * 0.4, r * 0.35, r * 0.22);
};

const ART: Readonly<Record<string, EnemyArt>> = {
  runner: { extent: 2.8, body: runner },
  grunt: { extent: 2.6, body: grunt },
  brute: { extent: 2.7, body: brute },
  warden: { extent: 2.5, body: warden },
};

export function enemyArt(id: string): EnemyArt {
  return ART[id] ?? { extent: 2.4, body: blob };
}

/** Feet under the body, stepping with `phase`. Drawn every frame, facing +x. */
export function paintFeet(
  ctx: CanvasRenderingContext2D,
  id: string,
  r: number,
  phase: number,
): void {
  ctx.fillStyle = darken(enemyColor(id), 0.55);
  const stride = Math.sin(phase) * r * 0.38;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * stride, side * r * 0.62, r * 0.32, r * 0.2, 0, 0, TAU);
    ctx.fill();
  }
}
