import type { EnemyDef } from "../core/content-types";
import { TAU } from "./art/common";
import { enemyArt, paintFeet } from "./art/enemies";
import { paintMeteor, paintSnowflake } from "./art/powers";
import { towerArt, TURRET_SCALE } from "./art/towers";
import { withAlpha } from "./color";
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
  const art = enemyArt(enemy.id);
  const color = enemyColor(enemy.id);
  // Bigger enemies read bigger, but the smallest must stay legible and wings must fit.
  const r = Math.min(cssSize * (0.2 + enemy.radius * 0.3), cssSize / art.extent);
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  if (enemy.flying === true) {
    ctx.ellipse(r * 0.2, r * 1.05, r * 0.7, r * 0.36, 0, 0, TAU);
    ctx.fill();
    // A quarter cycle holds wings at full spread.
    art.flap?.(ctx, r, color, 0.25);
  } else {
    ctx.ellipse(0, r * 0.4, r, r * 0.55, 0, 0, TAU);
    ctx.fill();
    paintFeet(ctx, enemy.id, r, 0.9);
  }
  art.body(ctx, r, color);
}

/** Artwork for a player power's button. Unknown ids get a plain glowing star. */
export function paintPowerIcon(
  canvas: HTMLCanvasElement,
  powerId: string,
  cssSize: number,
  pixelRatio: number,
): void {
  const ctx = prepare(canvas, cssSize, pixelRatio);
  if (!ctx) return;
  const s = cssSize * 0.94;
  switch (powerId) {
    case "meteor":
      ctx.translate(-s * 0.13, s * 0.13);
      paintMeteor(ctx, s);
      break;
    case "frostbind":
      paintSnowflake(ctx, s);
      break;
    default: {
      const color = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.42, 0, TAU);
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.42);
      glow.addColorStop(0, withAlpha(color, 0.5));
      glow.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = glow;
      ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * TAU - Math.PI / 2;
        const reach = s * (i % 2 === 0 ? 0.36 : 0.12);
        ctx.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      break;
    }
  }
}
