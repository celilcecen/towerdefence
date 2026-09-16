import type { Cell } from "../core/geometry";
import { hash, TAU } from "./art/common";
import { withAlpha } from "./color";

/** A rectangle in CSS pixels on the canvas. */
export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Scratch position of one ambient particle, reused so a frame allocates nothing. */
export interface AmbientPoint {
  x: number;
  y: number;
  /** 1 in the open, easing to 0 at the edges so wrapping particles never pop. */
  fade: number;
}

type Project = (x: number, y: number) => { x: number; y: number };

const point: AmbientPoint = { x: 0, y: 0, fade: 0 };

/**
 * Where ambient particle `index` of a `seed` family is at `now`, relative to a
 * `width` by `height` area: a stable start, a drift of (`vx`, `vy`) pixels per
 * second with a little per-particle speed variation, wrapping at the edges.
 * Writes into `out` and returns it.
 */
export function ambientPoint(
  out: AmbientPoint,
  seed: number,
  index: number,
  now: number,
  width: number,
  height: number,
  vx: number,
  vy: number,
): AmbientPoint {
  if (width <= 0 || height <= 0) {
    out.x = 0;
    out.y = 0;
    out.fade = 0;
    return out;
  }
  const seconds = now / 1000;
  const speed = 0.6 + hash(seed, index, 7) * 0.8;
  const wrap = (value: number, span: number): number => ((value % span) + span) % span;
  out.x = wrap(hash(seed, index, 1) * width + vx * speed * seconds, width);
  out.y = wrap(hash(seed, index, 2) * height + vy * speed * seconds, height);
  const margin = Math.min(width, height) * 0.08;
  const edge = Math.min(out.x, width - out.x, out.y, height - out.y);
  out.fade = Math.min(1, Math.max(0, edge / margin));
  return out;
}

/** Darkens the corners of `rect` so the eye settles on the middle of the board. */
export function paintVignette(
  ctx: CanvasRenderingContext2D,
  rect: ScreenRect,
  strength = 0.4,
): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  ctx.save();
  ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.scale(rect.width / 2, rect.height / 2);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.SQRT2);
  gradient.addColorStop(0.5, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, `rgba(0, 0, 0, ${strength})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

/** A soft band of `color` along every inside edge of `rect`, `depth` pixels deep. */
export function paintEdgeGlow(
  ctx: CanvasRenderingContext2D,
  rect: ScreenRect,
  color: string,
  alpha: number,
  depth: number,
): void {
  const { x, y, width, height } = rect;
  const reach = Math.min(depth, width / 2, height / 2);
  if (reach <= 0 || alpha <= 0) return;
  const band = (x0: number, y0: number, x1: number, y1: number): CanvasGradient => {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, withAlpha(color, alpha));
    gradient.addColorStop(1, withAlpha(color, 0));
    return gradient;
  };
  ctx.fillStyle = band(x, y, x, y + reach);
  ctx.fillRect(x, y, width, reach);
  ctx.fillStyle = band(x, y + height, x, y + height - reach);
  ctx.fillRect(x, y + height - reach, width, reach);
  ctx.fillStyle = band(x, y, x + reach, y);
  ctx.fillRect(x, y, reach, height);
  ctx.fillStyle = band(x + width, y, x + width - reach, y);
  ctx.fillRect(x + width - reach, y, reach, height);
}

/** A particle with a faint halo and a bright core, added onto what is below. */
function glowDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  core: number,
  halo: number,
  color: string,
  alpha: number,
): void {
  ctx.globalAlpha = alpha * 0.22;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, halo, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, core, 0, TAU);
  ctx.fill();
}

function meadow(ctx: CanvasRenderingContext2D, rect: ScreenRect, s: number, now: number): void {
  // Slow shafts of late sun leaning across the field.
  for (let i = 0; i < 3; i++) {
    const sway = Math.sin(now / 5200 + i * 2.1) * s * 0.8;
    const alpha = 0.03 + 0.03 * (0.5 + 0.5 * Math.sin(now / 3100 + i * 1.7));
    const topX = rect.x + rect.width * (0.2 + i * 0.3) + sway;
    const width = s * (1.1 + (i % 2) * 0.9);
    const lean = rect.height * 0.5;
    const gradient = ctx.createLinearGradient(topX, rect.y, topX - lean, rect.y + rect.height);
    gradient.addColorStop(0, withAlpha("#fef3c7", alpha));
    gradient.addColorStop(1, withAlpha("#fef3c7", 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(topX, rect.y);
    ctx.lineTo(topX + width, rect.y);
    ctx.lineTo(topX + width * 1.6 - lean, rect.y + rect.height);
    ctx.lineTo(topX - lean, rect.y + rect.height);
    ctx.closePath();
    ctx.fill();
  }
  for (let i = 0; i < 18; i++) {
    ambientPoint(point, 11, i, now, rect.width, rect.height, s * 0.22, -s * 0.1);
    const twinkle = 0.5 + 0.5 * Math.sin(now / (380 + hash(11, i, 3) * 520) + i * 3);
    const x = rect.x + point.x + Math.sin(now / 900 + i) * s * 0.3;
    const y = rect.y + point.y;
    const color = i % 3 === 0 ? "#d9f99d" : "#fde68a";
    glowDot(ctx, x, y, Math.max(1, s * 0.035), s * 0.14, color, point.fade * twinkle);
  }
}

function frost(
  ctx: CanvasRenderingContext2D,
  rect: ScreenRect,
  s: number,
  now: number,
  rocks: readonly Cell[],
  project: Project,
): void {
  ctx.fillStyle = "#f8fafc";
  for (let i = 0; i < 32; i++) {
    ambientPoint(point, 23, i, now, rect.width, rect.height, s * 0.12, s * 0.55);
    const size = Math.max(1, s * (0.022 + hash(23, i, 4) * 0.035));
    ctx.globalAlpha = point.fade * (0.4 + hash(23, i, 5) * 0.5);
    ctx.beginPath();
    ctx.arc(
      rect.x + point.x + Math.sin(now / 1300 + i * 1.9) * s * 0.25,
      rect.y + point.y,
      size,
      0,
      TAU,
    );
    ctx.fill();
  }
  if (rocks.length === 0) return;
  // Every so often a rock catches the light: a four-pointed glint that swells and fades.
  const period = 640;
  ctx.strokeStyle = "#e0f2fe";
  ctx.lineCap = "round";
  for (let k = 0; k < 3; k++) {
    const shifted = now + k * 213;
    const slot = Math.floor(shifted / period);
    const phase = (shifted % period) / period;
    const rock = rocks[Math.floor(hash(slot, k, 3) * rocks.length)];
    if (!rock) continue;
    const c = project(rock.x, rock.y);
    const gx = c.x + (hash(slot, k, 4) - 0.5) * s * 0.4;
    const gy = c.y + (hash(slot, k, 5) - 0.6) * s * 0.4;
    const glow = Math.sin(Math.PI * phase);
    const arm = s * 0.2 * glow;
    ctx.globalAlpha = glow;
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath();
    ctx.moveTo(gx - arm, gy);
    ctx.lineTo(gx + arm, gy);
    ctx.moveTo(gx, gy - arm);
    ctx.lineTo(gx, gy + arm);
    ctx.stroke();
    glowDot(ctx, gx, gy, Math.max(1, s * 0.035), s * 0.12, "#ffffff", glow);
  }
}

function ash(ctx: CanvasRenderingContext2D, rect: ScreenRect, s: number, now: number): void {
  // A band of heat haze rolling up the board, over a warm glow from below.
  const warm = ctx.createLinearGradient(0, rect.y + rect.height, 0, rect.y);
  warm.addColorStop(0, "rgba(234, 88, 12, 0.08)");
  warm.addColorStop(0.6, "rgba(234, 88, 12, 0)");
  ctx.fillStyle = warm;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  const band = rect.y + rect.height * (1.2 - ((now / 7000) % 1) * 1.4);
  const reach = rect.height * 0.18;
  const haze = ctx.createLinearGradient(0, band - reach, 0, band + reach);
  haze.addColorStop(0, "rgba(251, 146, 60, 0)");
  haze.addColorStop(0.5, "rgba(251, 146, 60, 0.07)");
  haze.addColorStop(1, "rgba(251, 146, 60, 0)");
  ctx.fillStyle = haze;
  ctx.fillRect(rect.x, band - reach, rect.width, reach * 2);

  for (let i = 0; i < 24; i++) {
    ambientPoint(point, 37, i, now, rect.width, rect.height, s * 0.08, -s * 0.7);
    const flicker = 0.6 + 0.4 * Math.sin(now / (140 + hash(37, i, 3) * 220) + i);
    const x = rect.x + point.x + Math.sin(now / 700 + i * 2.3) * s * 0.18;
    const color = i % 4 === 0 ? "#fde047" : "#fb923c";
    glowDot(ctx, x, rect.y + point.y, Math.max(1, s * 0.03), s * 0.1, color, point.fade * flicker);
  }
}

function rift(ctx: CanvasRenderingContext2D, rect: ScreenRect, s: number, now: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(now / 1600);
  paintEdgeGlow(ctx, rect, "#7c3aed", 0.14 + 0.12 * pulse, s * 1.6);
  paintEdgeGlow(ctx, rect, "#db2777", 0.04 + 0.06 * (1 - pulse), s * 0.7);
  for (let i = 0; i < 22; i++) {
    ambientPoint(point, 53, i, now, rect.width, rect.height, s * 0.05, -s * 0.18);
    const twinkle = 0.45 + 0.55 * Math.sin(now / (700 + hash(53, i, 3) * 900) + i * 2);
    const x = rect.x + point.x + Math.sin(now / 2100 + i) * s * 0.4;
    const color = i % 3 === 0 ? "#f0abfc" : "#c084fc";
    glowDot(
      ctx,
      x,
      rect.y + point.y,
      Math.max(1, s * 0.035),
      s * 0.12,
      color,
      point.fade * twinkle,
    );
  }
}

/**
 * Per-frame ambience over a themed board: fireflies and sun shafts, falling
 * snow and rock glints, rising embers and heat haze, or rift motes and a
 * pulsing void at the edges. A few dozen primitives, clipped to the board.
 * Callers skip it entirely under reduced motion.
 */
export function paintAtmosphere(
  ctx: CanvasRenderingContext2D,
  themeId: string,
  board: ScreenRect,
  cellSize: number,
  now: number,
  rocks: readonly Cell[],
  project: Project,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(board.x, board.y, board.width, board.height);
  ctx.clip();
  switch (themeId) {
    case "frost":
      frost(ctx, board, cellSize, now, rocks, project);
      break;
    case "ash":
      ctx.globalCompositeOperation = "lighter";
      ash(ctx, board, cellSize, now);
      break;
    case "rift":
      ctx.globalCompositeOperation = "lighter";
      rift(ctx, board, cellSize, now);
      break;
    default:
      ctx.globalCompositeOperation = "lighter";
      meadow(ctx, board, cellSize, now);
  }
  ctx.restore();
}
