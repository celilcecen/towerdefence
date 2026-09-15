import { darken, lighten, withAlpha } from "../color";
import { PALETTE, towerColor } from "../palette";
import { circle, linear, polygon, radial, TAU } from "./common";

/** Turrets are drawn larger than their base plate so barrels read at small cell sizes. */
export const TURRET_SCALE = 1.25;

type LevelPainter = (ctx: CanvasRenderingContext2D, size: number, level: number) => void;

export interface TowerArt {
  /** The platform filling the cell. Towers are walls, so it reads as solid masonry. */
  readonly base: LevelPainter;
  /** The part that moves, drawn facing +x. */
  readonly turret: LevelPainter;
  /** "aim" turrets swing onto their target; "spin" turrets turn slowly on their own. */
  readonly motion: "aim" | "spin";
}

function platform(sides: number, rotation: number, id: string): LevelPainter {
  return (ctx, s, level) => {
    const color = towerColor(id);
    const half = s * 0.43;

    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.roundRect(-half, -half + s * 0.05, half * 2, half * 2, s * 0.12);
    ctx.fill();

    ctx.fillStyle = linear(ctx, 0, -half, 0, half, [
      [0, PALETTE.towerTop],
      [1, PALETTE.towerBase],
    ]);
    ctx.beginPath();
    ctx.roundRect(-half, -half, half * 2, half * 2, s * 0.12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.stroke();

    ctx.save();
    polygon(ctx, sides, s * 0.34, rotation);
    ctx.fillStyle = "#1b232d";
    ctx.fill();
    ctx.strokeStyle = withAlpha(color, 0.65);
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#566477";
    for (const [x, y] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      circle(ctx, x * s * 0.34, y * s * 0.34, s * 0.026);
      ctx.fill();
    }

    ctx.fillStyle = color;
    for (let i = 0; i <= level; i++) {
      circle(ctx, (i - level / 2) * s * 0.1, s * 0.385, s * 0.03);
      ctx.fill();
    }
  };
}

function metalBody(ctx: CanvasRenderingContext2D, r: number, rim: string, rimWidth: number): void {
  circle(ctx, 0, 0, r);
  ctx.fillStyle = radial(
    ctx,
    0,
    0,
    r,
    [
      [0, "#5a6778"],
      [1, "#1c242e"],
    ],
    -r * 0.35,
    -r * 0.35,
  );
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = rimWidth;
  ctx.stroke();
}

function barrel(
  ctx: CanvasRenderingContext2D,
  from: number,
  to: number,
  y: number,
  width: number,
  light: string,
  dark: string,
): void {
  ctx.fillStyle = linear(ctx, 0, y - width / 2, 0, y + width / 2, [
    [0, dark],
    [0.45, light],
    [1, dark],
  ]);
  ctx.fillRect(from, y - width / 2, to - from, width);
}

const boltTurret: LevelPainter = (ctx, s, level) => {
  const color = towerColor("bolt");
  const barrels = level + 1;
  const length = s * (0.42 + level * 0.02);
  ctx.fillStyle = "#1a2129";
  ctx.fillRect(-s * 0.25, -s * 0.08, s * 0.12, s * 0.16);
  for (let i = 0; i < barrels; i++) {
    const y = (i - (barrels - 1) / 2) * s * 0.085;
    barrel(ctx, s * 0.04, length, y, s * 0.055, "#e2e8f0", "#64748b");
    ctx.fillStyle = color;
    ctx.fillRect(length - s * 0.06, y - s * 0.03, s * 0.06, s * 0.06);
  }
  metalBody(ctx, s * (0.17 + level * 0.015), color, Math.max(1, s * 0.03));
  circle(ctx, 0, 0, s * 0.065);
  ctx.fillStyle = radial(ctx, 0, 0, s * 0.065, [
    [0, lighten(color, 0.7)],
    [1, color],
  ]);
  ctx.fill();
};

const cannonTurret: LevelPainter = (ctx, s, level) => {
  const color = towerColor("cannon");
  const length = s * 0.46;
  const muzzle = (y: number, width: number): void => {
    barrel(ctx, 0, length, y, width, "#6b7280", "#1f2937");
    ctx.fillStyle = linear(ctx, 0, y - width, 0, y + width, [
      [0, darken(color, 0.45)],
      [0.5, color],
      [1, darken(color, 0.45)],
    ]);
    ctx.fillRect(length - s * 0.08, y - width / 2 - s * 0.022, s * 0.08, width + s * 0.044);
  };
  if (level < 2) muzzle(0, s * (0.15 + level * 0.025));
  else {
    muzzle(-s * 0.08, s * 0.13);
    muzzle(s * 0.08, s * 0.13);
  }
  const r = s * (0.21 + level * 0.015);
  metalBody(ctx, r, darken(color, 0.2), Math.max(1, s * 0.02));
  circle(ctx, 0, 0, r * 0.72);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.stroke();
  ctx.fillStyle = "#d1d5db";
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * TAU + Math.PI / 6;
    circle(ctx, Math.cos(angle) * r * 0.72, Math.sin(angle) * r * 0.72, s * 0.018);
    ctx.fill();
  }
  circle(ctx, -r * 0.2, 0, r * 0.3);
  ctx.fillStyle = "#151a21";
  ctx.fill();
};

const frostTurret: LevelPainter = (ctx, s, level) => {
  const color = towerColor("frost");
  const reach = s * (0.3 + level * 0.035);
  circle(ctx, 0, 0, reach * 1.1);
  ctx.fillStyle = radial(ctx, 0, 0, reach * 1.1, [
    [0, withAlpha(color, 0.35)],
    [1, withAlpha(color, 0)],
  ]);
  ctx.fill();

  const arm = linear(ctx, 0, 0, reach, 0, [
    [0, lighten(color, 0.8)],
    [1, color],
  ]);
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i / 6) * TAU);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(reach * 0.5, -s * 0.06);
    ctx.lineTo(reach, 0);
    ctx.lineTo(reach * 0.5, s * 0.06);
    ctx.closePath();
    ctx.fillStyle = arm;
    ctx.fill();
    ctx.strokeStyle = lighten(color, 0.6);
    ctx.lineWidth = Math.max(1, s * 0.022);
    ctx.beginPath();
    ctx.moveTo(reach * 0.62, 0);
    ctx.lineTo(reach * 0.78, -s * 0.08);
    ctx.moveTo(reach * 0.62, 0);
    ctx.lineTo(reach * 0.78, s * 0.08);
    ctx.stroke();
    if (level >= 2) {
      ctx.rotate(TAU / 12);
      ctx.translate(reach * 0.8, 0);
      polygon(ctx, 4, s * 0.045, 0);
      ctx.fillStyle = withAlpha(color, 0.8);
      ctx.fill();
    }
    ctx.restore();
  }
  polygon(ctx, 6, s * 0.1, TAU / 12);
  ctx.fillStyle = radial(ctx, 0, 0, s * 0.1, [
    [0, "#ffffff"],
    [1, color],
  ]);
  ctx.fill();
};

const spireTurret: LevelPainter = (ctx, s, level) => {
  const color = towerColor("spire");
  const grow = 1 + level * 0.07;
  const prongs = level === 0 ? [0] : level === 1 ? [-0.55, 0.55] : [-0.6, 0, 0.6];
  for (const angle of prongs) {
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(s * 0.12, -s * 0.05);
    ctx.lineTo(s * 0.44 * grow, 0);
    ctx.lineTo(s * 0.12, s * 0.05);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, -s * 0.05, 0, s * 0.05, [
      [0, "#475569"],
      [0.5, "#e2e8f0"],
      [1, "#475569"],
    ]);
    ctx.fill();
    ctx.restore();
  }
  for (const r of [0.27, 0.2, 0.13]) {
    circle(ctx, 0, 0, s * r * grow);
    ctx.strokeStyle = "#3b2946";
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(color, 0.7);
    ctx.lineWidth = Math.max(1, s * 0.015);
    ctx.stroke();
  }
  circle(ctx, 0, 0, s * 0.2 * grow);
  ctx.fillStyle = radial(ctx, 0, 0, s * 0.2 * grow, [
    [0, withAlpha(color, 0.5)],
    [1, withAlpha(color, 0)],
  ]);
  ctx.fill();
  circle(ctx, 0, 0, s * 0.085 * grow);
  ctx.fillStyle = radial(ctx, 0, 0, s * 0.085 * grow, [
    [0, "#ffffff"],
    [0.5, lighten(color, 0.4)],
    [1, color],
  ]);
  ctx.fill();
};

const genericTurret =
  (id: string): LevelPainter =>
  (ctx, s, level) => {
    const color = towerColor(id);
    barrel(ctx, 0, s * 0.4, 0, s * 0.08, "#cbd5e1", "#475569");
    metalBody(ctx, s * (0.18 + level * 0.02), color, Math.max(1, s * 0.03));
  };

const ART: Readonly<Record<string, TowerArt>> = {
  bolt: { base: platform(8, TAU / 16, "bolt"), turret: boltTurret, motion: "aim" },
  cannon: { base: platform(0, 0, "cannon"), turret: cannonTurret, motion: "aim" },
  frost: { base: platform(6, 0, "frost"), turret: frostTurret, motion: "spin" },
  spire: { base: platform(4, TAU / 8, "spire"), turret: spireTurret, motion: "aim" },
};

/** Artwork for a tower id. Unknown ids get a plain turret in the fallback colour. */
export function towerArt(id: string): TowerArt {
  return ART[id] ?? { base: platform(4, 0, id), turret: genericTurret(id), motion: "aim" };
}
