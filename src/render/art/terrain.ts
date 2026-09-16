import { withAlpha } from "../color";
import { PALETTE } from "../palette";
import { circle, hash, radial, TAU } from "./common";

/** Scattered detail painted on open ground; each theme picks one. */
type GroundDecor = "tufts" | "snow" | "embers" | "shards";

/** Colours and decoration for one chapter's static board. */
export interface TerrainTheme {
  readonly id: string;
  /** Fills the canvas around the board. */
  readonly background: string;
  readonly open: string;
  readonly openAlt: string;
  /** Grass tufts, snow drifts, ember seams or crystal shards. */
  readonly detail: string;
  readonly pebble: string;
  readonly decor: GroundDecor;
  readonly rock: string;
  readonly rockLight: string;
  readonly rockEdge: string;
  /** Snow cap, lava seam or crystal glint on rocks. */
  readonly rockAccent: string;
  readonly spawn: string;
  readonly exit: string;
  readonly exitMortar: string;
  readonly gridLine: string;
}

const MEADOW: TerrainTheme = {
  id: "meadow",
  background: PALETTE.background,
  open: PALETTE.open,
  openAlt: PALETTE.openAlt,
  detail: PALETTE.tuft,
  pebble: PALETTE.pebble,
  decor: "tufts",
  rock: PALETTE.rock,
  rockLight: PALETTE.rockLight,
  rockEdge: PALETTE.rockEdge,
  rockAccent: "#000000",
  spawn: PALETTE.spawn,
  exit: PALETTE.exit,
  exitMortar: PALETTE.exitMortar,
  gridLine: PALETTE.gridLine,
};

const THEMES: Readonly<Record<string, TerrainTheme>> = {
  meadow: MEADOW,
  frost: {
    id: "frost",
    background: "#0a1017",
    open: "#1a2733",
    openAlt: "#1c2a37",
    detail: "#263848",
    pebble: "#5f7f98",
    decor: "snow",
    rock: "#31465a",
    rockLight: "#8aa9c2",
    rockEdge: "#111b25",
    rockAccent: "#e6f4ff",
    spawn: "#211722",
    exit: "#16282a",
    exitMortar: "#0e1b1d",
    gridLine: "rgba(210, 235, 255, 0.04)",
  },
  ash: {
    id: "ash",
    background: "#0b0908",
    open: "#171413",
    openAlt: "#191615",
    detail: "#f97316",
    pebble: "#2b2522",
    decor: "embers",
    rock: "#221d1b",
    rockLight: "#4d4540",
    rockEdge: "#0c0a09",
    rockAccent: "#fb923c",
    spawn: "#241012",
    exit: "#15221b",
    exitMortar: "#0c1510",
    gridLine: "rgba(255, 220, 200, 0.03)",
  },
  rift: {
    id: "rift",
    background: "#07050c",
    open: "#130f1d",
    openAlt: "#15111f",
    detail: "#8b5cf6",
    pebble: "#2a2240",
    decor: "shards",
    rock: "#241b38",
    rockLight: "#5b4a86",
    rockEdge: "#0b0814",
    rockAccent: "#e879f9",
    spawn: "#220e1c",
    exit: "#12221f",
    exitMortar: "#0b1614",
    gridLine: "rgba(220, 200, 255, 0.035)",
  },
};

/** The terrain palette for a chapter theme id. Unknown or missing ids get the meadow. */
export function terrainTheme(id: string | undefined): TerrainTheme {
  return (id === undefined ? undefined : THEMES[id]) ?? MEADOW;
}

function paintDecor(
  ctx: CanvasRenderingContext2D,
  theme: TerrainTheme,
  x: number,
  y: number,
  left: number,
  top: number,
  s: number,
): void {
  // A stable offset in [0.5 - span / 2, 0.5 + span / 2) of the cell.
  const at = (salt: number, span = 0.7): number => 0.5 - span / 2 + hash(x, y, salt) * span;
  ctx.lineCap = "round";
  switch (theme.decor) {
    case "tufts": {
      ctx.strokeStyle = theme.detail;
      ctx.lineWidth = Math.max(1, s * 0.03);
      const tufts = Math.floor(hash(x, y, 1) * 3);
      for (let i = 0; i < tufts; i++) {
        const tx = left + s * (0.15 + hash(x, y, 10 + i) * 0.7);
        const ty = top + s * (0.2 + hash(x, y, 20 + i) * 0.65);
        ctx.beginPath();
        ctx.moveTo(tx - s * 0.04, ty);
        ctx.lineTo(tx - s * 0.06, ty - s * 0.07);
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx, ty - s * 0.09);
        ctx.moveTo(tx + s * 0.04, ty);
        ctx.lineTo(tx + s * 0.06, ty - s * 0.07);
        ctx.stroke();
      }
      break;
    }
    case "snow": {
      // Soft drifts plus the odd glinting ice fleck.
      if (hash(x, y, 1) > 0.45) {
        ctx.fillStyle = theme.detail;
        ctx.beginPath();
        ctx.ellipse(
          left + s * at(10),
          top + s * at(11),
          s * (0.16 + hash(x, y, 12) * 0.12),
          s * 0.07,
          (hash(x, y, 13) - 0.5) * 0.6,
          0,
          TAU,
        );
        ctx.fill();
      }
      ctx.fillStyle = withAlpha("#e0f2fe", 0.35);
      for (let i = 0; i < 2; i++) {
        if (hash(x, y, 40 + i) < 0.55) continue;
        circle(ctx, left + s * at(50 + i, 0.8), top + s * at(60 + i, 0.8), s * 0.018);
        ctx.fill();
      }
      break;
    }
    case "embers": {
      // A hairline seam of cooling lava on roughly one tile in three.
      if (hash(x, y, 1) > 0.78) {
        const sx = left + s * at(10, 0.4);
        const sy = top + s * at(11, 0.4);
        const angle = hash(x, y, 12) * TAU;
        ctx.beginPath();
        ctx.moveTo(sx - Math.cos(angle) * s * 0.22, sy - Math.sin(angle) * s * 0.22);
        ctx.lineTo(sx + (hash(x, y, 13) - 0.5) * s * 0.12, sy + (hash(x, y, 14) - 0.5) * s * 0.12);
        ctx.lineTo(sx + Math.cos(angle) * s * 0.2, sy + Math.sin(angle) * s * 0.2);
        ctx.strokeStyle = withAlpha(theme.detail, 0.1);
        ctx.lineWidth = Math.max(2, s * 0.08);
        ctx.stroke();
        ctx.strokeStyle = withAlpha(theme.detail, 0.4);
        ctx.lineWidth = Math.max(1, s * 0.022);
        ctx.stroke();
      }
      if (hash(x, y, 7) > 0.7) {
        ctx.fillStyle = withAlpha("#fdba74", 0.45);
        circle(ctx, left + s * at(20, 0.8), top + s * at(21, 0.8), s * 0.016);
        ctx.fill();
      }
      break;
    }
    case "shards": {
      if (hash(x, y, 1) > 0.62) {
        const tall = s * (0.07 + hash(x, y, 12) * 0.06);
        ctx.save();
        ctx.translate(left + s * at(10, 0.6), top + s * at(11, 0.6));
        ctx.rotate((hash(x, y, 13) - 0.5) * 1.2);
        ctx.beginPath();
        ctx.moveTo(0, -tall);
        ctx.lineTo(tall * 0.35, 0);
        ctx.lineTo(0, tall * 0.6);
        ctx.lineTo(-tall * 0.35, 0);
        ctx.closePath();
        ctx.fillStyle = withAlpha(theme.detail, 0.28);
        ctx.fill();
        ctx.strokeStyle = withAlpha(theme.detail, 0.45);
        ctx.lineWidth = Math.max(1, s * 0.012);
        ctx.stroke();
        ctx.restore();
      }
      if (hash(x, y, 7) > 0.75) {
        ctx.fillStyle = withAlpha("#c4b5fd", 0.3);
        circle(ctx, left + s * at(20, 0.85), top + s * at(21, 0.85), s * 0.014);
        ctx.fill();
      }
      break;
    }
  }
}

/** Paints one cell of open ground with stable, subtle variation. `x`, `y` is the cell. */
export function paintGround(
  ctx: CanvasRenderingContext2D,
  theme: TerrainTheme,
  x: number,
  y: number,
  left: number,
  top: number,
  s: number,
): void {
  ctx.fillStyle = (x + y) % 2 === 0 ? theme.open : theme.openAlt;
  ctx.fillRect(left, top, s, s);

  paintDecor(ctx, theme, x, y, left, top, s);
  if (hash(x, y, 2) > 0.6) {
    ctx.fillStyle = theme.pebble;
    circle(
      ctx,
      left + s * (0.2 + hash(x, y, 3) * 0.6),
      top + s * (0.2 + hash(x, y, 4) * 0.6),
      s * 0.035,
    );
    ctx.fill();
  }

  ctx.strokeStyle = theme.gridLine;
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, s - 1, s - 1);
}

export function paintRock(
  ctx: CanvasRenderingContext2D,
  theme: TerrainTheme,
  x: number,
  y: number,
  left: number,
  top: number,
  s: number,
): void {
  paintGround(ctx, theme, x, y, left, top, s);
  const cx = left + s / 2;
  const cy = top + s / 2;
  // Rift crystal clusters are fewer-sided and sharper than weathered stone.
  const crystal = theme.decor === "shards";
  const points = crystal ? 6 : 9;
  const outline: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * TAU + hash(x, y, 5) * TAU;
    const reach = s * (0.34 + hash(x, y, 30 + i) * (crystal ? 0.13 : 0.09));
    outline.push([cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach]);
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.12, s * 0.42, s * 0.3, 0, 0, TAU);
  ctx.fill();

  ctx.beginPath();
  for (const [px, py] of outline) ctx.lineTo(px, py);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(cx - s * 0.4, cy - s * 0.4, cx + s * 0.4, cy + s * 0.4);
  gradient.addColorStop(0, theme.rockLight);
  gradient.addColorStop(1, theme.rock);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = theme.rockEdge;
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.1, cy - s * 0.14, s * 0.16, s * 0.08, -0.5, 0, TAU);
  ctx.fill();

  const crack = (): void => {
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.05, cy - s * 0.05);
    ctx.lineTo(cx + s * 0.12, cy + s * 0.08);
    ctx.lineTo(cx + s * 0.08, cy + s * 0.2);
  };
  const accent = theme.rockAccent;
  switch (theme.decor) {
    case "tufts":
      crack();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
      ctx.lineWidth = Math.max(1, s * 0.025);
      ctx.stroke();
      break;
    case "snow":
      // A snow cap resting on the lit shoulder of the rock.
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.3, cy - s * 0.02);
      ctx.quadraticCurveTo(cx - s * 0.26, cy - s * 0.3, cx + s * 0.02, cy - s * 0.3);
      ctx.quadraticCurveTo(cx + s * 0.2, cy - s * 0.28, cx + s * 0.22, cy - s * 0.14);
      ctx.quadraticCurveTo(cx + s * 0.06, cy - s * 0.18, cx - s * 0.02, cy - s * 0.08);
      ctx.quadraticCurveTo(cx - s * 0.14, cy + s * 0.02, cx - s * 0.3, cy - s * 0.02);
      ctx.fillStyle = withAlpha(accent, 0.82);
      ctx.fill();
      crack();
      ctx.strokeStyle = "rgba(8, 20, 32, 0.45)";
      ctx.lineWidth = Math.max(1, s * 0.025);
      ctx.stroke();
      break;
    case "embers":
      crack();
      ctx.strokeStyle = withAlpha(accent, 0.22);
      ctx.lineWidth = Math.max(2, s * 0.1);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.stroke();
      break;
    case "shards":
      // Facet lines from the crystal's peak out to every other corner.
      ctx.beginPath();
      outline.forEach(([px, py], i) => {
        if (i % 2 !== 0) return;
        ctx.moveTo(cx + s * 0.02, cy - s * 0.02);
        ctx.lineTo(px, py);
      });
      ctx.strokeStyle = withAlpha(accent, 0.35);
      ctx.lineWidth = Math.max(1, s * 0.02);
      ctx.stroke();
      circle(ctx, cx + s * 0.02, cy - s * 0.02, s * 0.05);
      ctx.fillStyle = withAlpha(accent, 0.6);
      ctx.fill();
      break;
  }
}

export function paintSpawnTile(
  ctx: CanvasRenderingContext2D,
  theme: TerrainTheme,
  left: number,
  top: number,
  s: number,
): void {
  ctx.fillStyle = theme.spawn;
  ctx.fillRect(left, top, s, s);
  ctx.strokeStyle = theme.gridLine;
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, s - 1, s - 1);
}

export function paintExitTile(
  ctx: CanvasRenderingContext2D,
  theme: TerrainTheme,
  left: number,
  top: number,
  s: number,
): void {
  ctx.fillStyle = theme.exit;
  ctx.fillRect(left, top, s, s);
  ctx.strokeStyle = theme.exitMortar;
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  for (let row = 1; row < 3; row++) {
    ctx.moveTo(left, top + (s * row) / 3);
    ctx.lineTo(left + s, top + (s * row) / 3);
  }
  for (let row = 0; row < 3; row++) {
    const shift = row % 2 === 0 ? 0 : s / 4;
    for (let col = 0; col < 2; col++) {
      const bx = left + shift + (col * s) / 2 + s / 4;
      ctx.moveTo(bx, top + (s * row) / 3);
      ctx.lineTo(bx, top + (s * (row + 1)) / 3);
    }
  }
  ctx.stroke();
}

/**
 * The rift enemies pour out of. Drawn every frame; `rx`, `ry` are screen radii.
 * `surge` in [0, 1] flares it while a wave is spawning.
 */
export function paintPortal(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  now: number,
  surge: number,
): void {
  const color = PALETTE.portal;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  circle(ctx, 0, 0, 1);
  ctx.fillStyle = radial(ctx, 0, 0, 1, [
    [0, "#fff1f2"],
    [0.25, withAlpha(color, 0.9)],
    [0.7, withAlpha("#7f1d1d", 0.75)],
    [1, withAlpha("#450a0a", 0)],
  ]);
  ctx.fill();
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const turn = now / (900 - i * 180) + (i * TAU) / 3;
    ctx.beginPath();
    ctx.arc(0, 0, 0.45 + i * 0.17, turn, turn + 1.6);
    ctx.strokeStyle = withAlpha("#fecdd3", 0.55 + surge * 0.4);
    ctx.lineWidth = 0.06;
    ctx.stroke();
  }
  ctx.restore();
}

/** The crystal core behind the gate: the thing the player defends. */
export function paintCore(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  now: number,
  hurt: number,
): void {
  const color = hurt > 0 ? PALETTE.hpLow : PALETTE.core;
  const pulse = 0.5 + 0.5 * Math.sin(now / 520);
  const glow = s * (0.9 + pulse * 0.15 + hurt * 0.4);
  circle(ctx, cx, cy, glow);
  ctx.fillStyle = radial(ctx, cx, cy, glow, [
    [0, withAlpha(color, 0.45 + hurt * 0.3)],
    [1, withAlpha(color, 0)],
  ]);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.5);
  ctx.lineTo(cx + s * 0.28, cy - s * 0.05);
  ctx.lineTo(cx, cy + s * 0.5);
  ctx.lineTo(cx - s * 0.28, cy - s * 0.05);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(
    cx - s * 0.28,
    cy - s * 0.5,
    cx + s * 0.28,
    cy + s * 0.5,
  );
  gradient.addColorStop(0, "#f0fdf4");
  gradient.addColorStop(0.45, color);
  gradient.addColorStop(1, "#14532d");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.5);
  ctx.lineTo(cx, cy + s * 0.5);
  ctx.stroke();
}
