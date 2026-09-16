import { darken, lighten, withAlpha } from "../color";
import { enemyColor } from "../palette";
import { circle, linear, radial, TAU } from "./common";

type BodyPainter = (ctx: CanvasRenderingContext2D, r: number, color: string) => void;
type FlapPainter = (ctx: CanvasRenderingContext2D, r: number, color: string, phase: number) => void;

/** Animation frames cached per flapping enemy; the renderer cycles through them. */
export const FLAP_FRAMES = 6;

export interface EnemyArt {
  /** Sprite width as a multiple of the enemy's collision radius; horns and spikes must fit inside. */
  readonly extent: number;
  /** The body seen from above, facing +x. `r` is the collision radius in pixels. */
  readonly body: BodyPainter;
  /**
   * An animated layer painted under the body, such as wings or a flame tail.
   * `phase` in [0, 1) is one full cycle; it shares the body's extent.
   */
  readonly flap?: FlapPainter;
}

const STEEL: readonly (readonly [number, string])[] = [
  [0, "#d1d5db"],
  [0.55, "#6b7280"],
  [1, "#374151"],
];

function eyes(
  ctx: CanvasRenderingContext2D,
  x: number,
  spread: number,
  size: number,
  iris = "#111827",
): void {
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x, side * spread, size, size * 0.85, 0, 0, TAU);
    ctx.fillStyle = "#f8fafc";
    ctx.fill();
    circle(ctx, x + size * 0.35, side * spread, size * 0.5);
    ctx.fillStyle = iris;
    ctx.fill();
  }
}

function glowingEyes(
  ctx: CanvasRenderingContext2D,
  x: number,
  spread: number,
  size: number,
  color: string,
): void {
  for (const side of [-1, 1]) {
    circle(ctx, x, side * spread, size * 2.2);
    ctx.fillStyle = radial(ctx, x, side * spread, size * 2.2, [
      [0, withAlpha(color, 0.6)],
      [1, withAlpha(color, 0)],
    ]);
    ctx.fill();
    circle(ctx, x, side * spread, size);
    ctx.fillStyle = lighten(color, 0.55);
    ctx.fill();
  }
}

function shadedFill(ctx: CanvasRenderingContext2D, r: number, color: string): CanvasGradient {
  return radial(
    ctx,
    0,
    0,
    r * 1.2,
    [
      [0, lighten(color, 0.35)],
      [0.6, color],
      [1, darken(color, 0.45)],
    ],
    r * 0.2,
    -r * 0.35,
  );
}

const runner: BodyPainter = (ctx, r, color) => {
  ctx.beginPath();
  ctx.moveTo(r * 1.3, 0);
  ctx.quadraticCurveTo(r * 0.4, -r * 1.05, -r * 0.95, -r * 0.9);
  ctx.lineTo(-r * 0.45, 0);
  ctx.lineTo(-r * 0.95, r * 0.9);
  ctx.quadraticCurveTo(r * 0.4, r * 1.05, r * 1.3, 0);
  ctx.fillStyle = linear(ctx, r * 1.3, 0, -r, 0, [
    [0, lighten(color, 0.3)],
    [1, darken(color, 0.4)],
  ]);
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.55);
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, -r * 0.5);
  ctx.lineTo(r * 0.15, 0);
  ctx.lineTo(-r * 0.1, r * 0.5);
  ctx.strokeStyle = darken(color, 0.35);
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.stroke();
  eyes(ctx, r * 0.55, r * 0.3, r * 0.2);
};

const grunt: BodyPainter = (ctx, r, color) => {
  const bone = "#ede3cf";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, side * r * 0.7);
    ctx.lineTo(-r * 0.75, side * r * 1.18);
    ctx.lineTo(-r * 0.55, side * r * 0.55);
    ctx.closePath();
    ctx.fillStyle = bone;
    ctx.fill();
  }
  circle(ctx, 0, 0, r);
  ctx.fillStyle = shadedFill(ctx, r, color);
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.55);
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.7, Math.PI * 0.62, Math.PI * 1.38);
  ctx.strokeStyle = darken(color, 0.4);
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.78, side * r * 0.14);
    ctx.lineTo(r * 1.08, side * r * 0.3);
    ctx.lineTo(r * 0.8, side * r * 0.36);
    ctx.closePath();
    ctx.fillStyle = bone;
    ctx.fill();
  }
  eyes(ctx, r * 0.38, r * 0.36, r * 0.24);
};

const brute: BodyPainter = (ctx, r, color) => {
  ctx.beginPath();
  ctx.ellipse(-r * 0.05, 0, r * 0.95, r * 0.9, 0, 0, TAU);
  ctx.fillStyle = shadedFill(ctx, r, color);
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.6);
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-r * 0.05, 0, r * 0.95, Math.PI * 0.6, Math.PI * 1.4);
  ctx.arc(-r * 0.05, 0, r * 0.45, Math.PI * 1.4, Math.PI * 0.6, true);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, -r, -r, -r * 0.2, r, STEEL);
  ctx.fill();
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();

  for (const side of [-1, 1]) {
    circle(ctx, -r * 0.05, side * r * 0.82, r * 0.4);
    ctx.fillStyle = radial(
      ctx,
      -r * 0.05,
      side * r * 0.82,
      r * 0.4,
      STEEL,
      -r * 0.15,
      side * r * 0.72,
    );
    ctx.fill();
    ctx.strokeStyle = "#1f2937";
    ctx.stroke();
    circle(ctx, -r * 0.05, side * r * 0.82, r * 0.08);
    ctx.fillStyle = "#e5e7eb";
    ctx.fill();
  }

  circle(ctx, r * 0.42, 0, r * 0.48);
  ctx.fillStyle = radial(ctx, r * 0.42, 0, r * 0.48, STEEL, r * 0.3, -r * 0.18);
  ctx.fill();
  ctx.strokeStyle = "#1f2937";
  ctx.stroke();
  ctx.fillStyle = "#0b0f14";
  ctx.beginPath();
  ctx.roundRect(r * 0.55, -r * 0.3, r * 0.3, r * 0.6, r * 0.08);
  ctx.fill();
  glowingEyes(ctx, r * 0.72, r * 0.15, r * 0.07, "#fde047");
};

const warden: BodyPainter = (ctx, r, color) => {
  const gold = "#facc15";
  const spikes = 12;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * TAU;
    const reach = i % 2 === 0 ? r * 1.1 : r * 0.9;
    ctx.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
  }
  ctx.closePath();
  ctx.fillStyle = radial(ctx, 0, 0, r * 1.1, [
    [0, darken(color, 0.25)],
    [1, darken(color, 0.7)],
  ]);
  ctx.fill();

  circle(ctx, 0, 0, r * 0.82);
  ctx.fillStyle = shadedFill(ctx, r * 0.82, color);
  ctx.fill();
  circle(ctx, 0, 0, r * 0.62);
  ctx.setLineDash([r * 0.12, r * 0.1]);
  ctx.strokeStyle = withAlpha(lighten(color, 0.6), 0.7);
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i < 5; i++) {
    const angle = Math.PI * (0.62 + (i / 4) * 0.76);
    const cx = Math.cos(angle) * r * 0.2;
    const cy = Math.sin(angle) * r * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle + 0.35) * r * 0.2, cy + Math.sin(angle + 0.35) * r * 0.2);
    ctx.lineTo(cx + Math.cos(angle) * r * 0.55, cy + Math.sin(angle) * r * 0.55);
    ctx.lineTo(cx + Math.cos(angle - 0.35) * r * 0.2, cy + Math.sin(angle - 0.35) * r * 0.2);
    ctx.closePath();
    ctx.fillStyle = gold;
    ctx.fill();
  }
  circle(ctx, -r * 0.05, 0, r * 0.26);
  ctx.strokeStyle = gold;
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();

  circle(ctx, r * 0.42, 0, r * 0.34);
  ctx.fillStyle = shadedFill(ctx, r * 0.34, lighten(color, 0.15));
  ctx.fill();
  glowingEyes(ctx, r * 0.6, r * 0.14, r * 0.07, "#f43f5e");
};

const blob: BodyPainter = (ctx, r, color) => {
  circle(ctx, 0, 0, r);
  ctx.fillStyle = shadedFill(ctx, r, color);
  ctx.fill();
  eyes(ctx, r * 0.4, r * 0.35, r * 0.22);
};

/** A ghost light: a bright head trailing wisps of cold flame. */
const wisp: BodyPainter = (ctx, r, color) => {
  circle(ctx, r * 0.2, 0, r * 1.45);
  ctx.fillStyle = radial(ctx, r * 0.2, 0, r * 1.45, [
    [0, withAlpha(color, 0.5)],
    [1, withAlpha(color, 0)],
  ]);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(r * 0.3, 0, r * 0.72, -Math.PI / 2, Math.PI / 2);
  ctx.quadraticCurveTo(-r * 0.3, r * 0.62, -r * 0.9, 0);
  ctx.quadraticCurveTo(-r * 0.3, -r * 0.62, r * 0.3, -r * 0.72);
  ctx.fillStyle = radial(
    ctx,
    r * 0.3,
    0,
    r * 1.1,
    [
      [0, "#ffffff"],
      [0.45, lighten(color, 0.4)],
      [1, withAlpha(darken(color, 0.25), 0.6)],
    ],
    r * 0.45,
    -r * 0.1,
  );
  ctx.fill();

  ctx.fillStyle = withAlpha("#0f3d3a", 0.85);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(r * 0.62, side * r * 0.24, r * 0.14, r * 0.1, side * 0.4, 0, TAU);
    ctx.fill();
  }
};

const wispTail: FlapPainter = (ctx, r, color, phase) => {
  const sway = Math.sin(phase * TAU);
  // Three tongues of flame; the outer two sway against the middle one.
  for (const [length, side, width] of [
    [2.05, 0, 0.42],
    [1.55, -1, 0.3],
    [1.55, 1, 0.3],
  ] as const) {
    const tipX = -r * length;
    const tipY = r * (side * 0.42 + sway * 0.28 * (side === 0 ? 1 : -1));
    const w = r * width;
    ctx.beginPath();
    ctx.moveTo(r * 0.1, side * r * 0.3 - w);
    ctx.quadraticCurveTo(tipX * 0.5, tipY * 0.5 - w, tipX, tipY);
    ctx.quadraticCurveTo(tipX * 0.5, tipY * 0.5 + w, r * 0.1, side * r * 0.3 + w);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, r * 0.1, 0, tipX, tipY, [
      [0, withAlpha(lighten(color, 0.3), 0.9)],
      [0.6, withAlpha(color, 0.45)],
      [1, withAlpha(color, 0)],
    ]);
    ctx.fill();
  }
};

/** A hooded healer carrying a staff tipped with a living orb. */
const mender: BodyPainter = (ctx, r, color) => {
  const robe = darken(color, 0.55);
  const glow = lighten(color, 0.45);

  const orbX = r * 1.15;
  const orbY = r * 0.62;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, r * 0.9);
  ctx.lineTo(orbX, orbY);
  ctx.strokeStyle = "#3f2a1a";
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.stroke();
  ctx.strokeStyle = "#8a6440";
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(r * 0.72, 0);
  ctx.bezierCurveTo(r * 0.7, -r * 0.98, -r * 0.95, -r * 1.05, -r * 1.02, 0);
  ctx.bezierCurveTo(-r * 0.95, r * 1.05, r * 0.7, r * 0.98, r * 0.72, 0);
  ctx.fillStyle = shadedFill(ctx, r, robe);
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.78);
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.stroke();

  // A leaf-cross rune stitched in light across the back of the cloak.
  const runeX = -r * 0.42;
  circle(ctx, runeX, 0, r * 0.42);
  ctx.fillStyle = radial(ctx, runeX, 0, r * 0.42, [
    [0, withAlpha(glow, 0.45)],
    [1, withAlpha(glow, 0)],
  ]);
  ctx.fill();
  ctx.fillStyle = glow;
  const arm = r * 0.26;
  const thick = r * 0.1;
  ctx.fillRect(runeX - arm, -thick / 2, arm * 2, thick);
  ctx.fillRect(runeX - thick / 2, -arm, thick, arm * 2);

  circle(ctx, r * 0.22, 0, r * 0.46);
  ctx.fillStyle = shadedFill(ctx, r * 0.46, darken(color, 0.35));
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.75);
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(r * 0.5, 0, r * 0.18, r * 0.28, 0, 0, TAU);
  ctx.fillStyle = "#04110b";
  ctx.fill();
  glowingEyes(ctx, r * 0.56, r * 0.1, r * 0.045, color);

  circle(ctx, r * 0.5, r * 0.7, r * 0.15);
  ctx.fillStyle = darken(color, 0.4);
  ctx.fill();

  circle(ctx, orbX, orbY, r * 0.6);
  ctx.fillStyle = radial(ctx, orbX, orbY, r * 0.6, [
    [0, withAlpha(glow, 0.8)],
    [1, withAlpha(glow, 0)],
  ]);
  ctx.fill();
  circle(ctx, orbX, orbY, r * 0.22);
  ctx.fillStyle = radial(ctx, orbX, orbY, r * 0.22, [
    [0, "#ffffff"],
    [0.5, glow],
    [1, color],
  ]);
  ctx.fill();
};

/** An armoured wyvern: steel plates over a lean body, wings drawn by `harrierWings`. */
const harrier: BodyPainter = (ctx, r, color) => {
  const hide = darken(color, 0.5);
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, -r * 0.2);
  ctx.quadraticCurveTo(-r * 1.1, -r * 0.08, -r * 1.55, 0);
  ctx.quadraticCurveTo(-r * 1.1, r * 0.08, -r * 0.3, r * 0.2);
  ctx.closePath();
  ctx.fillStyle = hide;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r * 1.4, 0);
  ctx.lineTo(-r * 1.62, -r * 0.2);
  ctx.lineTo(-r * 1.9, 0);
  ctx.lineTo(-r * 1.62, r * 0.2);
  ctx.closePath();
  ctx.fillStyle = "#cbd5e1";
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(-r * 0.05, 0, r * 0.66, r * 0.42, 0, 0, TAU);
  ctx.fillStyle = linear(ctx, 0, -r * 0.42, 0, r * 0.42, STEEL);
  ctx.fill();
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.stroke();
  // Overlapping plates, then a coloured spine ridge.
  ctx.beginPath();
  for (const px of [-r * 0.45, -r * 0.1, r * 0.25]) {
    ctx.moveTo(px, -r * 0.36);
    ctx.quadraticCurveTo(px + r * 0.16, 0, px, r * 0.36);
  }
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, 0);
  ctx.lineTo(r * 0.5, 0);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(r * 1.38, 0);
  ctx.lineTo(r * 0.82, -r * 0.26);
  ctx.lineTo(r * 0.5, -r * 0.18);
  ctx.lineTo(r * 0.5, r * 0.18);
  ctx.lineTo(r * 0.82, r * 0.26);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, r * 0.5, -r * 0.26, r * 0.9, r * 0.26, STEEL);
  ctx.fill();
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.62, side * r * 0.2);
    ctx.lineTo(r * 0.3, side * r * 0.42);
    ctx.lineTo(r * 0.52, side * r * 0.12);
    ctx.closePath();
    ctx.fillStyle = "#e5e7eb";
    ctx.fill();
  }
  glowingEyes(ctx, r * 0.9, r * 0.13, r * 0.055, "#fbbf24");
};

const harrierWings: FlapPainter = (ctx, r, color, phase) => {
  const lift = 0.5 + 0.5 * Math.sin(phase * TAU);
  const span = r * (1.3 + lift * 0.9);
  const sweep = r * (0.35 - lift * 0.2);
  const membrane = darken(color, 0.3);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    const wrist: readonly [number, number] = [r * 0.2 - sweep * 0.4, side * span * 0.62];
    const tip: readonly [number, number] = [-r * 0.3 - sweep, side * span];
    const fingers: readonly (readonly [number, number])[] = [
      [-r * 0.78 - sweep, side * span * 0.78],
      [-r * 0.82 - sweep * 0.5, side * span * 0.48],
    ];
    const root: readonly [number, number] = [-r * 0.45, side * r * 0.24];

    ctx.beginPath();
    ctx.moveTo(r * 0.3, side * r * 0.28);
    ctx.lineTo(wrist[0], wrist[1]);
    ctx.lineTo(tip[0], tip[1]);
    // Scalloped trailing edge between the finger bones.
    let prev = tip;
    for (const point of [...fingers, root]) {
      ctx.quadraticCurveTo(
        (prev[0] + point[0]) / 2 + r * 0.22,
        (prev[1] + point[1]) / 2 - side * r * 0.12,
        point[0],
        point[1],
      );
      prev = point;
    }
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, side * r * 0.3, 0, side * span, [
      [0, darken(membrane, 0.35)],
      [1, membrane],
    ]);
    ctx.fill();
    ctx.strokeStyle = darken(color, 0.65);
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.stroke();

    ctx.beginPath();
    for (const point of [...fingers, root]) {
      ctx.moveTo(wrist[0], wrist[1]);
      ctx.lineTo(point[0], point[1]);
    }
    ctx.strokeStyle = withAlpha(lighten(color, 0.3), 0.55);
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.stroke();

    // An armoured leading edge.
    ctx.beginPath();
    ctx.moveTo(r * 0.3, side * r * 0.28);
    ctx.lineTo(wrist[0], wrist[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.stroke();
    circle(ctx, wrist[0], wrist[1], r * 0.09);
    ctx.fillStyle = "#e5e7eb";
    ctx.fill();
  }
};

function broodlingShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  angle: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, 0, r * 0.75, r * 0.6, 0, 0, TAU);
  ctx.moveTo(r * 0.95, 0);
  ctx.arc(r * 0.55, 0, r * 0.4, 0, TAU);
  ctx.restore();
}

/** A swollen egg sac on beetle legs, its young squirming visibly inside. */
const brood: BodyPainter = (ctx, r, color) => {
  const shell = darken(color, 0.55);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.95, side * r * 0.12);
    ctx.quadraticCurveTo(r * 1.3, side * r * 0.2, r * 1.25, side * r * 0.02);
    ctx.strokeStyle = "#1c1917";
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(r * 0.74, 0, r * 0.34, r * 0.38, 0, 0, TAU);
  ctx.fillStyle = shadedFill(ctx, r * 0.38, shell);
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.8);
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();
  glowingEyes(ctx, r * 0.9, r * 0.14, r * 0.05, "#fef08a");

  const sacX = -r * 0.15;
  ctx.beginPath();
  ctx.ellipse(sacX, 0, r * 1.0, r * 0.88, 0, 0, TAU);
  ctx.fillStyle = radial(ctx, sacX, 0, r * 1.0, [
    [0, lighten(color, 0.3)],
    [0.7, color],
    [1, darken(color, 0.35)],
  ]);
  ctx.fill();

  ctx.fillStyle = withAlpha(darken(color, 0.6), 0.75);
  for (const [bx, by, angle] of [
    [-0.45, -0.32, 2.4],
    [-0.5, 0.35, -2.2],
    [0.2, 0.02, 0.3],
  ] as const) {
    broodlingShape(ctx, sacX + r * bx, r * by, r * 0.3, angle);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.ellipse(sacX, 0, r * 1.0, r * 0.88, 0, 0, TAU);
  ctx.fillStyle = radial(
    ctx,
    sacX,
    0,
    r,
    [
      [0, withAlpha("#ffffff", 0.35)],
      [0.4, withAlpha(lighten(color, 0.5), 0.12)],
      [1, withAlpha(color, 0)],
    ],
    sacX - r * 0.35,
    -r * 0.4,
  );
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.5);
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sacX + r * 0.85, -r * 0.35);
  ctx.quadraticCurveTo(sacX + r * 0.2, -r * 0.55, sacX - r * 0.2, -r * 0.82);
  ctx.moveTo(sacX + r * 0.85, r * 0.35);
  ctx.quadraticCurveTo(sacX + r * 0.1, r * 0.3, sacX - r * 0.6, r * 0.68);
  ctx.strokeStyle = withAlpha(darken(color, 0.45), 0.7);
  ctx.lineWidth = Math.max(1, r * 0.04);
  ctx.stroke();
};

/** A tiny, quick bug: three legs a side, a striped back and bright eyes. */
const broodling: BodyPainter = (ctx, r, color) => {
  ctx.beginPath();
  for (const side of [-1, 1]) {
    for (const [from, to] of [
      [0.35, 0.75],
      [0, 0.05],
      [-0.35, -0.75],
    ] as const) {
      ctx.moveTo(r * from, side * r * 0.35);
      ctx.lineTo(r * (from + to) * 0.7, side * r * 0.9);
      ctx.lineTo(r * to, side * r * 1.2);
    }
  }
  ctx.strokeStyle = darken(color, 0.65);
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(-r * 0.3, 0, r * 0.78, r * 0.62, 0, 0, TAU);
  ctx.fillStyle = shadedFill(ctx, r * 0.78, color);
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.6);
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, -r * 0.55);
  ctx.quadraticCurveTo(-r * 0.15, 0, -r * 0.3, r * 0.55);
  ctx.stroke();

  circle(ctx, r * 0.58, 0, r * 0.4);
  ctx.fillStyle = darken(color, 0.5);
  ctx.fill();
  glowingEyes(ctx, r * 0.72, r * 0.18, r * 0.1, "#f87171");
};

/** The rift lord: a spiked mantle, great horns and a crown of rift crystals. */
const tyrant: BodyPainter = (ctx, r, color) => {
  const armor = darken(color, 0.72);
  const rift = lighten(color, 0.55);

  circle(ctx, 0, 0, r * 1.4);
  ctx.fillStyle = radial(ctx, 0, 0, r * 1.4, [
    [0.4, withAlpha(color, 0.45)],
    [1, withAlpha(color, 0)],
  ]);
  ctx.fill();

  // The jagged mantle fans out behind the shoulders.
  const spikes = 9;
  ctx.beginPath();
  ctx.moveTo(r * 0.2, -r * 0.8);
  for (let i = 0; i <= spikes * 2; i++) {
    const angle = Math.PI * (0.62 + (i / (spikes * 2)) * 0.76);
    const reach = i % 2 === 0 ? r * 0.82 : r * (1.22 + (i % 4 === 1 ? 0.1 : 0));
    ctx.lineTo(Math.cos(angle) * reach, -Math.sin(angle) * reach);
  }
  ctx.lineTo(r * 0.2, r * 0.8);
  ctx.closePath();
  ctx.fillStyle = radial(ctx, 0, 0, r * 1.3, [
    [0.5, darken(color, 0.55)],
    [1, darken(color, 0.85)],
  ]);
  ctx.fill();
  ctx.strokeStyle = withAlpha(rift, 0.5);
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.stroke();

  circle(ctx, -r * 0.05, 0, r * 0.74);
  ctx.fillStyle = shadedFill(ctx, r * 0.74, color);
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.7);
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();

  // Glowing fissures across the back.
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, -r * 0.1);
  ctx.lineTo(-r * 0.45, -r * 0.02);
  ctx.lineTo(-r * 0.3, -r * 0.25);
  ctx.lineTo(-r * 0.08, -r * 0.18);
  ctx.moveTo(-r * 0.45, -r * 0.02);
  ctx.lineTo(-r * 0.36, r * 0.22);
  ctx.lineTo(-r * 0.12, r * 0.3);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = withAlpha(rift, 0.35);
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.stroke();
  ctx.strokeStyle = "#fdf4ff";
  ctx.lineWidth = Math.max(1, r * 0.035);
  ctx.stroke();

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.05, side * r * 0.78);
    ctx.lineTo(-r * 0.2, side * r * 1.28);
    ctx.lineTo(r * 0.18, side * r * 0.85);
    ctx.closePath();
    ctx.fillStyle = "#e7e5e4";
    ctx.fill();
    circle(ctx, 0, side * r * 0.64, r * 0.36);
    ctx.fillStyle = radial(
      ctx,
      0,
      side * r * 0.64,
      r * 0.36,
      [
        [0, lighten(armor, 0.35)],
        [1, armor],
      ],
      -r * 0.1,
      side * r * 0.55,
    );
    ctx.fill();
    ctx.strokeStyle = withAlpha(rift, 0.6);
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.stroke();
  }

  const headX = r * 0.45;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(headX - r * 0.05, side * r * 0.2);
    ctx.quadraticCurveTo(headX - r * 0.15, side * r * 0.95, headX + r * 0.75, side * r * 0.88);
    ctx.quadraticCurveTo(headX + r * 0.1, side * r * 0.68, headX + r * 0.12, side * r * 0.26);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, headX, side * r * 0.2, headX + r * 0.75, side * r * 0.88, [
      [0, "#57534e"],
      [0.5, "#d6d3d1"],
      [1, "#fafaf9"],
    ]);
    ctx.fill();
    ctx.strokeStyle = "#1c1917";
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.stroke();
  }

  circle(ctx, headX, 0, r * 0.34);
  ctx.fillStyle = shadedFill(ctx, r * 0.34, darken(color, 0.3));
  ctx.fill();
  ctx.strokeStyle = darken(color, 0.8);
  ctx.lineWidth = Math.max(1, r * 0.04);
  ctx.stroke();

  // The crown: rift crystals standing in an arc behind the brow.
  circle(ctx, headX - r * 0.12, 0, r * 0.62);
  ctx.fillStyle = radial(ctx, headX - r * 0.12, 0, r * 0.62, [
    [0.3, withAlpha(rift, 0.4)],
    [1, withAlpha(rift, 0)],
  ]);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const angle = Math.PI * (0.55 + (i / 4) * 0.9);
    const length = r * (i === 2 ? 0.48 : 0.38);
    const baseX = headX + Math.cos(angle) * r * 0.26;
    const baseY = Math.sin(angle) * r * 0.26;
    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.1);
    ctx.lineTo(length, 0);
    ctx.lineTo(0, r * 0.1);
    ctx.lineTo(-r * 0.06, 0);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, 0, length, 0, [
      [0, lighten(color, 0.2)],
      [0.55, rift],
      [1, "#ffffff"],
    ]);
    ctx.fill();
    ctx.strokeStyle = darken(color, 0.8);
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.stroke();
    ctx.restore();
  }
  glowingEyes(ctx, headX + r * 0.2, r * 0.13, r * 0.06, "#fef08a");
};

const ART: Readonly<Record<string, EnemyArt>> = {
  runner: { extent: 2.8, body: runner },
  grunt: { extent: 2.6, body: grunt },
  brute: { extent: 2.7, body: brute },
  warden: { extent: 2.5, body: warden },
  wisp: { extent: 4.4, body: wisp, flap: wispTail },
  mender: { extent: 3.6, body: mender },
  harrier: { extent: 4.9, body: harrier, flap: harrierWings },
  brood: { extent: 2.9, body: brood },
  broodling: { extent: 2.8, body: broodling },
  tyrant: { extent: 3, body: tyrant },
};

export function enemyArt(id: string): EnemyArt {
  return ART[id] ?? { extent: 2.4, body: blob };
}

/** Feet under the body, stepping with `phase`. Drawn every frame, facing +x. */
export function paintFeet(
  ctx: CanvasRenderingContext2D,
  id: string,
  r: number,
  phase: number,
): void {
  ctx.fillStyle = darken(enemyColor(id), 0.55);
  const stride = Math.sin(phase) * r * 0.38;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * stride, side * r * 0.62, r * 0.32, r * 0.2, 0, 0, TAU);
    ctx.fill();
  }
}
