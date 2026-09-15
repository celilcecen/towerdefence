export const TAU = Math.PI * 2;

export type Stops = readonly (readonly [offset: number, color: string])[];

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
}

/** A regular polygon path; `sides` 0 draws a circle. */
export function polygon(
  ctx: CanvasRenderingContext2D,
  sides: number,
  radius: number,
  rotation = 0,
): void {
  if (sides === 0) {
    circle(ctx, 0, 0, radius);
    return;
  }
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i / sides) * TAU;
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  ctx.closePath();
}

function addStops(gradient: CanvasGradient, stops: Stops): CanvasGradient {
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

export function radial(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  stops: Stops,
  focusX = x,
  focusY = y,
): CanvasGradient {
  return addStops(ctx.createRadialGradient(focusX, focusY, 0, x, y, Math.max(0.01, r)), stops);
}

export function linear(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: Stops,
): CanvasGradient {
  return addStops(ctx.createLinearGradient(x0, y0, x1, y1), stops);
}

/** Stable pseudo-random value in [0, 1) for integer inputs; keeps decoration fixed per cell. */
export function hash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
