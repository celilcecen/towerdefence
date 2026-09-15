import type { EnemyDef } from "../core/content-types";
import { enemyArt, paintFeet } from "./art/enemies";
import { towerArt, TURRET_SCALE } from "./art/towers";
import { enemyColor, PALETTE } from "./palette";

/** Sizes the canvas backing store and returns a context centred on the icon. */
function prepare(
  canvas: HTMLCanvasElement,
  cssSize: number,
  pixelRatio: number,
): CanvasRenderingContext2D | undefined {
  const side = Math.round(cssSize * pixelRatio);
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.clearRect(0, 0, side, side);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, side / 2, side / 2);
  return ctx;
}

/** Paints the same artwork the board uses into a small UI canvas. */
export function paintTowerIcon(
  canvas: HTMLCanvasElement,
  towerId: string,
  cssSize: number,
  pixelRatio: number,
  level = 0,
): void {
  const ctx = prepare(canvas, cssSize, pixelRatio);
  if (!ctx) return;
  const art = towerArt(towerId);
  const size = cssSize * 0.94;
  art.base(ctx, size, level);
  ctx.rotate(art.motion === "aim" ? -Math.PI / 4 : 0);
  ctx.scale(TURRET_SCALE, TURRET_SCALE);
  art.turret(ctx, size, level);
}

export function paintEnemyIcon(
  canvas: HTMLCanvasElement,
  enemy: EnemyDef,
  cssSize: number,
  pixelRatio: number,
): void {
  const ctx = prepare(canvas, cssSize, pixelRatio);
  if (!ctx) return;
  // Bigger enemies read bigger, but the smallest must stay legible.
  const r = cssSize * (0.2 + enemy.radius * 0.3);
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.4, r, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  paintFeet(ctx, enemy.id, r, 0.9);
  enemyArt(enemy.id).body(ctx, r, enemyColor(enemy.id));
}
