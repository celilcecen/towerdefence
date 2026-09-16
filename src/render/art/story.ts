import { mix, withAlpha } from "../color";
import { paintCrystal } from "./brand";
import type { Stops } from "./common";
import { circle, hash, linear, radial, TAU } from "./common";
import { towerArt, TURRET_SCALE } from "./towers";

/**
 * Story artwork: dialogue portraits, chapter banners, the ending and the title
 * backdrop. Everything is procedural and painted from (0, 0) in CSS pixels;
 * callers apply any pixel-ratio scale first. A `now` of 0 paints a still frame.
 */

export type PortraitSubject = "ilka" | "scout" | "tyrant";

/** A skyline: the y, in pixels, of a landscape layer's top edge `f` of the way across. */
type Skyline = (f: number) => number;

const wrap = (value: number, span: number): number => ((value % span) + span) % span;

function fillAll(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fill: string | CanvasGradient,
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
}

function sky(ctx: CanvasRenderingContext2D, w: number, h: number, stops: Stops): void {
  fillAll(ctx, w, h, linear(ctx, 0, 0, 0, h, stops));
}

function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
): void {
  circle(ctx, x, y, r);
  ctx.fillStyle = radial(ctx, x, y, r, [
    [0, withAlpha(color, alpha)],
    [1, withAlpha(color, 0)],
  ]);
  ctx.fill();
}

/** Smooth rolling noise in about [-1, 1], stable for a seed. */
function wave(x: number, seed: number): number {
  return (
    Math.sin(x * 1.7 + hash(seed, 1) * TAU) * 0.5 +
    Math.sin(x * 3.9 + hash(seed, 2) * TAU) * 0.3 +
    Math.sin(x * 9.1 + hash(seed, 3) * TAU) * 0.2
  );
}

/** Height in [0, 1] of a jagged mountain range `f` of the way across. */
function peaks(f: number, seed: number, count: number): number {
  let top = 0;
  for (let k = 0; k < count; k++) {
    const px = (k + 0.2 + hash(seed, k) * 0.6) / count;
    const height = 0.45 + hash(seed, k, 1) * 0.55;
    const slope = 2.4 + hash(seed, k, 2) * 2.2;
    top = Math.max(top, height - Math.abs(f - px) * slope);
  }
  return Math.max(0, top) + wave(f * 18, seed) * 0.015;
}

function fillSkyline(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  line: Skyline,
  fill: string | CanvasGradient,
): void {
  ctx.beginPath();
  ctx.moveTo(0, h);
  const steps = 72;
  for (let i = 0; i <= steps; i++) ctx.lineTo((i / steps) * w, line(i / steps));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Light catching the top edge of a layer. */
function rimSkyline(
  ctx: CanvasRenderingContext2D,
  w: number,
  line: Skyline,
  color: string,
  width: number,
): void {
  ctx.beginPath();
  const steps = 72;
  for (let i = 0; i <= steps; i++) ctx.lineTo((i / steps) * w, line(i / steps));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function hills(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  base: number,
  amp: number,
  seed: number,
  scale: number,
  fill: string | CanvasGradient,
): Skyline {
  const line: Skyline = (f) => base - wave(f * scale, seed) * amp;
  fillSkyline(ctx, w, h, line, fill);
  return line;
}

function mountains(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  base: number,
  amp: number,
  seed: number,
  count: number,
  fill: string | CanvasGradient,
  snow?: string,
): Skyline {
  const line: Skyline = (f) => base - peaks(f, seed, count) * amp;
  fillSkyline(ctx, w, h, line, fill);
  if (snow !== undefined) {
    // Snow above a ragged line on every peak tall enough to reach it.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    for (let i = 48; i >= 0; i--) {
      const f = i / 48;
      ctx.lineTo(f * w, base - amp * (0.56 + wave(f * 40, seed + 9) * 0.05));
    }
    ctx.closePath();
    ctx.clip();
    fillSkyline(ctx, w, h, line, snow);
    ctx.restore();
  }
  return line;
}

function stars(
  ctx: CanvasRenderingContext2D,
  w: number,
  count: number,
  seed: number,
  now: number,
  maxY: number,
): void {
  ctx.fillStyle = "#ffffff";
  const u = Math.max(1, Math.min(w, maxY * 2));
  for (let i = 0; i < count; i++) {
    const y = hash(seed, i, 1) * maxY;
    const twinkle =
      now === 0 ? 0.75 : 0.5 + 0.5 * Math.sin(now / (500 + hash(seed, i, 2) * 900) + i);
    ctx.globalAlpha = (0.2 + hash(seed, i, 3) * 0.7) * twinkle * (1 - (y / maxY) * 0.6);
    circle(ctx, hash(seed, i) * w, y, Math.max(0.6, u * 0.0022 * (0.5 + hash(seed, i, 4))));
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function clouds(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: number,
  count: number,
  y0: number,
  y1: number,
  color: string,
  now: number,
  speed: number,
): void {
  const span = w * 1.4;
  ctx.fillStyle = color;
  for (let k = 0; k < count; k++) {
    const cx =
      wrap(hash(seed, k) * span + (now / 1000) * speed * (0.5 + hash(seed, k, 1)), span) - w * 0.2;
    const cy = y0 + (y1 - y0) * hash(seed, k, 2);
    const size = h * (0.04 + hash(seed, k, 3) * 0.05);
    // One path per cloud so overlapping puffs do not stack their alpha.
    ctx.beginPath();
    for (let j = 0; j < 5; j++) {
      const px = cx + (j - 2) * size * 0.95;
      const py = cy - Math.sin((j / 4) * Math.PI) * size * 0.45;
      const r = size * (0.7 + hash(seed, k * 7 + j, 4) * 0.5);
      ctx.moveTo(px + r, py);
      ctx.ellipse(px, py, r, r * 0.6, 0, 0, TAU);
    }
    ctx.fill();
  }
}

/** Glowing specks drifting through a horizontal band: fireflies, snow, embers, motes. */
function motes(
  ctx: CanvasRenderingContext2D,
  w: number,
  count: number,
  seed: number,
  now: number,
  color: string,
  vy: number,
  size: number,
  y0: number,
  y1: number,
): void {
  const span = Math.max(1, y1 - y0);
  const t = now / 1000;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = wrap(hash(seed, i) * w + Math.sin(t * 0.6 + i) * w * 0.015, w);
    const y = y0 + wrap(hash(seed, i, 1) * span + t * vy * (0.5 + hash(seed, i, 2)), span);
    const twinkle = now === 0 ? 0.8 : 0.5 + 0.5 * Math.sin(t * (2 + hash(seed, i, 3) * 3) + i);
    const r = size * (0.5 + hash(seed, i, 4));
    ctx.globalAlpha = 0.16 * twinkle;
    circle(ctx, x, y, r * 3.2);
    ctx.fill();
    ctx.globalAlpha = 0.9 * twinkle;
    circle(ctx, x, y, r);
    ctx.fill();
  }
  ctx.restore();
}

function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number): void {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(w / 2, h / 2);
  ctx.fillStyle = radial(ctx, 0, 0, Math.SQRT2, [
    [0.55, "rgba(0, 0, 0, 0)"],
    [1, `rgba(0, 0, 0, ${strength})`],
  ]);
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

/** A red tear in the sky, ragged edged and white hot along its seam. */
function riftTear(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  width: number,
  angle: number,
  now: number,
  seed: number,
): void {
  const flicker = now === 0 ? 0.85 : 0.75 + 0.25 * Math.sin(now / 240);
  glow(ctx, x, y, length * 0.95, "#f43f5e", 0.5 * flicker);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const steps = 10;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const along = (f - 0.5) * length;
    const bulge = Math.sin(Math.PI * f);
    const zig = (hash(seed, i) - 0.5) * width * 0.9 * bulge;
    left.push([-width * bulge * (0.55 + hash(seed, i, 1) * 0.45) + zig, along]);
    right.push([width * bulge * (0.55 + hash(seed, i, 2) * 0.45) + zig, along]);
  }
  ctx.beginPath();
  for (const [px, py] of left) ctx.lineTo(px, py);
  for (const [px, py] of right.reverse()) ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, -width, 0, width, 0, [
    [0, "#4c0519"],
    [0.35, "#e11d48"],
    [0.5, "#fff1f2"],
    [0.65, "#e11d48"],
    [1, "#4c0519"],
  ]);
  ctx.fill();
  ctx.strokeStyle = withAlpha("#fecdd3", 0.7 * flicker);
  ctx.lineWidth = Math.max(1, width * 0.1);
  ctx.lineJoin = "round";
  ctx.stroke();

  // Crackles reaching out from the tear.
  ctx.beginPath();
  for (let k = 0; k < 5; k++) {
    const side = k % 2 === 0 ? -1 : 1;
    const from = (side < 0 ? left : right)[2 + ((k * 3) % 7)];
    if (!from) continue;
    let px = from[0];
    let py = from[1];
    ctx.moveTo(px, py);
    for (let j = 0; j < 3; j++) {
      px += side * width * (0.8 + hash(seed, k, j + 10));
      py += (hash(seed, k, j + 20) - 0.5) * width * 1.6;
      ctx.lineTo(px, py);
    }
  }
  ctx.strokeStyle = withAlpha("#fda4af", 0.55 * flicker);
  ctx.lineWidth = Math.max(1, width * 0.06);
  ctx.stroke();
  ctx.restore();
}

/** A great swirling rift seen at a low angle; `strength` scales its light. */
function vortex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  now: number,
  strength = 1,
): void {
  const spin = (now / 16000) * TAU;
  glow(ctx, cx, cy, radius * 1.25, "#a21caf", 0.45 * strength);
  glow(ctx, cx, cy, radius * 0.7, "#7c3aed", 0.35 * strength);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let arm = 0; arm < 7; arm++) {
    ctx.beginPath();
    for (let k = 0; k <= 40; k++) {
      const f = k / 40;
      const a = spin + (arm / 7) * TAU + f * TAU * 1.1;
      const r = radius * (0.06 + f * 0.94);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.62);
    }
    ctx.strokeStyle = withAlpha(arm % 2 === 0 ? "#e879f9" : "#8b5cf6", 0.2 * strength);
    ctx.lineWidth = radius * 0.08;
    ctx.stroke();
    ctx.strokeStyle = withAlpha("#fdf4ff", 0.2 * strength);
    ctx.lineWidth = Math.max(1, radius * 0.012);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.62);
  circle(ctx, 0, 0, radius * 0.3);
  ctx.fillStyle = radial(ctx, 0, 0, radius * 0.3, [
    [0, withAlpha("#ffffff", 0.95 * strength)],
    [0.3, withAlpha("#f0abfc", 0.75 * strength)],
    [1, withAlpha("#a21caf", 0)],
  ]);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius * 0.07, radius * 0.045, 0, 0, TAU);
  ctx.fillStyle = "#12001c";
  ctx.fill();
  ctx.strokeStyle = withAlpha("#fbcfe8", 0.9 * strength);
  ctx.lineWidth = Math.max(1, radius * 0.01);
  ctx.stroke();
}

/** The Rift Tyrant standing at `base`, `height` from feet to shoulders; horns rise above. */
function tyrantFigure(
  ctx: CanvasRenderingContext2D,
  cx: number,
  base: number,
  height: number,
  rim: string,
  now: number,
): void {
  const s = height;
  // Left half from the foot of the cape up to the crown; the right half mirrors it.
  const half: readonly (readonly [number, number])[] = [
    [0.5, 0],
    [0.42, -0.3],
    [0.32, -0.56],
    [0.38, -0.66],
    [0.54, -0.82],
    [0.28, -0.73],
    [0.15, -0.77],
    [0.13, -0.87],
    [0.14, -0.93],
    [0.25, -0.99],
    [0.34, -1.1],
    [0.38, -1.26],
    [0.3, -1.13],
    [0.2, -1.04],
    [0.1, -1.01],
    [0.07, -1.08],
    [0.035, -1.01],
    [0, -1.15],
  ];
  ctx.beginPath();
  for (const [x, y] of half) ctx.lineTo(cx - x * s, base + y * s);
  for (let i = half.length - 2; i >= 0; i--) {
    const p = half[i];
    if (p) ctx.lineTo(cx + p[0] * s, base + p[1] * s);
  }
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, base - s * 1.2, 0, base, [
    [0, "#14061f"],
    [1, "#040106"],
  ]);
  ctx.fill();
  ctx.strokeStyle = withAlpha(rim, 0.8);
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.lineJoin = "round";
  ctx.stroke();

  const flicker = now === 0 ? 1 : 0.8 + 0.2 * Math.sin(now / 180);
  for (const side of [-1, 1]) {
    const ex = cx + side * s * 0.05;
    const ey = base - s * 0.9;
    glow(ctx, ex, ey, s * 0.07, "#fde047", 0.6 * flicker);
    ctx.beginPath();
    ctx.ellipse(ex, ey, s * 0.028, s * 0.009, side * 0.35, 0, TAU);
    ctx.fillStyle = "#fef9c3";
    ctx.fill();
  }
  glow(ctx, cx, base - s * 1.1, s * 0.12, "#f0abfc", 0.55 * flicker);
}

function flyer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  flap: number,
): void {
  const lift = (flap - 0.5) * size * 0.7;
  ctx.beginPath();
  ctx.moveTo(x - size, y - lift);
  ctx.quadraticCurveTo(x - size * 0.5, y - size * 0.3 - lift * 0.5, x - size * 0.12, y);
  ctx.lineTo(x, y - size * 0.1);
  ctx.lineTo(x + size * 0.12, y);
  ctx.quadraticCurveTo(x + size * 0.5, y - size * 0.3 - lift * 0.5, x + size, y - lift);
  ctx.quadraticCurveTo(x + size * 0.55, y + size * 0.04, x + size * 0.18, y + size * 0.14);
  ctx.lineTo(x, y + size * 0.5);
  ctx.lineTo(x - size * 0.18, y + size * 0.14);
  ctx.quadraticCurveTo(x - size * 0.55, y + size * 0.04, x - size, y - lift);
  ctx.fill();
}

function pine(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  height: number,
  color: string,
  snow: boolean,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x - height * 0.03, base - height * 0.15, height * 0.06, height * 0.15);
  for (let tier = 0; tier < 3; tier++) {
    const top = base - height + tier * height * 0.26;
    const bottom = top + height * 0.46;
    const half = height * (0.16 + tier * 0.08);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x - half, bottom);
    ctx.lineTo(x + half, bottom);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (snow) {
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x - half * 0.45, top + height * 0.2);
      ctx.quadraticCurveTo(x, top + height * 0.14, x + half * 0.3, top + height * 0.17);
      ctx.closePath();
      ctx.fillStyle = "rgba(236, 244, 252, 0.85)";
      ctx.fill();
    }
  }
}

function roundTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  r: number,
  dark: string,
  light: string,
): void {
  ctx.fillStyle = dark;
  ctx.fillRect(x - r * 0.12, base - r * 0.9, r * 0.24, r * 0.9);
  circle(ctx, x, base - r * 1.5, r);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, base - r * 1.5, r * 0.85, Math.PI * 1.05, Math.PI * 1.6);
  ctx.strokeStyle = light;
  ctx.lineWidth = r * 0.18;
  ctx.lineCap = "round";
  ctx.stroke();
}

function house(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  size: number,
  wall: string,
  roof: string,
  light: string,
): void {
  const height = size * 0.7;
  ctx.fillStyle = wall;
  ctx.fillRect(x - size / 2, base - height, size, height);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.62, base - height);
  ctx.lineTo(x, base - height - size * 0.48);
  ctx.lineTo(x + size * 0.62, base - height);
  ctx.closePath();
  ctx.fillStyle = roof;
  ctx.fill();
  glow(ctx, x + size * 0.1, base - height * 0.5, size * 0.4, light, 0.35);
  ctx.fillStyle = light;
  ctx.fillRect(x + size * 0.02, base - height * 0.62, size * 0.18, size * 0.18);
}

/** A beam of light rising from a crystal, gently pulsing. */
function beam(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  width: number,
  height: number,
  color: string,
  now: number,
): void {
  const pulse = now === 0 ? 0.7 : 0.55 + 0.45 * Math.sin(now / 800);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = linear(ctx, 0, base - height, 0, base, [
    [0, withAlpha(color, 0)],
    [1, withAlpha(color, 0.35 * pulse)],
  ]);
  ctx.beginPath();
  ctx.moveTo(x - width * 0.2, base - height);
  ctx.lineTo(x + width * 0.2, base - height);
  ctx.lineTo(x + width / 2, base);
  ctx.lineTo(x - width / 2, base);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function volcano(
  ctx: CanvasRenderingContext2D,
  cx: number,
  base: number,
  width: number,
  height: number,
  color: string,
  now: number,
  seed: number,
): void {
  const top = base - height;
  const crater = width * 0.11;
  // Smoke first, so the cone sits in front of its own plume.
  for (let k = 0; k < 8; k++) {
    const f = wrap(k / 8 + now / 14000, 1);
    const px = cx + f * width * 0.28 + Math.sin(f * 5 + seed) * width * 0.03;
    const py = top - f * height * 0.95;
    const r = width * (0.05 + f * 0.13);
    ctx.fillStyle = `rgba(38, 18, 16, ${(1 - f) * 0.55})`;
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.75, 0, 0, TAU);
    ctx.fill();
  }
  glow(ctx, cx, top, width * 0.3, "#f97316", 0.55);
  ctx.beginPath();
  ctx.moveTo(cx - width / 2, base);
  ctx.quadraticCurveTo(cx - width * 0.2, base - height * 0.55, cx - crater, top);
  ctx.lineTo(cx - crater * 0.4, top + height * 0.03);
  ctx.lineTo(cx + crater * 0.3, top + height * 0.02);
  ctx.lineTo(cx + crater, top);
  ctx.quadraticCurveTo(cx + width * 0.2, base - height * 0.55, cx + width / 2, base);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, top, 0, base, [
    [0, mix(color, "#7c2d12", 0.4)],
    [1, color],
  ]);
  ctx.fill();
  ctx.lineCap = "round";
  for (let k = 0; k < 3; k++) {
    const sx = cx + (k - 1) * crater * 0.7;
    ctx.beginPath();
    ctx.moveTo(sx, top + height * 0.02);
    ctx.quadraticCurveTo(
      sx + (k - 1) * width * 0.08,
      top + height * 0.35,
      sx + (k - 1) * width * (0.1 + hash(seed, k) * 0.08),
      top + height * (0.45 + hash(seed, k, 1) * 0.25),
    );
    ctx.strokeStyle = "rgba(249, 115, 22, 0.25)";
    ctx.lineWidth = height * 0.04;
    ctx.stroke();
    ctx.strokeStyle = "#fb923c";
    ctx.lineWidth = Math.max(1, height * 0.012);
    ctx.stroke();
  }
}

function keep(ctx: CanvasRenderingContext2D, x: number, base: number, s: number): void {
  const color = "#0b0504";
  const teeth = (left: number, top: number, width: number): void => {
    const count = 4;
    const tooth = width / (count * 2 - 1);
    for (let i = 0; i < count; i++) {
      ctx.fillRect(left + i * tooth * 2, top - tooth, tooth, tooth);
    }
  };
  ctx.fillStyle = color;
  ctx.fillRect(x - s * 0.3, base - s * 0.55, s * 0.6, s * 0.55);
  teeth(x - s * 0.3, base - s * 0.55, s * 0.6);
  for (const side of [-1, 1]) {
    const tx = x + side * s * 0.34;
    ctx.fillRect(tx - s * 0.1, base - s * 0.82, s * 0.2, s * 0.82);
    ctx.beginPath();
    ctx.moveTo(tx - s * 0.13, base - s * 0.82);
    ctx.lineTo(tx, base - s * 1.04);
    ctx.lineTo(tx + s * 0.13, base - s * 0.82);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillRect(x - s * 0.12, base - s * 0.98, s * 0.24, s * 0.45);
  teeth(x - s * 0.12, base - s * 0.98, s * 0.24);
  ctx.fillRect(x - s * 0.005, base - s * 1.22, s * 0.01, s * 0.22);
  ctx.beginPath();
  ctx.moveTo(x + s * 0.005, base - s * 1.22);
  ctx.lineTo(x + s * 0.14, base - s * 1.18);
  ctx.lineTo(x + s * 0.005, base - s * 1.13);
  ctx.fillStyle = "#991b1b";
  ctx.fill();
  for (const [wx, wy] of [
    [-0.34, -0.6],
    [0.34, -0.6],
    [0, -0.78],
    [-0.15, -0.3],
    [0.15, -0.3],
  ] as const) {
    glow(ctx, x + wx * s, base + wy * s, s * 0.06, "#fb923c", 0.5);
    ctx.fillStyle = "#fdba74";
    ctx.fillRect(x + wx * s - s * 0.012, base + wy * s - s * 0.03, s * 0.024, s * 0.05);
  }
}

function forge(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  s: number,
  now: number,
  seed: number,
): void {
  const flicker = now === 0 ? 0.8 : 0.65 + 0.35 * Math.sin(now / (90 + seed * 20) + seed);
  ctx.fillStyle = "#0e0605";
  ctx.fillRect(x - s * 0.5, base - s * 0.5, s, s * 0.5);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.55, base - s * 0.5);
  ctx.lineTo(x + s * 0.2, base - s * 0.78);
  ctx.lineTo(x + s * 0.55, base - s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x + s * 0.22, base - s * 1.05, s * 0.14, s * 0.4);
  glow(ctx, x + s * 0.29, base - s * 1.08, s * 0.3, "#f97316", 0.55 * flicker);
  glow(ctx, x - s * 0.12, base - s * 0.15, s * 0.45, "#fb923c", 0.45 * flicker);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.24, base);
  ctx.lineTo(x - s * 0.24, base - s * 0.22);
  ctx.arc(x - s * 0.12, base - s * 0.22, s * 0.12, Math.PI, 0);
  ctx.lineTo(x, base);
  ctx.closePath();
  ctx.fillStyle = withAlpha("#fdba74", 0.9 * flicker);
  ctx.fill();
}

/** A broken crystal spire, dark with a lit edge. */
function shard(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  width: number,
  height: number,
  lean: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x - width / 2, base);
  ctx.lineTo(x - width * 0.3 + lean * height, base - height);
  ctx.lineTo(x + width * 0.05 + lean * height, base - height * 0.88);
  ctx.lineTo(x + width * 0.2 + lean * height * 0.9, base - height * 0.94);
  ctx.lineTo(x + width / 2, base);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, base - height, 0, base, [
    [0, "#2e1848"],
    [1, "#0a0510"],
  ]);
  ctx.fill();
  ctx.strokeStyle = withAlpha("#c084fc", 0.6);
  ctx.lineWidth = Math.max(1, width * 0.04);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.lineTo(x + width * 0.05 + lean * height, base - height * 0.88);
  ctx.strokeStyle = withAlpha("#e9d5ff", 0.25);
  ctx.stroke();
}

function meadowScene(ctx: CanvasRenderingContext2D, w: number, h: number, now: number): void {
  const u = Math.min(w, h);
  sky(ctx, w, h, [
    [0, "#131d38"],
    [0.35, "#34507a"],
    [0.6, "#c98a7a"],
    [0.8, "#f2b57d"],
    [1, "#f6d39a"],
  ]);
  stars(ctx, w, 40, 3, now, h * 0.3);
  glow(ctx, w * 0.74, h * 0.64, u * 0.85, "#fde68a", 0.55);
  glow(ctx, w * 0.74, h * 0.64, u * 0.09, "#fff7e0", 0.95);
  clouds(ctx, w, h, 5, 4, h * 0.3, h * 0.5, "rgba(255, 226, 210, 0.2)", now, w * 0.012);
  riftTear(ctx, w * 0.24, h * 0.26, h * 0.38, u * 0.05, 0.32, now, 7);

  hills(
    ctx,
    w,
    h,
    h * 0.64,
    h * 0.035,
    11,
    2.4,
    linear(ctx, 0, h * 0.58, 0, h * 0.75, [
      [0, "#7d9089"],
      [1, "#5d7470"],
    ]),
  );
  const mid = hills(
    ctx,
    w,
    h,
    h * 0.73,
    h * 0.05,
    12,
    1.8,
    linear(ctx, 0, h * 0.66, 0, h * 0.85, [
      [0, "#4a7e55"],
      [1, "#2d5638"],
    ]),
  );
  rimSkyline(ctx, w, mid, withAlpha("#fde68a", 0.35), Math.max(1, h * 0.004));

  [
    [0.57, 1],
    [0.61, 1.2],
    [0.645, 0.9],
    [0.76, 1],
    [0.8, 1.15],
  ].forEach(([f = 0, size = 1]) => {
    house(ctx, f * w, mid(f) + u * 0.012, u * 0.05 * size, "#3b2f2a", "#7f2d1f", "#fcd34d");
  });
  const crystalBase = mid(0.7);
  beam(ctx, w * 0.7, crystalBase - u * 0.12, u * 0.08, h * 0.6, "#86efac", now);
  paintCrystal(ctx, w * 0.7, crystalBase - u * 0.13, u * 0.2);

  const near = hills(
    ctx,
    w,
    h,
    h * 0.84,
    h * 0.05,
    13,
    1.5,
    linear(ctx, 0, h * 0.78, 0, h, [
      [0, "#2c5a34"],
      [1, "#1a3a22"],
    ]),
  );
  for (let k = 0; k < 9; k++) {
    const f = (k + 0.3 + hash(13, k) * 0.4) / 9;
    roundTree(
      ctx,
      f * w,
      near(f) + u * 0.02,
      u * (0.03 + hash(13, k, 1) * 0.025),
      "#163020",
      "#3f7a4c",
    );
  }
  const ground = hills(ctx, w, h, h * 0.95, h * 0.02, 14, 3, "#0e1f14");
  ctx.strokeStyle = "#0e1f14";
  ctx.lineWidth = Math.max(1, u * 0.004);
  ctx.beginPath();
  for (let k = 0; k < 70; k++) {
    const x = hash(14, k) * w;
    const y = ground(x / w) + u * 0.004;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (hash(14, k, 1) - 0.5) * u * 0.02, y - u * (0.015 + hash(14, k, 2) * 0.025));
  }
  ctx.stroke();
  motes(ctx, w, 26, 15, now, "#fde68a", -h * 0.02, u * 0.004, h * 0.55, h);
}

function frostScene(ctx: CanvasRenderingContext2D, w: number, h: number, now: number): void {
  const u = Math.min(w, h);
  sky(ctx, w, h, [
    [0, "#060b1c"],
    [0.4, "#122545"],
    [0.75, "#3d5f86"],
    [1, "#7d9fc2"],
  ]);
  stars(ctx, w, 90, 21, now, h * 0.6);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let band = 0; band < 2; band++) {
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const f = i / 48;
      const y = h * (0.16 + band * 0.1) + wave(f * 2.2 + now / 20000 + band, 31 + band) * h * 0.06;
      ctx.lineTo(f * w, y);
    }
    ctx.strokeStyle = linear(ctx, 0, 0, w, 0, [
      [0, "rgba(52, 211, 153, 0)"],
      [0.3, "rgba(52, 211, 153, 0.32)"],
      [0.7, "rgba(56, 189, 248, 0.26)"],
      [1, "rgba(56, 189, 248, 0)"],
    ]);
    ctx.lineWidth = h * (0.08 - band * 0.025);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, h * 0.01);
    ctx.stroke();
  }
  ctx.restore();
  glow(ctx, w * 0.8, h * 0.17, u * 0.25, "#e0f2fe", 0.35);
  circle(ctx, w * 0.8, h * 0.17, u * 0.05);
  ctx.fillStyle = "#f1f5f9";
  ctx.fill();

  mountains(
    ctx,
    w,
    h,
    h * 0.66,
    h * 0.4,
    21,
    6,
    linear(ctx, 0, h * 0.26, 0, h * 0.66, [
      [0, "#4b6a90"],
      [1, "#2a4263"],
    ]),
    "#e3eefa",
  );
  mountains(
    ctx,
    w,
    h,
    h * 0.75,
    h * 0.3,
    22,
    5,
    linear(ctx, 0, h * 0.45, 0, h * 0.75, [
      [0, "#2a4466"],
      [1, "#172a45"],
    ]),
    "#f8fbff",
  );

  ctx.fillStyle = "#0a1426";
  for (let k = 0; k < 5; k++) {
    const x =
      wrap(hash(41, k) * w * 1.3 + (now / 1000) * w * 0.03 * (0.6 + hash(41, k, 1)), w * 1.3) -
      w * 0.15;
    const flap = now === 0 ? 0.3 + hash(41, k, 3) * 0.5 : 0.5 + 0.5 * Math.sin(now / 150 + k * 1.7);
    flyer(ctx, x, h * (0.28 + hash(41, k, 2) * 0.18), u * (0.03 + hash(41, k, 4) * 0.025), flap);
  }

  const field = hills(
    ctx,
    w,
    h,
    h * 0.8,
    h * 0.015,
    23,
    2,
    linear(ctx, 0, h * 0.78, 0, h, [
      [0, "#c3d2e3"],
      [1, "#8a9fb8"],
    ]),
  );
  for (let k = 0; k < 26; k++) {
    const f = (k + hash(24, k)) / 26;
    pine(ctx, f * w, field(f) + u * 0.01, u * (0.05 + hash(24, k, 1) * 0.04), "#12233b", false);
  }
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.885, w * 0.4, h * 0.07, 0, 0, TAU);
  ctx.fillStyle = linear(ctx, 0, h * 0.815, 0, h * 0.955, [
    [0, "#a9cdee"],
    [1, "#4f7aa5"],
  ]);
  ctx.fill();
  ctx.strokeStyle = "#e2ecf6";
  ctx.lineWidth = Math.max(1, h * 0.006);
  ctx.stroke();
  ctx.clip();
  glow(ctx, w * 0.66, h * 0.88, u * 0.14, "#ffffff", 0.35);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = Math.max(1, u * 0.003);
  ctx.beginPath();
  for (let k = 0; k < 5; k++) {
    let x = w * (0.2 + hash(25, k) * 0.6);
    let y = h * (0.84 + hash(25, k, 1) * 0.08);
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (hash(25, k, j + 2) - 0.3) * w * 0.05;
      y += (hash(25, k, j + 7) - 0.5) * h * 0.02;
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();

  for (const [f, scale] of [
    [0.03, 1.1],
    [0.1, 0.85],
    [0.9, 0.95],
    [0.97, 1.2],
  ] as const) {
    pine(ctx, f * w, h * 1.0, u * 0.26 * scale, "#07111f", true);
  }
  hills(ctx, w, h, h * 0.975, h * 0.02, 26, 2, "#dfe8f2");
  motes(ctx, w, 70, 27, now, "#ffffff", h * 0.06, u * 0.003, 0, h);
}

function ashScene(ctx: CanvasRenderingContext2D, w: number, h: number, now: number): void {
  const u = Math.min(w, h);
  sky(ctx, w, h, [
    [0, "#0a0405"],
    [0.4, "#26100c"],
    [0.72, "#5e1f10"],
    [1, "#a33d14"],
  ]);
  glow(ctx, w * 0.45, h * 0.8, w * 0.6, "#f97316", 0.3);
  clouds(ctx, w, h, 51, 6, h * 0.08, h * 0.4, "rgba(20, 8, 8, 0.55)", now, w * 0.008);
  volcano(ctx, w * 0.3, h * 0.72, w * 0.62, h * 0.42, "#2a120e", now, 1);
  volcano(ctx, w * 0.8, h * 0.74, w * 0.4, h * 0.26, "#200d0b", now, 2);
  hills(ctx, w, h, h * 0.75, h * 0.02, 52, 3, "#150806");

  ctx.beginPath();
  ctx.moveTo(w * 0.6, h * 0.82);
  ctx.lineTo(w * 0.68, h * 0.66);
  ctx.lineTo(w * 0.75, h * 0.6);
  ctx.lineTo(w * 0.91, h * 0.59);
  ctx.lineTo(w * 0.97, h * 0.67);
  ctx.lineTo(w * 1.02, h * 0.82);
  ctx.closePath();
  ctx.fillStyle = "#0e0605";
  ctx.fill();
  keep(ctx, w * 0.83, h * 0.6, u * 0.24);

  // A river of lava winding towards the viewer.
  ctx.save();
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(w * 0.56, h * 0.74);
  ctx.bezierCurveTo(w * 0.42, h * 0.8, w * 0.64, h * 0.88, w * 0.38, h * 0.94);
  ctx.quadraticCurveTo(w * 0.2, h * 0.99, w * 0.12, h * 1.06);
  ctx.strokeStyle = "rgba(234, 88, 12, 0.25)";
  ctx.lineWidth = h * 0.09;
  ctx.stroke();
  ctx.strokeStyle = "#ea580c";
  ctx.lineWidth = h * 0.045;
  ctx.stroke();
  ctx.setLineDash([h * 0.06, h * 0.04]);
  ctx.lineDashOffset = -now / 30;
  ctx.strokeStyle = "#fde047";
  ctx.lineWidth = h * 0.016;
  ctx.stroke();
  ctx.restore();

  forge(ctx, w * 0.1, h * 0.84, u * 0.15, now, 1);
  forge(ctx, w * 0.23, h * 0.86, u * 0.11, now, 2);
  hills(ctx, w, h, h * 0.92, h * 0.025, 53, 2.5, "#090403");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(249, 115, 22, 0.55)";
  ctx.lineWidth = Math.max(1, u * 0.004);
  ctx.beginPath();
  for (let k = 0; k < 7; k++) {
    let x = hash(54, k) * w;
    let y = h * (0.94 + hash(54, k, 1) * 0.05);
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (hash(54, k, j + 2) - 0.5) * w * 0.06;
      y += (hash(54, k, j + 6) - 0.5) * h * 0.02;
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
  motes(ctx, w, 60, 55, now, "#fb923c", -h * 0.08, u * 0.0035, 0, h);
}

function riftScene(ctx: CanvasRenderingContext2D, w: number, h: number, now: number): void {
  const u = Math.min(w, h);
  sky(ctx, w, h, [
    [0, "#030107"],
    [0.45, "#13061f"],
    [0.8, "#2a0d36"],
    [1, "#1b0922"],
  ]);
  stars(ctx, w, 70, 61, now, h * 0.7);
  vortex(ctx, w * 0.5, h * 0.34, Math.max(w, h) * 0.46, now);

  if (now > 0) {
    const period = 1300;
    const slot = Math.floor(now / period);
    const phase = (now % period) / period;
    if (hash(slot, 1, 9) > 0.4 && phase < 0.18) {
      let x = w * (0.5 + (hash(slot, 2, 9) - 0.5) * 0.5);
      let y = h * 0.4;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 1 - phase / 0.18;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 8; j++) {
        x += (hash(slot, j, 10) - 0.5) * w * 0.06;
        y += h * 0.045;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(232, 121, 249, 0.4)";
      ctx.lineWidth = u * 0.02;
      ctx.stroke();
      ctx.strokeStyle = "#fdf4ff";
      ctx.lineWidth = Math.max(1, u * 0.004);
      ctx.stroke();
      ctx.restore();
    }
  }

  hills(
    ctx,
    w,
    h,
    h * 0.77,
    h * 0.012,
    62,
    4,
    linear(ctx, 0, h * 0.74, 0, h * 0.9, [
      [0, "#1e0e2b"],
      [1, "#120819"],
    ]),
  );
  for (const [f, width, height, lean] of [
    [0.1, 0.07, 0.3, 0.08],
    [0.17, 0.05, 0.19, -0.1],
    [0.24, 0.035, 0.1, 0.15],
    [0.78, 0.04, 0.12, -0.12],
    [0.86, 0.075, 0.34, -0.06],
    [0.94, 0.05, 0.18, 0.1],
  ] as const) {
    shard(ctx, f * w, h * 0.81, width * w, height * h, lean);
  }
  glow(ctx, w * 0.5, h * 0.6, h * 0.34, "#c026d3", 0.35);
  tyrantFigure(ctx, w * 0.5, h * 0.81, h * 0.3, "#f0abfc", now);

  hills(
    ctx,
    w,
    h,
    h * 0.86,
    h * 0.01,
    63,
    3,
    linear(ctx, 0, h * 0.84, 0, h, [
      [0, "#170b22"],
      [1, "#050208"],
    ]),
  );
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let k = 0; k < 7; k++) {
    let x = w * 0.5;
    let y = h * 0.87;
    const angle = Math.PI * (0.12 + (k / 6) * 0.76);
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += Math.cos(angle) * w * 0.07 + (hash(64, k, j) - 0.5) * w * 0.03;
      y += Math.sin(angle) * h * 0.03;
      ctx.lineTo(x, y);
    }
  }
  ctx.strokeStyle = "rgba(168, 85, 247, 0.18)";
  ctx.lineWidth = u * 0.02;
  ctx.stroke();
  ctx.strokeStyle = "rgba(216, 180, 254, 0.6)";
  ctx.lineWidth = Math.max(1, u * 0.004);
  ctx.stroke();
  ctx.restore();
  motes(ctx, w, 40, 65, now, "#e879f9", -h * 0.03, u * 0.004, 0, h);
}

/**
 * An illustrated, lightly animated banner for a chapter intro: the meadow
 * under a torn sky, frozen peaks with harriers aloft, volcanic forges and the
 * burning keep, or the dead plain beneath the Tyrant's rift. Unknown themes
 * get the meadow.
 */
export function paintChapterScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  chapterTheme: string,
  now: number,
): void {
  if (width <= 0 || height <= 0) return;
  ctx.save();
  switch (chapterTheme) {
    case "frost":
      frostScene(ctx, width, height, now);
      break;
    case "ash":
      ashScene(ctx, width, height, now);
      break;
    case "rift":
      riftScene(ctx, width, height, now);
      break;
    default:
      meadowScene(ctx, width, height, now);
  }
  vignette(ctx, width, height, 0.55);
  ctx.restore();
}

/** Dawn over the Greenreach: the rift sealing itself shut and the crystals shining again. */
export function paintEnding(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  now: number,
): void {
  if (width <= 0 || height <= 0) return;
  const w = width;
  const h = height;
  const u = Math.min(w, h);
  ctx.save();
  sky(ctx, w, h, [
    [0, "#17224d"],
    [0.3, "#5b4a8f"],
    [0.55, "#e0829a"],
    [0.75, "#f8b778"],
    [1, "#fde7b0"],
  ]);
  stars(ctx, w, 30, 70, now, h * 0.22);

  const sunX = w * 0.5;
  const sunY = h * 0.72;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(sunX, sunY);
  ctx.rotate(now / 40000);
  ctx.fillStyle = "rgba(255, 247, 214, 0.07)";
  const rayLength = Math.max(w, h) * 0.95;
  for (let k = 0; k < 14; k++) {
    const angle = (k / 14) * TAU;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle - 0.05) * rayLength, Math.sin(angle - 0.05) * rayLength);
    ctx.lineTo(Math.cos(angle + 0.05) * rayLength, Math.sin(angle + 0.05) * rayLength);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  glow(ctx, sunX, sunY, u * 0.9, "#fde68a", 0.6);
  circle(ctx, sunX, sunY, u * 0.1);
  ctx.fillStyle = "#fffbeb";
  ctx.fill();

  // The rift, stitched shut with threads of gold light.
  ctx.save();
  ctx.translate(w * 0.24, h * 0.22);
  ctx.rotate(0.3);
  const seam = h * 0.24;
  glow(ctx, 0, 0, seam * 0.7, "#fbcfe8", 0.25);
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    ctx.lineTo((hash(72, i) - 0.5) * u * 0.012, (i / 8 - 0.5) * seam);
  }
  ctx.strokeStyle = "rgba(251, 207, 232, 0.55)";
  ctx.lineWidth = Math.max(1, u * 0.005);
  ctx.stroke();
  ctx.strokeStyle = "#fde68a";
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let k = 0; k < 7; k++) {
    const y = ((k + 0.5) / 7 - 0.5) * seam;
    ctx.moveTo(-u * 0.018, y - u * 0.006);
    ctx.lineTo(u * 0.018, y + u * 0.006);
  }
  ctx.lineWidth = Math.max(1, u * 0.004);
  ctx.stroke();
  for (let k = 0; k < 4; k++) {
    const twinkle = now === 0 ? 0.7 : 0.5 + 0.5 * Math.sin(now / 350 + k * 2);
    glow(
      ctx,
      (hash(73, k) - 0.5) * u * 0.05,
      ((k + 0.5) / 4 - 0.5) * seam,
      u * 0.02,
      "#fff7d6",
      twinkle,
    );
  }
  ctx.restore();

  clouds(ctx, w, h, 74, 4, h * 0.3, h * 0.52, "rgba(255, 214, 222, 0.32)", now, w * 0.01);
  ctx.strokeStyle = "#3b2a4a";
  ctx.lineWidth = Math.max(1, u * 0.003);
  ctx.lineCap = "round";
  for (let k = 0; k < 6; k++) {
    const x =
      wrap(hash(75, k) * w * 1.2 + (now / 1000) * w * 0.02 * (0.6 + hash(75, k, 1)), w * 1.2) -
      w * 0.1;
    const y = h * (0.3 + hash(75, k, 2) * 0.15);
    const s = u * (0.014 + hash(75, k, 3) * 0.01);
    const flap = now === 0 ? 0.5 : 0.5 + 0.5 * Math.sin(now / 200 + k);
    ctx.beginPath();
    ctx.moveTo(x - s, y - flap * s * 0.6);
    ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.4, x, y);
    ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.4, x + s, y - flap * s * 0.6);
    ctx.stroke();
  }

  hills(
    ctx,
    w,
    h,
    h * 0.72,
    h * 0.03,
    76,
    2.2,
    linear(ctx, 0, h * 0.66, 0, h * 0.8, [
      [0, "#c3a590"],
      [1, "#9a927c"],
    ]),
  );
  const mid = hills(
    ctx,
    w,
    h,
    h * 0.8,
    h * 0.05,
    77,
    1.8,
    linear(ctx, 0, h * 0.72, 0, h * 0.92, [
      [0, "#86b464"],
      [1, "#4f8a44"],
    ]),
  );
  rimSkyline(ctx, w, mid, "rgba(255, 241, 193, 0.65)", Math.max(1, h * 0.005));
  for (const [f, size] of [
    [0.2, 0.12],
    [0.82, 0.15],
  ] as const) {
    const base = mid(f);
    beam(ctx, f * w, base - u * size * 0.6, u * size * 0.5, h * 0.7, "#bbf7d0", now);
    paintCrystal(ctx, f * w, base - u * size * 0.62, u * size);
  }
  [0.3, 0.34, 0.38, 0.66, 0.7].forEach((f, i) => {
    house(
      ctx,
      f * w,
      mid(f) + u * 0.012,
      u * (0.04 + (i % 2) * 0.01),
      "#e8d4b8",
      "#9a3b2a",
      "#fde68a",
    );
  });

  const near = hills(
    ctx,
    w,
    h,
    h * 0.91,
    h * 0.05,
    78,
    1.4,
    linear(ctx, 0, h * 0.84, 0, h, [
      [0, "#5aa652"],
      [1, "#2e6a32"],
    ]),
  );
  rimSkyline(ctx, w, near, "rgba(255, 247, 214, 0.55)", Math.max(1, h * 0.005));
  const crest = near(0.5);
  beam(ctx, w * 0.5, crest - u * 0.18, u * 0.14, h * 0.9, "#d9f99d", now);
  paintCrystal(ctx, w * 0.5, crest - u * 0.2, u * 0.32);
  const petals = ["#fde68a", "#f9a8d4", "#ffffff"] as const;
  for (let k = 0; k < 60; k++) {
    const x = hash(79, k) * w;
    circle(ctx, x, near(x / w) + h * (0.02 + hash(79, k, 1) * 0.07), Math.max(1, u * 0.004));
    ctx.fillStyle = petals[k % petals.length] ?? "#ffffff";
    ctx.fill();
  }
  motes(ctx, w, 30, 80, now, "#fde68a", -h * 0.015, u * 0.004, h * 0.3, h);
  vignette(ctx, w, h, 0.3);
  ctx.restore();
}

/** "#" rock, "." open, "S" rift, "C" crystal (drawn once, on its left cell), "T" tower. */
const TITLE_MAZE = [
  "##...SS...##",
  "#..........#",
  "..#.T..T.#..",
  "..#......#..",
  "....##.#....",
  ".T.......T..",
  "...#.T..#...",
  "#.........#.",
  "..T..##..T..",
  ".....CC.....",
  "..#......#..",
  "#..T....T..#",
  "............",
  "##........##",
] as const;
const TITLE_TOWERS = ["bolt", "cannon", "frost", "spire", "arc", "mortar"] as const;

/**
 * The title screen: a dark valley under a swirling rift, a maze of towers
 * receding to the horizon around the glowing crystal, and drifting light.
 * The top and bottom are dimmed for a logo and menu buttons.
 */
export function paintTitleBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  now: number,
): void {
  if (width <= 0 || height <= 0) return;
  const w = width;
  const h = height;
  const u = Math.min(w, h);
  ctx.save();
  sky(ctx, w, h, [
    [0, "#08040e"],
    [0.2, "#1d0b26"],
    [0.44, "#141222"],
    [0.5, "#0b1418"],
    [1, "#04070a"],
  ]);
  stars(ctx, w, 70, 81, now, h * 0.4);
  vortex(ctx, w * 0.5, h * 0.17, Math.max(w, h * 0.55) * 0.5, now, 0.8);
  glow(ctx, w * 0.5, h * 0.44, w * 0.9, "#f43f5e", 0.22);
  mountains(
    ctx,
    w,
    h,
    h * 0.47,
    h * 0.14,
    82,
    5,
    linear(ctx, 0, h * 0.33, 0, h * 0.47, [
      [0, "#24143a"],
      [1, "#0c0a16"],
    ]),
  );
  fillAll(ctx, w, h, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = "#070a10";
  ctx.fillRect(0, h * 0.468, w, h);

  // A simple pinhole projection of the board plane: X across, Z into the screen.
  const horizon = h * 0.46;
  const rows = TITLE_MAZE.length;
  const cols = 12;
  const zNear = 2.4;
  const reach = (h * 1.04 - horizon) * zNear;
  const focal = (w * 1.7 * zNear) / cols;
  const project = (x: number, z: number): { x: number; y: number } => ({
    x: w / 2 + (x * focal) / z,
    y: horizon + reach / z,
  });
  const rowZ = (row: number): number => zNear + (rows - 1 - row);
  const fogAt = (z: number): number => Math.min(1, (z - zNear) / rows) * 0.8;

  for (let r = 0; r < rows; r++) {
    const line = TITLE_MAZE[r] ?? "";
    const z0 = rowZ(r);
    const z1 = z0 + 1;
    for (let c = 0; c < cols; c++) {
      const symbol = line.charAt(c);
      const x0 = c - cols / 2;
      const inset = 0.05;
      const a = project(x0 + inset, z1 - inset);
      const b = project(x0 + 1 - inset, z1 - inset);
      const d = project(x0 + 1 - inset, z0 + inset);
      const e = project(x0 + inset, z0 + inset);
      const base =
        symbol === "#"
          ? "#283241"
          : symbol === "S"
            ? "#3d1022"
            : symbol === "C"
              ? "#173a2a"
              : "#132029";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(d.x, d.y);
      ctx.lineTo(e.x, e.y);
      ctx.closePath();
      ctx.fillStyle = mix(base, "#090b14", fogAt(z0));
      ctx.fill();
      if (symbol === "#") {
        const center = project(x0 + 0.5, z0 + 0.5);
        const k = focal / (z0 + 0.5);
        ctx.beginPath();
        ctx.ellipse(center.x, center.y - k * 0.08, k * 0.36, k * 0.2, 0, 0, TAU);
        ctx.fillStyle = mix("#566273", "#090b14", fogAt(z0));
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(center.x - k * 0.08, center.y - k * 0.14, k * 0.14, k * 0.06, 0, 0, TAU);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.12 * (1 - fogAt(z0))})`;
        ctx.fill();
      }
    }
  }

  const rift = project(0, rowZ(0) + 0.5);
  const riftScale = focal / (rowZ(0) + 0.5);
  glow(ctx, rift.x, rift.y, riftScale * 4, "#f43f5e", 0.5);
  ctx.save();
  ctx.translate(rift.x, rift.y - riftScale * 0.3);
  ctx.scale(riftScale * 1.3, riftScale * 0.6);
  circle(ctx, 0, 0, 1);
  ctx.fillStyle = radial(ctx, 0, 0, 1, [
    [0, "#fff1f2"],
    [0.3, "rgba(244, 63, 94, 0.9)"],
    [1, "rgba(127, 29, 29, 0)"],
  ]);
  ctx.fill();
  ctx.restore();

  // Objects back to front so nearer towers overlap farther ones.
  for (let r = 0; r < rows; r++) {
    const line = TITLE_MAZE[r] ?? "";
    const z = rowZ(r) + 0.5;
    const k = focal / z;
    const fade = 1 - fogAt(z) * 0.7;
    for (let c = 0; c < cols; c++) {
      const symbol = line.charAt(c);
      if (symbol === "T") {
        const center = project(c - cols / 2 + 0.5, z);
        const id = TITLE_TOWERS[(r * 7 + c * 3) % TITLE_TOWERS.length] ?? "bolt";
        const art = towerArt(id);
        const level = (r + c) % 3;
        const aim =
          -Math.PI / 2 + (now === 0 ? (c - 6) * 0.08 : Math.sin(now / 2400 + r + c) * 0.6);
        glow(ctx, center.x, center.y, k * 0.9, "#38bdf8", 0.08 * fade);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(center.x, center.y);
        ctx.scale(1, 0.62);
        art.base(ctx, k * 0.92, level);
        ctx.rotate(aim);
        ctx.scale(TURRET_SCALE, TURRET_SCALE);
        art.turret(ctx, k * 0.92, level);
        ctx.restore();
      } else if (symbol === "C" && line.charAt(c - 1) !== "C") {
        const center = project(0, z);
        const pulse = now === 0 ? 1 : 0.85 + 0.15 * Math.sin(now / 700);
        glow(ctx, center.x, center.y, k * 3.2, "#4ade80", 0.4 * pulse);
        beam(ctx, center.x, center.y - k * 1.2, k * 0.9, h * 0.5, "#86efac", now);
        paintCrystal(ctx, center.x, center.y - k * 1.05, k * 2);
      }
    }
  }

  motes(ctx, w, 40, 85, now, "#a7f3d0", -h * 0.02, u * 0.004, h * 0.3, h);
  motes(ctx, w, 16, 86, now, "#f0abfc", -h * 0.015, u * 0.004, 0, h * 0.5);
  fillAll(
    ctx,
    w,
    h,
    linear(ctx, 0, 0, 0, h * 0.26, [
      [0, "rgba(4, 2, 8, 0.6)"],
      [1, "rgba(4, 2, 8, 0)"],
    ]),
  );
  ctx.fillStyle = linear(ctx, 0, h * 0.7, 0, h, [
    [0, "rgba(3, 5, 8, 0)"],
    [1, "rgba(3, 5, 8, 0.92)"],
  ]);
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
  vignette(ctx, w, h, 0.5);
  ctx.restore();
}

function ilka(ctx: CanvasRenderingContext2D, s: number): void {
  fillAll(
    ctx,
    s,
    s,
    radial(ctx, s * 0.5, s * 0.42, s * 0.78, [
      [0, "#2d6a55"],
      [0.55, "#123a30"],
      [1, "#06120e"],
    ]),
  );
  glow(ctx, s * 0.5, s * 0.38, s * 0.55, "#86efac", 0.25);

  ctx.beginPath();
  ctx.moveTo(s * 0.02, s * 1.02);
  ctx.bezierCurveTo(s * 0.06, s * 0.78, s * 0.24, s * 0.7, s * 0.36, s * 0.68);
  ctx.lineTo(s * 0.64, s * 0.68);
  ctx.bezierCurveTo(s * 0.76, s * 0.7, s * 0.94, s * 0.78, s * 0.98, s * 1.02);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, s * 0.68, 0, s, [
    [0, "#2f6152"],
    [1, "#0e231c"],
  ]);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(s * 0.19, s * 0.92);
  ctx.bezierCurveTo(s * 0.12, s * 0.5, s * 0.25, s * 0.12, s * 0.5, s * 0.08);
  ctx.bezierCurveTo(s * 0.75, s * 0.12, s * 0.88, s * 0.5, s * 0.81, s * 0.92);
  ctx.quadraticCurveTo(s * 0.5, s * 1.0, s * 0.19, s * 0.92);
  ctx.fillStyle = linear(ctx, s * 0.2, s * 0.1, s * 0.8, s * 0.9, [
    [0, "#4a8a73"],
    [0.5, "#24503f"],
    [1, "#0f2a21"],
  ]);
  ctx.fill();
  ctx.strokeStyle = withAlpha("#bbf7d0", 0.4);
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.stroke();
  // A fold down the hood.
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.1);
  ctx.quadraticCurveTo(s * 0.44, s * 0.18, s * 0.42, s * 0.26);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  ctx.lineWidth = Math.max(1, s * 0.01);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.53, s * 0.205, s * 0.28, 0, 0, TAU);
  ctx.fillStyle = "#06110d";
  ctx.fill();

  ctx.fillStyle = linear(ctx, 0, s * 0.3, 0, s * 0.8, [
    [0, "#e2e8f0"],
    [1, "#94a3b8"],
  ]);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * (0.5 + side * 0.06), s * 0.33);
    ctx.quadraticCurveTo(s * (0.5 + side * 0.2), s * 0.36, s * (0.5 + side * 0.19), s * 0.56);
    ctx.quadraticCurveTo(s * (0.5 + side * 0.19), s * 0.7, s * (0.5 + side * 0.13), s * 0.8);
    ctx.quadraticCurveTo(s * (0.5 + side * 0.14), s * 0.6, s * (0.5 + side * 0.1), s * 0.44);
    ctx.closePath();
    ctx.fill();
  }

  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.56, s * 0.13, s * 0.175, 0, 0, TAU);
  ctx.fillStyle = radial(
    ctx,
    s * 0.5,
    s * 0.56,
    s * 0.2,
    [
      [0, "#f5dccb"],
      [0.65, "#dcae92"],
      [1, "#a8735a"],
    ],
    s * 0.47,
    s * 0.48,
  );
  ctx.fill();
  glow(ctx, s * 0.5, s * 0.44, s * 0.17, "#4ade80", 0.28);

  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    const ex = s * (0.5 + side * 0.055);
    const ey = s * 0.555;
    ctx.beginPath();
    ctx.ellipse(ex, ey, s * 0.028, s * 0.011, 0, 0, Math.PI);
    ctx.fillStyle = "#f8fafc";
    ctx.fill();
    circle(ctx, ex, ey + s * 0.003, s * 0.009);
    ctx.fillStyle = "#15803d";
    ctx.fill();
    // Heavy, calm lids.
    ctx.beginPath();
    ctx.ellipse(ex, ey, s * 0.03, s * 0.013, 0, Math.PI, TAU);
    ctx.fillStyle = "#c99a80";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ex - s * 0.032, ey);
    ctx.quadraticCurveTo(ex, ey - s * 0.004, ex + s * 0.032, ey);
    ctx.strokeStyle = "#3b2a24";
    ctx.lineWidth = Math.max(1, s * 0.008);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex - side * s * 0.028, ey - s * 0.035);
    ctx.quadraticCurveTo(ex, ey - s * 0.048, ex + side * s * 0.03, ey - s * 0.04);
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = Math.max(1, s * 0.007);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.57);
  ctx.quadraticCurveTo(s * 0.49, s * 0.61, s * 0.505, s * 0.625);
  ctx.strokeStyle = "rgba(120, 70, 50, 0.4)";
  ctx.lineWidth = Math.max(1, s * 0.007);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * 0.465, s * 0.67);
  ctx.quadraticCurveTo(s * 0.5, s * 0.685, s * 0.535, s * 0.67);
  ctx.strokeStyle = "#9a5a4a";
  ctx.lineWidth = Math.max(1, s * 0.009);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.39, s * 0.15, s * 0.055, 0, Math.PI * 0.08, Math.PI * 0.92);
  ctx.strokeStyle = "#d9b45a";
  ctx.lineWidth = Math.max(1, s * 0.014);
  ctx.stroke();
  for (const side of [-1, 1]) {
    circle(ctx, s * (0.5 + side * 0.1), s * 0.43, s * 0.012);
    ctx.fillStyle = "#86efac";
    ctx.fill();
  }
  const gx = s * 0.5;
  const gy = s * 0.445;
  glow(ctx, gx, gy, s * 0.11, "#4ade80", 0.85);
  ctx.beginPath();
  ctx.moveTo(gx, gy - s * 0.05);
  ctx.lineTo(gx + s * 0.028, gy);
  ctx.lineTo(gx, gy + s * 0.035);
  ctx.lineTo(gx - s * 0.028, gy);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, gx - s * 0.03, gy - s * 0.05, gx + s * 0.03, gy + s * 0.04, [
    [0, "#f0fdf4"],
    [0.5, "#22c55e"],
    [1, "#14532d"],
  ]);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = Math.max(1, s * 0.005);
  ctx.stroke();

  circle(ctx, s * 0.5, s * 0.87, s * 0.034);
  ctx.fillStyle = "#4ade80";
  ctx.fill();
  ctx.strokeStyle = "#d9b45a";
  ctx.lineWidth = Math.max(1, s * 0.01);
  ctx.stroke();
}

function tyrantPortrait(ctx: CanvasRenderingContext2D, s: number): void {
  fillAll(
    ctx,
    s,
    s,
    radial(ctx, s * 0.5, s * 0.45, s * 0.78, [
      [0, "#6b1442"],
      [0.5, "#2a0718"],
      [1, "#070208"],
    ]),
  );
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.45, s * (0.34 + k * 0.05), k * 1.7, k * 1.7 + 1.9);
    ctx.strokeStyle = withAlpha("#e879f9", 0.18);
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.stroke();
  }
  ctx.restore();

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * (0.5 + side * 0.12), s * 0.34);
    ctx.bezierCurveTo(
      s * (0.5 + side * 0.28),
      s * 0.32,
      s * (0.5 + side * 0.44),
      s * 0.24,
      s * (0.5 + side * 0.41),
      s * 0.03,
    );
    ctx.bezierCurveTo(
      s * (0.5 + side * 0.36),
      s * 0.2,
      s * (0.5 + side * 0.26),
      s * 0.25,
      s * (0.5 + side * 0.15),
      s * 0.24,
    );
    ctx.closePath();
    ctx.fillStyle = linear(
      ctx,
      s * (0.5 + side * 0.12),
      s * 0.34,
      s * (0.5 + side * 0.41),
      s * 0.03,
      [
        [0, "#44403c"],
        [0.6, "#d6d3d1"],
        [1, "#fafaf9"],
      ],
    );
    ctx.fill();
    ctx.strokeStyle = "#1c1917";
    ctx.lineWidth = Math.max(1, s * 0.01);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(-s * 0.02, s * 1.02);
  ctx.lineTo(s * 0.1, s * 0.82);
  ctx.lineTo(s * 0.02, s * 0.66);
  ctx.lineTo(s * 0.26, s * 0.76);
  ctx.lineTo(s * 0.4, s * 0.8);
  ctx.lineTo(s * 0.6, s * 0.8);
  ctx.lineTo(s * 0.74, s * 0.76);
  ctx.lineTo(s * 0.98, s * 0.66);
  ctx.lineTo(s * 0.9, s * 0.82);
  ctx.lineTo(s * 1.02, s * 1.02);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, s * 0.66, 0, s, [
    [0, "#4a1030"],
    [1, "#12040b"],
  ]);
  ctx.fill();
  ctx.strokeStyle = withAlpha("#f472b6", 0.6);
  ctx.lineWidth = Math.max(1, s * 0.01);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.2);
  ctx.bezierCurveTo(s * 0.66, s * 0.2, s * 0.72, s * 0.3, s * 0.72, s * 0.42);
  ctx.lineTo(s * 0.69, s * 0.6);
  ctx.quadraticCurveTo(s * 0.64, s * 0.77, s * 0.5, s * 0.85);
  ctx.quadraticCurveTo(s * 0.36, s * 0.77, s * 0.31, s * 0.6);
  ctx.lineTo(s * 0.28, s * 0.42);
  ctx.bezierCurveTo(s * 0.28, s * 0.3, s * 0.34, s * 0.2, s * 0.5, s * 0.2);
  ctx.fillStyle = radial(
    ctx,
    s * 0.5,
    s * 0.5,
    s * 0.42,
    [
      [0, "#f472b6"],
      [0.45, "#d6246e"],
      [1, "#5b0f30"],
    ],
    s * 0.45,
    s * 0.38,
  );
  ctx.fill();
  ctx.strokeStyle = "#2a0616";
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.stroke();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(253, 244, 255, 0.7)";
  ctx.lineWidth = Math.max(1, s * 0.006);
  ctx.beginPath();
  ctx.moveTo(s * 0.34, s * 0.58);
  ctx.lineTo(s * 0.38, s * 0.62);
  ctx.lineTo(s * 0.37, s * 0.68);
  ctx.moveTo(s * 0.66, s * 0.56);
  ctx.lineTo(s * 0.62, s * 0.61);
  ctx.lineTo(s * 0.64, s * 0.66);
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(s * 0.3, s * 0.44);
  ctx.lineTo(s * 0.5, s * 0.51);
  ctx.lineTo(s * 0.7, s * 0.44);
  ctx.lineTo(s * 0.7, s * 0.4);
  ctx.lineTo(s * 0.5, s * 0.46);
  ctx.lineTo(s * 0.3, s * 0.4);
  ctx.closePath();
  ctx.fillStyle = "#4a0b2a";
  ctx.fill();

  for (const side of [-1, 1]) {
    glow(ctx, s * (0.5 + side * 0.1), s * 0.5, s * 0.1, "#fde047", 0.6);
    ctx.beginPath();
    ctx.moveTo(s * (0.5 + side * 0.04), s * 0.51);
    ctx.quadraticCurveTo(s * (0.5 + side * 0.1), s * 0.47, s * (0.5 + side * 0.165), s * 0.465);
    ctx.quadraticCurveTo(s * (0.5 + side * 0.11), s * 0.525, s * (0.5 + side * 0.04), s * 0.51);
    ctx.fillStyle = "#fef9c3";
    ctx.fill();
  }
  ctx.fillStyle = "#2a0616";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * (0.5 + side * 0.02), s * 0.6, s * 0.008, s * 0.02, side * 0.3, 0, TAU);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(s * 0.37, s * 0.69);
  for (let k = 1; k <= 6; k++) {
    ctx.lineTo(s * (0.37 + k * 0.043), s * (0.69 + (k % 2 === 0 ? 0 : 0.02)));
  }
  ctx.strokeStyle = "#1a0410";
  ctx.lineWidth = Math.max(1.5, s * 0.02);
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.fillStyle = "#fafaf9";
  for (const side of [-1, 1]) {
    const fx = s * (0.5 + side * 0.075);
    ctx.beginPath();
    ctx.moveTo(fx - s * 0.015, s * 0.695);
    ctx.lineTo(fx, s * 0.76);
    ctx.lineTo(fx + s * 0.015, s * 0.695);
    ctx.closePath();
    ctx.fill();
  }

  for (let k = 0; k < 5; k++) {
    const offset = k - 2;
    const x = s * (0.5 + offset * 0.075);
    const base = s * (0.25 + Math.abs(offset) * 0.025);
    const length = s * (0.17 - Math.abs(offset) * 0.035);
    const lean = offset * 0.18;
    glow(ctx, x, base - length * 0.5, length * 0.7, "#f0abfc", 0.4);
    ctx.save();
    ctx.translate(x, base);
    ctx.rotate(lean);
    ctx.beginPath();
    ctx.moveTo(-s * 0.022, 0);
    ctx.lineTo(0, -length);
    ctx.lineTo(s * 0.022, 0);
    ctx.lineTo(0, s * 0.02);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, 0, 0, -length, [
      [0, "#be185d"],
      [0.55, "#f0abfc"],
      [1, "#ffffff"],
    ]);
    ctx.fill();
    ctx.strokeStyle = "#3b0726";
    ctx.lineWidth = Math.max(1, s * 0.006);
    ctx.stroke();
    ctx.restore();
  }
}

function scout(ctx: CanvasRenderingContext2D, s: number): void {
  fillAll(
    ctx,
    s,
    s,
    radial(ctx, s * 0.36, s * 0.3, s * 0.9, [
      [0, "#f6c177"],
      [0.45, "#b8692e"],
      [1, "#2e160a"],
    ]),
  );
  // A big gear turning slowly behind: the Gridwrights' mark.
  ctx.save();
  ctx.translate(s * 0.82, s * 0.2);
  ctx.fillStyle = "rgba(60, 25, 8, 0.28)";
  ctx.beginPath();
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * TAU;
    const reach = s * (i % 2 === 0 ? 0.26 : 0.21);
    ctx.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
  }
  ctx.closePath();
  ctx.moveTo(s * 0.09, 0);
  ctx.arc(0, 0, s * 0.09, 0, TAU, true);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(-s * 0.02, s * 1.02);
  ctx.bezierCurveTo(s * 0.04, s * 0.8, s * 0.2, s * 0.74, s * 0.38, s * 0.74);
  ctx.lineTo(s * 0.62, s * 0.74);
  ctx.bezierCurveTo(s * 0.8, s * 0.74, s * 0.96, s * 0.8, s * 1.02, s * 1.02);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, s * 0.74, 0, s, [
    [0, "#d9531c"],
    [1, "#7c2d12"],
  ]);
  ctx.fill();
  ctx.fillStyle = "#3f2a1d";
  ctx.beginPath();
  ctx.moveTo(s * 0.2, s * 1.02);
  ctx.lineTo(s * 0.62, s * 0.74);
  ctx.lineTo(s * 0.7, s * 0.76);
  ctx.lineTo(s * 0.3, s * 1.02);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e0b04c";
  ctx.fillRect(s * 0.4, s * 0.86, s * 0.07, s * 0.05);

  ctx.fillStyle = "#e9ab83";
  ctx.fillRect(s * 0.43, s * 0.66, s * 0.14, s * 0.1);
  ctx.beginPath();
  ctx.moveTo(s * 0.3, s * 0.78);
  ctx.quadraticCurveTo(s * 0.5, s * 0.68, s * 0.7, s * 0.78);
  ctx.quadraticCurveTo(s * 0.62, s * 0.86, s * 0.5, s * 0.86);
  ctx.quadraticCurveTo(s * 0.38, s * 0.86, s * 0.3, s * 0.78);
  ctx.fillStyle = "#0f766e";
  ctx.fill();
  ctx.strokeStyle = "#115e59";
  ctx.lineWidth = Math.max(1, s * 0.01);
  ctx.beginPath();
  ctx.moveTo(s * 0.4, s * 0.8);
  ctx.quadraticCurveTo(s * 0.5, s * 0.77, s * 0.6, s * 0.8);
  ctx.stroke();

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * (0.5 + side * 0.165), s * 0.55, s * 0.03, s * 0.045, 0, 0, TAU);
    ctx.fillStyle = "#e5a47c";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.53, s * 0.16, s * 0.19, 0, 0, TAU);
  ctx.fillStyle = radial(
    ctx,
    s * 0.5,
    s * 0.53,
    s * 0.22,
    [
      [0, "#ffe2c6"],
      [0.7, "#f0b88f"],
      [1, "#c98a64"],
    ],
    s * 0.46,
    s * 0.47,
  );
  ctx.fill();

  ctx.beginPath();
  const spikes: readonly (readonly [number, number])[] = [
    [0.33, 0.52],
    [0.3, 0.36],
    [0.33, 0.26],
    [0.38, 0.2],
    [0.42, 0.24],
    [0.47, 0.15],
    [0.52, 0.22],
    [0.58, 0.14],
    [0.62, 0.24],
    [0.68, 0.22],
    [0.7, 0.34],
    [0.67, 0.52],
    [0.62, 0.4],
    [0.5, 0.37],
    [0.38, 0.4],
  ];
  for (const [x, y] of spikes) ctx.lineTo(s * x, s * y);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, s * 0.14, 0, s * 0.52, [
    [0, "#8a5a30"],
    [1, "#4a2e17"],
  ]);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.42, s * 0.19, s * 0.08, 0, Math.PI * 1.02, Math.PI * 1.98);
  ctx.strokeStyle = "#292524";
  ctx.lineWidth = Math.max(2, s * 0.04);
  ctx.stroke();
  for (const side of [-1, 1]) {
    const cx = s * (0.5 + side * 0.085);
    const cy = s * 0.345;
    circle(ctx, cx, cy, s * 0.072);
    ctx.fillStyle = linear(ctx, cx - s * 0.07, cy - s * 0.07, cx + s * 0.07, cy + s * 0.07, [
      [0, "#fde68a"],
      [0.5, "#b7791f"],
      [1, "#6b3f10"],
    ]);
    ctx.fill();
    circle(ctx, cx, cy, s * 0.05);
    ctx.fillStyle = radial(ctx, cx, cy, s * 0.05, [
      [0, "#a5f3fc"],
      [0.6, "#0891b2"],
      [1, "#164e63"],
    ]);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.018, cy - s * 0.018, s * 0.016, s * 0.009, -0.7, 0, TAU);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fill();
  }

  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    const ex = s * (0.5 + side * 0.065);
    const ey = s * 0.545;
    ctx.beginPath();
    ctx.moveTo(ex - s * 0.035, ey - s * 0.05);
    ctx.quadraticCurveTo(ex, ey - s * 0.07, ex + s * 0.035, ey - s * 0.052);
    ctx.strokeStyle = "#4a2e17";
    ctx.lineWidth = Math.max(1, s * 0.013);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(ex, ey, s * 0.03, s * 0.026, 0, 0, TAU);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    circle(ctx, ex + side * s * 0.004, ey + s * 0.002, s * 0.018);
    ctx.fillStyle = "#5b3a1e";
    ctx.fill();
    circle(ctx, ex + side * s * 0.004, ey + s * 0.002, s * 0.009);
    ctx.fillStyle = "#111827";
    ctx.fill();
    circle(ctx, ex - s * 0.006, ey - s * 0.008, s * 0.005);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    glow(ctx, s * (0.5 + side * 0.1), s * 0.62, s * 0.045, "#fb7185", 0.35);
  }
  ctx.fillStyle = "rgba(170, 100, 60, 0.6)";
  for (let k = 0; k < 6; k++) {
    const side = k % 2 === 0 ? -1 : 1;
    circle(
      ctx,
      s * (0.5 + side * (0.08 + hash(91, k) * 0.05)),
      s * (0.585 + hash(91, k, 1) * 0.03),
      s * 0.005,
    );
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(s * 0.62, s * 0.64, s * 0.03, s * 0.014, -0.4, 0, TAU);
  ctx.fillStyle = "rgba(40, 30, 25, 0.25)";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.57);
  ctx.quadraticCurveTo(s * 0.485, s * 0.605, s * 0.505, s * 0.615);
  ctx.strokeStyle = "rgba(150, 90, 60, 0.55)";
  ctx.lineWidth = Math.max(1, s * 0.008);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * 0.43, s * 0.645);
  ctx.quadraticCurveTo(s * 0.5, s * 0.715, s * 0.57, s * 0.645);
  ctx.quadraticCurveTo(s * 0.5, s * 0.67, s * 0.43, s * 0.645);
  ctx.fillStyle = "#7f1d1d";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(s * 0.45, s * 0.652);
  ctx.quadraticCurveTo(s * 0.5, s * 0.672, s * 0.55, s * 0.652);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, s * 0.008);
  ctx.stroke();
}

/**
 * A dialogue portrait filling a `size` square from (0, 0), face centred so it
 * survives a circular crop: Ilka the crystal keeper, the young Gridwright
 * scout, or the Rift Tyrant.
 */
export function paintPortrait(
  ctx: CanvasRenderingContext2D,
  size: number,
  who: PortraitSubject,
): void {
  if (size <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.clip();
  switch (who) {
    case "ilka":
      ilka(ctx, size);
      break;
    case "scout":
      scout(ctx, size);
      break;
    case "tyrant":
      tyrantPortrait(ctx, size);
      break;
  }
  vignette(ctx, size, size, 0.35);
  ctx.restore();
}
