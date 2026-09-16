import { darken, lighten, withAlpha } from "../color";
import { HERO_COLOR, HERO_GOLD, PALETTE } from "../palette";
import { circle, linear, radial, TAU } from "./common";

/** Sprite width as a multiple of the hero's radius: the spear reaches ahead, the cloak trails. */
export const HERO_EXTENT = 4.8;
/** Cloak poses cached as separate sprites; cycling through them makes the cloak ripple. */
export const HERO_FRAMES = 4;

const STEEL = "#cbd5e1";
const STEEL_DARK = "#64748b";
const CLOAK_DARK = "#0b2326";
const CLOAK_MID = "#154447";
const CLOAK_LINING = "#2a7f80";
const HAFT = "#8b6b45";
const HAFT_DARK = "#4a3620";

/** A four-sided crystal facet: a diamond with a lit upper half and a shaded lower half. */
function facet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x - w, y);
  ctx.closePath();
  ctx.fillStyle = lighten(color, 0.45);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x - w, y);
  ctx.closePath();
  ctx.fillStyle = darken(color, 0.15);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x - w, y);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.strokeStyle = withAlpha("#ffffff", 0.55);
  ctx.lineWidth = Math.max(0.75, w * 0.12);
  ctx.stroke();
}

function paintCloak(ctx: CanvasRenderingContext2D, r: number, phase: number): void {
  const wave = (k: number): number => Math.sin(phase * TAU + k) * r * 0.16;
  // Outer cloak: a broad teardrop trailing behind with a rippling, scalloped hem.
  ctx.beginPath();
  ctx.moveTo(r * 0.05, -r * 0.92);
  ctx.quadraticCurveTo(-r * 1.1, -r * 1.05 + wave(0.4), -r * 1.75, -r * 0.55 + wave(1.9));
  ctx.quadraticCurveTo(-r * 2.15, -r * 0.2, -r * 1.95 + wave(3.1), r * 0.05);
  ctx.quadraticCurveTo(-r * 2.15, r * 0.3, -r * 1.75, r * 0.55 + wave(4.4));
  ctx.quadraticCurveTo(-r * 1.1, r * 1.05 + wave(5.6), r * 0.05, r * 0.92);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, -r * 2.1, 0, r * 0.2, 0, [
    [0, CLOAK_DARK],
    [0.6, CLOAK_MID],
    [1, "#1d5c5e"],
  ]);
  ctx.fill();
  ctx.strokeStyle = withAlpha(HERO_COLOR, 0.55);
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.stroke();

  // Lining: a lighter inner fold that catches the light as it moves.
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, -r * 0.55);
  ctx.quadraticCurveTo(-r * 1.2, -r * 0.5 + wave(2.2), -r * 1.5 + wave(3.3), 0);
  ctx.quadraticCurveTo(-r * 1.2, r * 0.5 + wave(4.1), -r * 0.2, r * 0.55);
  ctx.closePath();
  ctx.fillStyle = withAlpha(CLOAK_LINING, 0.55);
  ctx.fill();

  // Rim light along the upper edge, where the crystal light hits the cloth.
  ctx.beginPath();
  ctx.moveTo(r * 0.05, -r * 0.92);
  ctx.quadraticCurveTo(-r * 1.1, -r * 1.05 + wave(0.4), -r * 1.75, -r * 0.55 + wave(1.9));
  ctx.strokeStyle = withAlpha(lighten(HERO_COLOR, 0.3), 0.7);
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.lineCap = "round";
  ctx.stroke();
}

function paintSpear(ctx: CanvasRenderingContext2D, r: number): void {
  const sy = r * 0.68;
  ctx.lineCap = "round";
  // Haft with a darker underside and wrapped grip.
  ctx.strokeStyle = HAFT_DARK;
  ctx.lineWidth = Math.max(2, r * 0.2);
  ctx.beginPath();
  ctx.moveTo(-r * 1.15, sy + r * 0.03);
  ctx.lineTo(r * 1.45, sy + r * 0.03);
  ctx.stroke();
  ctx.strokeStyle = HAFT;
  ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.beginPath();
  ctx.moveTo(-r * 1.15, sy);
  ctx.lineTo(r * 1.45, sy);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(HERO_GOLD, 0.9);
  ctx.lineWidth = Math.max(1, r * 0.05);
  for (let i = 0; i < 4; i++) {
    const gx = -r * 0.55 + i * r * 0.22;
    ctx.beginPath();
    ctx.moveTo(gx, sy - r * 0.1);
    ctx.lineTo(gx + r * 0.08, sy + r * 0.1);
    ctx.stroke();
  }
  // Crossguard: two gold wings just behind the head.
  ctx.fillStyle = HERO_GOLD;
  ctx.beginPath();
  ctx.moveTo(r * 1.3, sy - r * 0.34);
  ctx.lineTo(r * 1.55, sy - r * 0.08);
  ctx.lineTo(r * 1.55, sy + r * 0.08);
  ctx.lineTo(r * 1.3, sy + r * 0.34);
  ctx.lineTo(r * 1.38, sy);
  ctx.closePath();
  ctx.fill();

  // Crystal head: a long faceted blade with a glowing core and a halo.
  const tip = r * 2.25;
  const base = r * 1.5;
  circle(ctx, (tip + base) / 2, sy, r * 0.62);
  ctx.fillStyle = radial(ctx, (tip + base) / 2, sy, r * 0.62, [
    [0, withAlpha(HERO_COLOR, 0.6)],
    [1, withAlpha(HERO_COLOR, 0)],
  ]);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tip, sy);
  ctx.lineTo(base + r * 0.25, sy - r * 0.22);
  ctx.lineTo(base, sy);
  ctx.closePath();
  ctx.fillStyle = lighten(HERO_COLOR, 0.6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tip, sy);
  ctx.lineTo(base + r * 0.25, sy + r * 0.22);
  ctx.lineTo(base, sy);
  ctx.closePath();
  ctx.fillStyle = darken(HERO_COLOR, 0.1);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tip, sy);
  ctx.lineTo(base + r * 0.25, sy - r * 0.22);
  ctx.lineTo(base, sy);
  ctx.lineTo(base + r * 0.25, sy + r * 0.22);
  ctx.closePath();
  ctx.strokeStyle = withAlpha("#ffffff", 0.8);
  ctx.lineWidth = Math.max(0.75, r * 0.05);
  ctx.stroke();
  // Hot white core running down the blade.
  ctx.strokeStyle = withAlpha("#ffffff", 0.9);
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.moveTo(base + r * 0.1, sy);
  ctx.lineTo(tip - r * 0.12, sy);
  ctx.stroke();
}

function paintBody(ctx: CanvasRenderingContext2D, r: number): void {
  // Pauldrons: faceted crystal plates with gold trim and a short spike.
  for (const side of [-1, 1]) {
    const py = side * r * 0.66;
    circle(ctx, -r * 0.05, py, r * 0.4);
    ctx.fillStyle = linear(ctx, 0, py - side * r * 0.4, 0, py + side * r * 0.4, [
      [0, lighten(STEEL, 0.2)],
      [1, STEEL_DARK],
    ]);
    ctx.fill();
    ctx.strokeStyle = HERO_GOLD;
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.stroke();
    facet(ctx, -r * 0.05, py, r * 0.2, r * 0.2, HERO_COLOR);
    ctx.fillStyle = darken(STEEL, 0.25);
    ctx.beginPath();
    ctx.moveTo(-r * 0.22, py + side * r * 0.32);
    ctx.lineTo(-r * 0.05, py + side * r * 0.6);
    ctx.lineTo(r * 0.12, py + side * r * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha(HERO_GOLD, 0.7);
    ctx.lineWidth = Math.max(0.75, r * 0.04);
    ctx.stroke();
  }

  // Torso plate: an oval cuirass with a raised centre ridge.
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.76, r * 0.64, 0, 0, TAU);
  ctx.fillStyle = linear(ctx, -r * 0.76, 0, r * 0.76, 0, [
    [0, STEEL_DARK],
    [0.45, lighten(STEEL, 0.15)],
    [1, darken(STEEL, 0.3)],
  ]);
  ctx.fill();
  ctx.strokeStyle = darken(STEEL, 0.65);
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(HERO_GOLD, 0.85);
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.62, r * 0.5, 0, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.62, 0);
  ctx.lineTo(r * 0.62, 0);
  ctx.stroke();
}

function paintHood(ctx: CanvasRenderingContext2D, r: number): void {
  // The cowl sits forward of the torso's centre, as a head does seen from above.
  const hx = r * 0.08;
  circle(ctx, hx, 0, r * 0.42);
  ctx.fillStyle = linear(ctx, hx - r * 0.5, 0, hx + r * 0.4, 0, [
    [0, "#0f2c31"],
    [1, "#2f7178"],
  ]);
  ctx.fill();
  ctx.strokeStyle = withAlpha(HERO_GOLD, 0.7);
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.stroke();
  // The face is shadow; only the eyes are lit, each with a forward glint.
  ctx.beginPath();
  ctx.ellipse(hx + r * 0.2, 0, r * 0.22, r * 0.3, 0, -Math.PI / 2, Math.PI / 2);
  ctx.fillStyle = withAlpha("#041014", 0.8);
  ctx.fill();
  for (const side of [-1, 1]) {
    const ey = side * r * 0.14;
    circle(ctx, hx + r * 0.26, ey, r * 0.1);
    ctx.fillStyle = withAlpha(HERO_COLOR, 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx + r * 0.38, ey);
    ctx.lineTo(hx + r * 0.26, ey - side * r * 0.045);
    ctx.lineTo(hx + r * 0.16, ey);
    ctx.lineTo(hx + r * 0.26, ey + side * r * 0.045);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
  // The crystal on the crown of the hood: the brightest point of the sprite.
  const cx = hx - r * 0.12;
  circle(ctx, cx, 0, r * 0.5);
  ctx.fillStyle = radial(ctx, cx, 0, r * 0.5, [
    [0, withAlpha(lighten(HERO_COLOR, 0.4), 0.8)],
    [1, withAlpha(HERO_COLOR, 0)],
  ]);
  ctx.fill();
  facet(ctx, cx, 0, r * 0.2, r * 0.26, HERO_COLOR);
  circle(ctx, cx - r * 0.04, -r * 0.07, r * 0.055);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

/**
 * The Sentinel seen from above, facing +x: a cloaked, crystal-armoured figure
 * with a faceted spear held out to one side. The crystal at its tip, the core
 * in its chest and the eyes carry the hero colour so it reads at a glance among
 * the warm-coloured monsters. `r` is the collision radius in pixels; `frame`
 * in [0, HERO_FRAMES) picks the cloak's ripple pose.
 */
export function paintHero(ctx: CanvasRenderingContext2D, r: number, frame = 0): void {
  paintCloak(ctx, r, frame / HERO_FRAMES);
  paintSpear(ctx, r);
  paintBody(ctx, r);
  paintHood(ctx, r);
}

/** The soft light the hero casts on the ground; brighter and warmer as the nova charges. */
export function paintHeroAura(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  charge: number,
  pulse: number,
): void {
  const ready = charge >= 1;
  const reach = r * (2.4 + pulse * 0.3 + charge * 0.7);
  circle(ctx, x, y, reach);
  ctx.fillStyle = radial(ctx, x, y, reach, [
    [0, withAlpha(ready ? HERO_GOLD : HERO_COLOR, 0.26 + charge * 0.14)],
    [0.5, withAlpha(ready ? HERO_GOLD : HERO_COLOR, 0.09 + charge * 0.07)],
    [1, withAlpha(HERO_COLOR, 0)],
  ]);
  ctx.fill();
}

/**
 * The rune circle under the hero's feet: two rings and six rune marks that
 * turn slowly, growing golden as the nova charges. `angle` is the rotation.
 */
export function paintHeroSigil(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  angle: number,
  charge: number,
  pulse: number,
): void {
  const ready = charge >= 1;
  const color = ready ? HERO_GOLD : HERO_COLOR;
  const outer = r * 1.9;
  const inner = r * 1.45;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineCap = "round";
  ctx.strokeStyle = withAlpha(color, 0.22 + charge * 0.2 + (ready ? pulse * 0.25 : 0));
  ctx.lineWidth = Math.max(1, r * 0.08);
  circle(ctx, 0, 0, outer);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(color, 0.16 + charge * 0.14);
  ctx.lineWidth = Math.max(1, r * 0.05);
  circle(ctx, 0, 0, inner);
  ctx.stroke();
  // Runes: six small diamonds on the outer ring, with spokes to the inner ring.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    ctx.strokeStyle = withAlpha(color, 0.18 + charge * 0.2);
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.beginPath();
    ctx.moveTo(cx * inner, cy * inner);
    ctx.lineTo(cx * outer, cy * outer);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx * outer, cy * outer);
    ctx.rotate(a);
    const s = r * 0.16;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(0, -s);
    ctx.lineTo(-s, 0);
    ctx.lineTo(0, s);
    ctx.closePath();
    ctx.fillStyle = withAlpha(lighten(color, 0.3), 0.55 + charge * 0.35);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Three crystal shards orbiting the hero at shoulder height. They circle
 * faster and turn gold as the nova charges, so a ready nova is visible from
 * across the board.
 */
export function paintHeroOrbit(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  angle: number,
  charge: number,
  layer: "back" | "front",
): void {
  const ready = charge >= 1;
  const color = ready ? HERO_GOLD : HERO_COLOR;
  const orbit = r * 1.75;
  const s = r * (0.16 + charge * 0.08);
  for (let i = 0; i < 3; i++) {
    const a = angle + (i / 3) * TAU;
    // Shards on the far side of the orbit pass behind the body.
    if ((layer === "back") !== Math.sin(a) < 0) continue;
    const sx = x + Math.cos(a) * orbit;
    const sy = y + Math.sin(a) * orbit * 0.62;
    circle(ctx, sx, sy, s * 2.2);
    ctx.fillStyle = radial(ctx, sx, sy, s * 2.2, [
      [0, withAlpha(color, 0.5)],
      [1, withAlpha(color, 0)],
    ]);
    ctx.fill();
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a + angle * 2);
    ctx.beginPath();
    ctx.moveTo(s * 1.5, 0);
    ctx.lineTo(0, -s);
    ctx.lineTo(-s * 1.5, 0);
    ctx.lineTo(0, s);
    ctx.closePath();
    ctx.fillStyle = lighten(color, 0.5);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.75, s * 0.25);
    ctx.stroke();
    ctx.restore();
  }
}

/** A crystal shard in flight: a bright faceted head with a long, glowing wake. */
export function paintHeroBolt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  s: number,
): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const length = s * 0.7;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = linear(ctx, x - dx * length, y - dy * length, x, y, [
    [0, withAlpha(HERO_COLOR, 0)],
    [0.7, withAlpha(HERO_COLOR, 0.35)],
    [1, withAlpha(lighten(HERO_COLOR, 0.5), 0.9)],
  ]);
  ctx.lineWidth = Math.max(3, s * 0.16);
  ctx.beginPath();
  ctx.moveTo(x - dx * length, y - dy * length);
  ctx.lineTo(x, y);
  ctx.stroke();
  circle(ctx, x, y, s * 0.2);
  ctx.fillStyle = radial(ctx, x, y, s * 0.2, [
    [0, withAlpha(lighten(HERO_COLOR, 0.6), 0.85)],
    [1, withAlpha(HERO_COLOR, 0)],
  ]);
  ctx.fill();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const w = Math.max(2, s * 0.08);
  const l = Math.max(4, s * 0.26);
  ctx.beginPath();
  ctx.moveTo(l, 0);
  ctx.lineTo(0, -w);
  ctx.lineTo(-l * 0.5, 0);
  ctx.lineTo(0, w);
  ctx.closePath();
  ctx.fillStyle = lighten(HERO_COLOR, 0.75);
  ctx.fill();
  ctx.strokeStyle = HERO_COLOR;
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(l * 0.8, 0);
  ctx.lineTo(-l * 0.3, 0);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, s * 0.03);
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
  ctx.ellipse(x, y + r * 0.35, r * 1.2, r * 0.66, 0, 0, TAU);
  ctx.fill();
}

/**
 * A column of light rising from the ground where the hero returns, drawn in
 * screen space so it always points "up" whatever the board's rotation.
 */
export function paintHeroPillar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
): void {
  const height = s * (2.2 + 1.2 * t);
  const width = s * 0.55 * (1 - t * 0.6);
  ctx.save();
  ctx.globalAlpha = (1 - t) * 0.9;
  ctx.fillStyle = linear(ctx, 0, y, 0, y - height, [
    [0, withAlpha(lighten(HERO_COLOR, 0.6), 0.85)],
    [0.5, withAlpha(HERO_COLOR, 0.35)],
    [1, withAlpha(HERO_COLOR, 0)],
  ]);
  ctx.beginPath();
  ctx.moveTo(x - width, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width * 0.5, y - height);
  ctx.lineTo(x - width * 0.5, y - height);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y, width * 1.4, width * 0.5, 0, 0, TAU);
  ctx.fillStyle = withAlpha(lighten(HERO_COLOR, 0.4), 0.6);
  ctx.fill();
  ctx.restore();
}
