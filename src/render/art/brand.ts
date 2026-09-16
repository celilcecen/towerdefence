import { withAlpha } from "../color";
import { PALETTE } from "../palette";
import { circle, linear, radial, TAU } from "./common";
import { towerArt, TURRET_SCALE } from "./towers";

/**
 * Store and launch artwork. Everything is painted full bleed with no
 * transparency, so it survives iOS and Android icon masks.
 */

/** Crystal facets, lit from the top left, clockwise from the peak. */
const FACETS: readonly (readonly [x: number, y: number, color: string])[] = [
  [0, -0.52, "#f0fdf4"],
  [0.3, -0.12, "#bbf7d0"],
  [0.22, 0.22, "#22c55e"],
  [0, 0.52, "#14532d"],
  [-0.22, 0.22, "#15803d"],
  [-0.3, -0.12, "#4ade80"],
];

/** The defended crystal on its glow, centred on (cx, cy); `s` is its height. */
export function paintCrystal(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  const glow = s * 1.05;
  circle(ctx, cx, cy, glow);
  ctx.fillStyle = radial(ctx, cx, cy, glow, [
    [0, withAlpha(PALETTE.core, 0.6)],
    [0.45, withAlpha(PALETTE.core, 0.2)],
    [1, withAlpha(PALETTE.core, 0)],
  ]);
  ctx.fill();

  const ridgeX = cx + s * 0.03;
  const ridgeY = cy - s * 0.06;
  FACETS.forEach(([x, y, color], i) => {
    const next = FACETS[(i + 1) % FACETS.length];
    if (!next) return;
    ctx.beginPath();
    ctx.moveTo(cx + x * s, cy + y * s);
    ctx.lineTo(cx + next[0] * s, cy + next[1] * s);
    ctx.lineTo(ridgeX, ridgeY);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  });

  ctx.beginPath();
  for (const [x, y] of FACETS) ctx.lineTo(cx + x * s, cy + y * s);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.strokeStyle = withAlpha("#f0fdf4", 0.7);
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.stroke();

  // A glint on the lit shoulder.
  const gx = cx - s * 0.12;
  const gy = cy - s * 0.26;
  const arm = s * 0.13;
  ctx.beginPath();
  ctx.moveTo(gx, gy - arm);
  ctx.quadraticCurveTo(gx, gy, gx + arm * 0.7, gy);
  ctx.quadraticCurveTo(gx, gy, gx, gy + arm);
  ctx.quadraticCurveTo(gx, gy, gx - arm * 0.7, gy);
  ctx.quadraticCurveTo(gx, gy, gx, gy - arm);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

function paintRift(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  circle(ctx, cx, cy, r);
  ctx.fillStyle = radial(ctx, cx, cy, r, [
    [0, withAlpha("#fff1f2", 0.95)],
    [0.12, withAlpha(PALETTE.portal, 0.9)],
    [0.45, withAlpha("#9f1239", 0.45)],
    [1, withAlpha("#4c0519", 0)],
  ]);
  ctx.fill();
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const turn = (i * TAU) / 3 + 0.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r * (0.09 + i * 0.05), turn, turn + 1.7);
    ctx.strokeStyle = withAlpha("#fecdd3", 0.75 - i * 0.2);
    ctx.lineWidth = Math.max(1, r * 0.02);
    ctx.stroke();
  }
}

/** "#" rock, "." open, "S" rift, "E" crystal gate, "T" tower. */
const ICON_MAZE = ["S.#...", "....T#", "#.EE..", "..EE.#", ".T....", "#..#.."] as const;

/**
 * A square store icon, `size` pixels wide, drawn into the context's current
 * transform at (0, 0): a green crystal on a maze, guarded by two towers facing
 * a red rift in the top-left corner.
 */
export function paintAppIcon(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.save();
  ctx.fillStyle = "#05080b";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = radial(ctx, size * 0.5, size * 0.52, size * 0.8, [
    [0, "#132a27"],
    [0.5, "#0a1417"],
    [1, "#04070a"],
  ]);
  ctx.fillRect(0, 0, size, size);

  const cells = ICON_MAZE.length;
  const tile = size / cells;
  const gap = tile * 0.07;
  const towers: [number, number][] = [];
  ICON_MAZE.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const symbol = row.charAt(x);
      const left = x * tile + gap / 2;
      const top = y * tile + gap / 2;
      const side = tile - gap;
      ctx.beginPath();
      ctx.roundRect(left, top, side, side, tile * 0.16);
      switch (symbol) {
        case "#":
          ctx.fillStyle = linear(ctx, left, top, left + side, top + side, [
            [0, "#3b4654"],
            [1, "#151b22"],
          ]);
          break;
        case "S":
          ctx.fillStyle = "#2a0f16";
          break;
        case "E":
          ctx.fillStyle = "#12261d";
          break;
        default:
          ctx.fillStyle = withAlpha("#1a2a2c", 0.8);
      }
      ctx.fill();
      if (symbol === "T") towers.push([left + side / 2, top + side / 2]);
    }
  });

  const riftX = tile * 0.5;
  const riftY = tile * 0.5;
  paintRift(ctx, riftX, riftY, size * 0.52);

  // Chevrons marching from the rift towards the gate, as on the board.
  ctx.beginPath();
  for (const [x, y, angle] of [
    [1.1, 0.5, 0],
    [1.5, 1.25, Math.PI / 2],
    [2.0, 2.0, 0],
  ] as const) {
    const k = tile * 0.13;
    const cx = x * tile;
    const cy = y * tile;
    const along = (d: number, side: number): [number, number] => [
      cx + Math.cos(angle) * d - Math.sin(angle) * side,
      cy + Math.sin(angle) * d + Math.cos(angle) * side,
    ];
    ctx.moveTo(...along(-k * 0.6, -k));
    ctx.lineTo(...along(k * 0.5, 0));
    ctx.lineTo(...along(-k * 0.6, k));
  }
  ctx.strokeStyle = withAlpha("#fecdd3", 0.5);
  ctx.lineWidth = tile * 0.06;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  paintCrystal(ctx, size * 0.5, size * 0.5, size * 0.42);

  const ids = ["cannon", "arc"] as const;
  towers.forEach(([x, y], i) => {
    const art = towerArt(ids[i % ids.length] ?? "cannon");
    const towerSize = tile * 1.15;
    ctx.save();
    ctx.translate(x, y);
    art.base(ctx, towerSize, 2);
    ctx.rotate(Math.atan2(riftY - y, riftX - x));
    ctx.scale(TURRET_SCALE, TURRET_SCALE);
    art.turret(ctx, towerSize, 2);
    ctx.restore();
  });

  ctx.fillStyle = radial(ctx, size * 0.5, size * 0.5, size * 0.75, [
    [0.55, "rgba(0, 0, 0, 0)"],
    [1, "rgba(0, 0, 0, 0.5)"],
  ]);
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
}

/**
 * A launch screen: the dark board ground with a faint grid fading out from a
 * centred crystal emblem. No text, so it needs no translation.
 */
export function paintSplash(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  const cx = width / 2;
  const cy = height / 2;
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  ctx.fillStyle = "#05080b";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = radial(ctx, cx, cy, long * 0.7, [
    [0, "#10231f"],
    [0.4, "#08110f"],
    [1, "#04060a"],
  ]);
  ctx.fillRect(0, 0, width, height);

  const tile = short / 9;
  const reach = short * 0.75;
  ctx.lineWidth = Math.max(1, short * 0.002);
  for (let gy = Math.floor(-reach / tile); gy <= Math.ceil(reach / tile); gy++) {
    for (let gx = Math.floor(-reach / tile); gx <= Math.ceil(reach / tile); gx++) {
      const x = cx + (gx - 0.5) * tile;
      const y = cy + (gy - 0.5) * tile;
      const fade = 1 - Math.hypot(gx, gy) / (reach / tile);
      if (fade <= 0) continue;
      ctx.strokeStyle = withAlpha("#a7f3d0", 0.07 * fade);
      ctx.strokeRect(x + tile * 0.06, y + tile * 0.06, tile * 0.88, tile * 0.88);
    }
  }

  const emblem = short * 0.32;
  for (const [radius, alpha] of [
    [0.95, 0.18],
    [0.78, 0.3],
  ] as const) {
    circle(ctx, cx, cy, emblem * radius);
    ctx.strokeStyle = withAlpha(PALETTE.core, alpha);
    ctx.lineWidth = Math.max(1, short * 0.004);
    ctx.stroke();
  }
  paintCrystal(ctx, cx, cy, emblem);
  ctx.restore();
}
