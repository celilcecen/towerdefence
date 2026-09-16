import { darken, lighten, withAlpha } from "../color";
import { HERO_COLOR, HERO_GOLD, PALETTE } from "../palette";
import { circle, linear, radial, TAU } from "./common";

/** Sprite width as a multiple of the hero's radius: the spear reaches ahead, the cloak trails. */
export const HERO_EXTENT = 4.2;

/**
 * The Sentinel seen from above, facing +x. A cloaked, crystal-armoured
 * figure with a spear held out to one side; the crystal at its tip and the
 * core in its chest carry the hero colour so it reads at a glance among the
 * warm-coloured monsters. `r` is the collision radius in pixels.
 */
export function paintHero(ctx: CanvasRenderingContext2D, r: number): void {
  const teal = HERO_COLOR;
  const steel = "#cbd5e1";

  // Cloak: a teardrop trailing behind, dark with a lit hem.
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, -r * 0.8);
  ctx.quadraticCurveTo(-r * 1.9, -r * 0.55, -r * 1.85, 0);
  ctx.quadraticCurveTo(-r * 1.9, r * 0.55, -r * 0.1, r * 0.8);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, -r * 1.8, 0, 0, 0, [
    [0, "#0f2a2d"],
    [1, "#1f4d4f"],
  ]);
  ctx.fill();
  ctx.strokeStyle = withAlpha(teal, 0.5);
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();

  // Spear along the right flank, crystal tip forward.
  const sy = r * 0.62;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#7c6a4f";
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, sy);
  ctx.lineTo(r * 1.35, sy);
  ctx.stroke();
  ctx.strokeStyle = HERO_GOLD;
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.moveTo(r * 0.2, sy);
  ctx.lineTo(r * 1.3, sy);
  ctx.stroke();
  const tip = r * 1.95;
  circle(ctx, tip - r * 0.2, sy, r * 0.5);
  ctx.fillStyle = radial(ctx, tip - r * 0.2, sy, r * 0.5, [
    [0, withAlpha(teal, 0.55)],
    [1, withAlpha(teal, 0)],
  ]);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tip, sy);
  ctx.lineTo(tip - r * 0.45, sy - r * 0.2);
  ctx.lineTo(tip - r * 0.7, sy);
  ctx.lineTo(tip - r * 0.45, sy + r * 0.2);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, tip - r * 0.7, 0, tip, 0, [
    [0, lighten(teal, 0.6)],
    [1, teal],
  ]);
  ctx.fill();

  // Shoulders, then the armoured torso.
  for (const side of [-1, 1]) {
    circle(ctx, -r * 0.05, side * r * 0.62, r * 0.36);
    ctx.fillStyle = linear(ctx, 0, side * r * 0.3, 0, side * r * 0.95, [
      [0, steel],
      [1, darken(steel, 0.45)],
    ]);
    ctx.fill();
    ctx.strokeStyle = withAlpha(HERO_GOLD, 0.8);
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.7, r * 0.6, 0, 0, TAU);
  ctx.fillStyle = linear(ctx, -r * 0.7, 0, r * 0.7, 0, [
    [0, darken(steel, 0.35)],
    [0.5, steel],
    [1, darken(steel, 0.2)],
  ]);
  ctx.fill();
  ctx.strokeStyle = darken(steel, 0.6);
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.stroke();

  // The crystal core in the chest: the brightest point of the sprite.
  circle(ctx, r * 0.18, 0, r * 0.42);
  ctx.fillStyle = radial(ctx, r * 0.18, 0, r * 0.42, [
    [0, withAlpha(teal, 0.6)],
    [1, withAlpha(teal, 0)],
  ]);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 0.38, 0);
  ctx.lineTo(r * 0.18, -r * 0.2);
  ctx.lineTo(-r * 0.02, 0);
  ctx.lineTo(r * 0.18, r * 0.2);
  ctx.closePath();
  ctx.fillStyle = lighten(teal, 0.35);
  ctx.fill();

  // Hood: a dark cowl with two lit eyes looking forward.
  circle(ctx, -r * 0.12, 0, r * 0.4);
  ctx.fillStyle = linear(ctx, -r * 0.5, 0, r * 0.3, 0, [
    [0, "#14343a"],
    [1, "#2b5f66"],
  ]);
  ctx.fill();
  ctx.strokeStyle = withAlpha(HERO_GOLD, 0.5);
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();
  for (const side of [-1, 1]) {
    circle(ctx, r * 0.1, side * r * 0.14, r * 0.07);
    ctx.fillStyle = lighten(teal, 0.7);
    ctx.fill();
  }
}

/** The soft light the hero casts on the ground; brighter as the nova charges. */
export function paintHeroAura(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  charge: number,
  pulse: number,
): void {
  const reach = r * (2.2 + pulse * 0.25 + charge * 0.6);
  circle(ctx, x, y, reach);
  ctx.fillStyle = radial(ctx, x, y, reach, [
    [0, withAlpha(HERO_COLOR, 0.22 + charge * 0.12)],
    [0.55, withAlpha(charge >= 1 ? HERO_GOLD : HERO_COLOR, 0.08 + charge * 0.06)],
    [1, withAlpha(HERO_COLOR, 0)],
  ]);
  ctx.fill();
}

/** A crystal shard in flight, with a short glowing wake behind it. */
export function paintHeroBolt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  s: number,
): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const length = s * 0.42;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = withAlpha(HERO_COLOR, 0.28);
  ctx.lineWidth = Math.max(2.5, s * 0.14);
  ctx.beginPath();
  ctx.moveTo(x - dx * length, y - dy * length);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const w = Math.max(1.5, s * 0.06);
  const l = Math.max(3, s * 0.2);
  ctx.beginPath();
  ctx.moveTo(l, 0);
  ctx.lineTo(0, -w);
  ctx.lineTo(-l * 0.6, 0);
  ctx.lineTo(0, w);
  ctx.closePath();
  ctx.fillStyle = lighten(HERO_COLOR, 0.65);
  ctx.fill();
  ctx.strokeStyle = HERO_COLOR;
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.stroke();
  ctx.restore();
}

/** Ground shadow shared by the standing and fallen poses. */
export function paintHeroShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.35, r * 1.1, r * 0.62, 0, 0, TAU);
  ctx.fill();
}
