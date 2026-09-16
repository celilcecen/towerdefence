import { darken, lighten, withAlpha } from "../color";
import { PALETTE, towerColor } from "../palette";
import { circle, hash, linear, polygon, radial, TAU } from "./common";

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

/** A Tesla coil seen from above: copper windings, a steel toroid and spark prongs. */
const arcTurret: LevelPainter = (ctx, s, level) => {
  const color = towerColor("arc");
  const spark = lighten(color, 0.55);
  const prongs = level === 2 ? 6 : level + 3;
  const reach = s * (0.36 + level * 0.025);
  const ring = s * (0.19 + level * 0.015);

  circle(ctx, 0, 0, reach * 1.08);
  ctx.fillStyle = radial(ctx, 0, 0, reach * 1.08, [
    [0, withAlpha(color, 0.35)],
    [1, withAlpha(color, 0)],
  ]);
  ctx.fill();

  const tips: [number, number][] = [];
  for (let i = 0; i < prongs; i++) {
    const angle = (i / prongs) * TAU;
    tips.push([Math.cos(angle) * reach, Math.sin(angle) * reach]);
    ctx.save();
    ctx.rotate(angle);
    barrel(ctx, ring * 0.7, reach - s * 0.03, 0, s * 0.045, "#cbd5e1", "#3f4a5a");
    ctx.restore();
  }

  // Standing arcs crackle across alternate gaps between prong tips.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < prongs; i += 2) {
    const from = tips[i];
    const to = tips[(i + 1) % prongs];
    if (!from || !to) continue;
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    const steps = 4;
    for (let k = 1; k < steps; k++) {
      const f = k / steps;
      const bulge = 1.12 + (hash(level, i, k) - 0.5) * 0.3;
      ctx.lineTo(
        (from[0] + (to[0] - from[0]) * f) * bulge,
        (from[1] + (to[1] - from[1]) * f) * bulge,
      );
    }
    ctx.lineTo(to[0], to[1]);
    ctx.strokeStyle = withAlpha(color, 0.45);
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.stroke();
    ctx.strokeStyle = spark;
    ctx.lineWidth = Math.max(1, s * 0.016);
    ctx.stroke();
  }
  for (const [x, y] of tips) {
    circle(ctx, x, y, s * 0.05);
    ctx.fillStyle = radial(ctx, x, y, s * 0.05, [
      [0, "#ffffff"],
      [0.5, spark],
      [1, color],
    ]);
    ctx.fill();
  }

  circle(ctx, 0, 0, ring * 0.8);
  ctx.fillStyle = "#3a2618";
  ctx.fill();
  ctx.strokeStyle = "#c2773a";
  ctx.lineWidth = Math.max(1, s * 0.012);
  for (let k = 1; k <= 3; k++) {
    circle(ctx, 0, 0, ring * 0.8 * (k / 3.4));
    ctx.stroke();
  }

  circle(ctx, 0, 0, ring);
  ctx.strokeStyle = linear(ctx, -ring, -ring, ring, ring, [
    [0, "#e2e8f0"],
    [0.5, "#64748b"],
    [1, "#1e293b"],
  ]);
  ctx.lineWidth = Math.max(2, s * (0.075 + level * 0.01));
  ctx.stroke();
  ctx.strokeStyle = withAlpha(color, 0.8);
  ctx.lineWidth = Math.max(1, s * 0.014);
  ctx.stroke();
  if (level >= 1) {
    circle(ctx, 0, 0, ring * 1.45);
    ctx.setLineDash([s * 0.035, s * 0.03]);
    ctx.strokeStyle = withAlpha(spark, 0.6);
    ctx.lineWidth = Math.max(1, s * 0.014);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  circle(ctx, 0, 0, s * 0.075);
  ctx.fillStyle = radial(ctx, 0, 0, s * 0.075, [
    [0, "#ffffff"],
    [0.45, spark],
    [1, color],
  ]);
  ctx.fill();
};

/** A squat bronze mortar on a turntable, its wide bore tilted towards the target. */
const mortarTurret: LevelPainter = (ctx, s, level) => {
  const color = towerColor("mortar");
  const r = s * (0.23 + level * 0.015);
  metalBody(ctx, r, darken(color, 0.3), Math.max(1, s * 0.03));
  ctx.fillStyle = "#d6d3d1";
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * TAU + TAU / 16;
    circle(ctx, Math.cos(angle) * r * 0.8, Math.sin(angle) * r * 0.8, s * 0.016);
    ctx.fill();
  }

  for (const side of [-1, 1]) {
    ctx.fillStyle = linear(ctx, 0, side * r * 0.5, 0, side * r * 1.05, [
      [0, "#1f2937"],
      [0.5, "#6b7280"],
      [1, "#1f2937"],
    ]);
    ctx.fillRect(-s * 0.05, side > 0 ? r * 0.5 : -r * 1.02, s * 0.12, r * 0.52);
  }

  // The tube widens towards the muzzle: it points up as well as forward.
  const back = -s * 0.1;
  const front = s * (0.3 + level * 0.02);
  const rear = s * (0.1 + level * 0.012);
  const mouth = s * (0.135 + level * 0.018);
  ctx.beginPath();
  ctx.moveTo(back, -rear);
  ctx.lineTo(front, -mouth);
  ctx.lineTo(front, mouth);
  ctx.lineTo(back, rear);
  ctx.quadraticCurveTo(back - rear * 0.8, 0, back, -rear);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, -mouth, 0, mouth, [
    [0, darken(color, 0.55)],
    [0.3, color],
    [0.45, lighten(color, 0.45)],
    [0.65, color],
    [1, darken(color, 0.6)],
  ]);
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.65);
  ctx.lineWidth = Math.max(1, s * 0.018);
  ctx.stroke();

  const bands = level === 0 ? [] : level === 1 ? [0.45] : [0.2, 0.62];
  for (const f of bands) {
    const bx = back + (front - back) * f;
    const half = rear + (mouth - rear) * f + s * 0.012;
    ctx.fillStyle = linear(ctx, 0, -half, 0, half, [
      [0, darken(color, 0.5)],
      [0.45, lighten(color, 0.3)],
      [1, darken(color, 0.55)],
    ]);
    ctx.fillRect(bx - s * 0.02, -half, s * 0.04, half * 2);
  }

  ctx.beginPath();
  ctx.ellipse(front, 0, mouth * 0.45, mouth * 1.08, 0, 0, TAU);
  ctx.fillStyle = linear(ctx, front, -mouth, front, mouth, [
    [0, lighten(color, 0.35)],
    [1, darken(color, 0.45)],
  ]);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(front, 0, mouth * 0.3, mouth * 0.78, 0, 0, TAU);
  ctx.fillStyle = radial(ctx, front, 0, mouth * 0.78, [
    [0, "#000000"],
    [1, "#1c1917"],
  ]);
  ctx.fill();
  if (level >= 2) {
    ctx.fillStyle = lighten(color, 0.5);
    for (const side of [-1, 1]) {
      circle(ctx, front, side * mouth * 0.95, s * 0.018);
      ctx.fill();
    }
  }
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
  arc: { base: platform(5, -TAU / 4, "arc"), turret: arcTurret, motion: "spin" },
  mortar: { base: platform(4, 0, "mortar"), turret: mortarTurret, motion: "aim" },
};

/** Artwork for a tower id. Unknown ids get a plain turret in the fallback colour. */
export function towerArt(id: string): TowerArt {
  return ART[id] ?? { base: platform(4, 0, id), turret: genericTurret(id), motion: "aim" };
}
