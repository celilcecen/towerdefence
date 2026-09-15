import type { Selection } from "../app/session";
import type { Cell } from "../core/geometry";
import { cellCenter } from "../core/geometry";
import type { Grid } from "../core/grid";
import type { Simulation } from "../core/simulation";
import type { EnemyState, TowerState } from "../core/state";
import { currentLevel, towerCenter } from "../core/state";
import { circle, TAU } from "./art/common";
import { enemyArt, paintFeet } from "./art/enemies";
import { paintDart, paintShell } from "./art/projectiles";
import {
  paintCore,
  paintExitTile,
  paintGround,
  paintPortal,
  paintRock,
  paintSpawnTile,
} from "./art/terrain";
import { towerArt, TURRET_SCALE } from "./art/towers";
import { withAlpha } from "./color";
import type { Effects } from "./effects";
import type { BoardLayout } from "./layout";
import { computeLayout, pointToCell, screenAngle, toScreen } from "./layout";
import type { TurretAim } from "./motion";
import { enemyHeading } from "./motion";
import { enemyColor, isBoss, PALETTE, towerColor } from "./palette";
import type { SurfaceFactory } from "./sprite-cache";
import { SpriteCache } from "./sprite-cache";

export interface RenderFrame {
  readonly simulation: Simulation;
  readonly selection: Selection;
  readonly hover: Cell | undefined;
  /** Interpolation between the previous and current tick, in [0, 1). */
  readonly alpha: number;
  readonly now: number;
  readonly effects: Effects;
  readonly aim: TurretAim;
  readonly reducedMotion: boolean;
}

interface Region {
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Centre and half extents, in cells, of the box around a group of cells. */
function regionOf(cells: readonly Cell[]): Region | undefined {
  if (cells.length === 0) return undefined;
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs) + 1;
  const maxY = Math.max(...ys) + 1;
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    halfWidth: (maxX - minX) / 2,
    halfHeight: (maxY - minY) / 2,
  };
}

/** Draws a read-only view of the world. Holds no game state of its own. */
export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sprites: SpriteCache;
  private layout: BoardLayout = computeLayout(1, 1, 1, 1);
  private cssWidth = 1;
  private cssHeight = 1;
  private pixelRatio = 1;
  /** Terrain never changes during a game, so it is painted once per size. */
  private terrain: { readonly grid: Grid; readonly image: CanvasImageSource } | undefined;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly createSurface: SurfaceFactory,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not supported in this browser.");
    this.ctx = ctx;
    this.sprites = new SpriteCache(createSurface);
  }

  resize(
    cssWidth: number,
    cssHeight: number,
    pixelRatio: number,
    columns: number,
    rows: number,
  ): void {
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.pixelRatio = pixelRatio;
    this.canvas.width = Math.round(cssWidth * pixelRatio);
    this.canvas.height = Math.round(cssHeight * pixelRatio);
    this.layout = computeLayout(cssWidth, cssHeight, columns, rows);
    this.sprites.configure(this.layout.cellSize, pixelRatio);
    this.terrain = undefined;
  }

  cellAt(clientX: number, clientY: number): Cell | undefined {
    const rect = this.canvas.getBoundingClientRect();
    return pointToCell(this.layout, clientX - rect.left, clientY - rect.top);
  }

  draw(frame: RenderFrame): void {
    // A collapsed stage (hidden tab, first layout pass) has nothing to draw into.
    if (this.canvas.width === 0 || this.canvas.height === 0) return;
    const { ctx } = this;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.fillStyle = PALETTE.background;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    this.drawTerrain(frame.simulation.grid);
    this.drawLandmarks(frame);
    this.drawPath(frame);
    this.drawHover(frame);
    for (const tower of frame.simulation.world.towers) this.drawTower(tower, frame);
    for (const enemy of frame.simulation.world.enemies) this.drawEnemy(enemy, frame);
    this.drawProjectiles(frame);
    frame.effects.draw(ctx, (x, y) => this.point(x, y), this.layout.cellSize, frame.now);
    this.drawSelection(frame);
  }

  private point(x: number, y: number): { x: number; y: number } {
    return toScreen(this.layout, x, y);
  }

  /** Top-left corner, in CSS pixels, of a cell. Correct whether or not the board is rotated. */
  private cellOrigin(x: number, y: number): { x: number; y: number } {
    const center = this.point(x + 0.5, y + 0.5);
    const half = this.layout.cellSize / 2;
    return { x: center.x - half, y: center.y - half };
  }

  private drawTerrain(grid: Grid): void {
    if (this.terrain?.grid !== grid) {
      const { image, context } = this.createSurface(this.canvas.width, this.canvas.height);
      context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      const size = this.layout.cellSize;
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          const { x: left, y: top } = this.cellOrigin(x, y);
          switch (grid.terrainAt(x, y)) {
            case "rock":
              paintRock(context, x, y, left, top, size);
              break;
            case "spawn":
              paintSpawnTile(context, left, top, size);
              break;
            case "exit":
              paintExitTile(context, left, top, size);
              break;
            case "open":
              paintGround(context, x, y, left, top, size);
              break;
          }
        }
      }
      const a = this.point(0, 0);
      const b = this.point(grid.width, grid.height);
      context.strokeStyle = "rgba(255, 255, 255, 0.08)";
      context.lineWidth = 1;
      context.strokeRect(
        Math.min(a.x, b.x) + 0.5,
        Math.min(a.y, b.y) + 0.5,
        Math.abs(b.x - a.x) - 1,
        Math.abs(b.y - a.y) - 1,
      );
      this.terrain = { grid, image };
    }
    this.ctx.drawImage(this.terrain.image, 0, 0, this.cssWidth, this.cssHeight);
  }

  /** The rift enemies come from and the crystal they are trying to reach. */
  private drawLandmarks(frame: RenderFrame): void {
    const { grid, world } = frame.simulation;
    const size = this.layout.cellSize;
    const now = frame.reducedMotion ? 0 : frame.now;
    const screenRadii = (region: Region): { rx: number; ry: number } =>
      this.layout.rotated
        ? { rx: region.halfHeight * size, ry: region.halfWidth * size }
        : { rx: region.halfWidth * size, ry: region.halfHeight * size };

    const spawn = regionOf(grid.spawns);
    if (spawn) {
      const c = this.point(spawn.x, spawn.y);
      const { rx, ry } = screenRadii(spawn);
      paintPortal(this.ctx, c.x, c.y, rx * 0.85, ry * 0.9, now, world.phase === "wave" ? 1 : 0);
    }
    const exit = regionOf(grid.exits);
    if (exit) {
      const c = this.point(exit.x, exit.y);
      const { rx, ry } = screenRadii(exit);
      paintCore(this.ctx, c.x, c.y, Math.min(rx, ry) * 1.6, now, frame.effects.coreHurt(frame.now));
    }
  }

  /** Chevrons marching along the route enemies will take right now. */
  private drawPath(frame: RenderFrame): void {
    const { ctx } = this;
    const size = this.layout.cellSize;
    const offset = frame.reducedMotion ? 0.5 : (frame.now / 650) % 1;
    const drawn = new Set<string>();
    ctx.save();
    ctx.strokeStyle = PALETTE.path;
    ctx.lineWidth = Math.max(1.5, size * 0.05);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const spawn of frame.simulation.grid.spawns) {
      const path = frame.simulation.flow.pathFrom(spawn);
      for (let i = 0; i + 1 < path.length; i++) {
        const from = path[i];
        const to = path[i + 1];
        if (!from || !to) continue;
        const key = `${from.x},${from.y}>${to.x},${to.y}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        const a = cellCenter(from);
        const b = cellCenter(to);
        const p = this.point(lerp(a.x, b.x, offset), lerp(a.y, b.y, offset));
        const q = this.point(b.x, b.y);
        const r = this.point(a.x, a.y);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(q.y - r.y, q.x - r.x));
        ctx.beginPath();
        ctx.moveTo(-size * 0.08, -size * 0.12);
        ctx.lineTo(size * 0.06, 0);
        ctx.lineTo(-size * 0.08, size * 0.12);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  private drawHover(frame: RenderFrame): void {
    const { hover, selection, simulation } = frame;
    if (!hover) return;
    const { ctx } = this;
    const size = this.layout.cellSize;
    const origin = this.cellOrigin(hover.x, hover.y);

    if (selection.kind === "build") {
      const def = simulation.content.tower(selection.tower);
      const placeable =
        simulation.checkPlacement(hover.x, hover.y).ok &&
        simulation.world.gold >= def.levels[0].cost;
      ctx.fillStyle = placeable ? PALETTE.valid : PALETTE.invalid;
      ctx.fillRect(origin.x, origin.y, size, size);
      const c = this.point(hover.x + 0.5, hover.y + 0.5);
      ctx.save();
      ctx.globalAlpha = placeable ? 0.6 : 0.3;
      this.drawTowerSprites(def.id, 0, c.x, c.y, screenAngle(this.layout, 0), 0);
      ctx.restore();
      this.strokeRange(
        cellCenter(hover),
        def.levels[0].range,
        placeable ? towerColor(def.id) : PALETTE.hpLow,
      );
      return;
    }
    ctx.strokeStyle = PALETTE.range;
    ctx.lineWidth = 1;
    ctx.strokeRect(origin.x + 0.5, origin.y + 0.5, size - 1, size - 1);
  }

  private drawTowerSprites(
    id: string,
    level: number,
    x: number,
    y: number,
    angle: number,
    kick: number,
  ): void {
    const art = towerArt(id);
    this.sprites.draw(
      this.ctx,
      `tower-base:${id}:${level}`,
      1,
      (ctx, size) => {
        art.base(ctx, size, level);
      },
      x,
      y,
    );
    this.sprites.draw(
      this.ctx,
      `tower-turret:${id}:${level}`,
      1.3 * TURRET_SCALE,
      (ctx, size) => {
        ctx.scale(TURRET_SCALE, TURRET_SCALE);
        art.turret(ctx, size, level);
      },
      x - Math.cos(angle) * kick,
      y - Math.sin(angle) * kick,
      angle,
    );
  }

  private drawTower(tower: Readonly<TowerState>, frame: RenderFrame): void {
    const center = towerCenter(tower);
    const c = this.point(center.x, center.y);
    const art = towerArt(tower.def.id);
    const spin = art.motion === "spin";
    const angle = spin
      ? frame.reducedMotion
        ? 0
        : frame.now / 2600
      : screenAngle(this.layout, frame.aim.angle(tower.id, frame.now));
    const kick = spin ? 0 : frame.aim.recoil(tower.id, frame.now) * this.layout.cellSize * 0.08;
    this.drawTowerSprites(tower.def.id, tower.level, c.x, c.y, angle, kick);
  }

  private drawEnemy(enemy: Readonly<EnemyState>, frame: RenderFrame): void {
    const { ctx } = this;
    const size = this.layout.cellSize;
    const { id } = enemy.def;
    const p = this.point(
      lerp(enemy.prevX, enemy.x, frame.alpha),
      lerp(enemy.prevY, enemy.y, frame.alpha),
    );
    const r = enemy.def.radius * size;
    const color = enemyColor(id);
    const heading = screenAngle(this.layout, enemyHeading(enemy));
    const art = enemyArt(id);

    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + r * 0.35, r * 1.05, r * 0.6, 0, 0, TAU);
    ctx.fill();

    if (isBoss(id)) {
      const pulse = frame.reducedMotion ? 0 : Math.sin(frame.now / 260);
      circle(ctx, p.x, p.y, r * (1.4 + pulse * 0.08));
      ctx.strokeStyle = withAlpha(color, 0.45);
      ctx.lineWidth = Math.max(1.5, size * 0.05);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(heading);
    const stride = frame.reducedMotion ? 0 : (frame.now / 1000) * enemy.def.speed * 8 + enemy.id;
    paintFeet(ctx, id, r, stride);
    ctx.restore();

    const key = `enemy:${id}`;
    const extent = enemy.def.radius * art.extent;
    const paint = (g: CanvasRenderingContext2D, cell: number): void => {
      art.body(g, enemy.def.radius * cell, color);
    };
    this.sprites.draw(ctx, key, extent, paint, p.x, p.y, heading);

    const flash = frame.effects.hitFlash(enemy.id, frame.now);
    if (flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = flash * 0.75;
      this.sprites.draw(ctx, key, extent, paint, p.x, p.y, heading);
      ctx.restore();
    }

    if (enemy.slowTimer > 0) {
      circle(ctx, p.x, p.y, r * 1.1);
      ctx.fillStyle = withAlpha(PALETTE.slowed, 0.18);
      ctx.fill();
      ctx.strokeStyle = withAlpha(PALETTE.slowed, 0.85);
      ctx.lineWidth = Math.max(1.5, size * 0.04);
      ctx.stroke();
      ctx.fillStyle = "#ecfeff";
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * TAU + enemy.id;
        const cx = p.x + Math.cos(angle) * r * 1.1;
        const cy = p.y + Math.sin(angle) * r * 1.1;
        const k = Math.max(2, size * 0.05);
        ctx.beginPath();
        ctx.moveTo(cx, cy - k);
        ctx.lineTo(cx + k * 0.6, cy);
        ctx.lineTo(cx, cy + k);
        ctx.lineTo(cx - k * 0.6, cy);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (enemy.hp < enemy.maxHp) {
      const width = Math.max(size * 0.7, r * 2);
      const height = Math.max(3, size * 0.08);
      const x = p.x - width / 2;
      const y = p.y - r * 1.35 - height * 2;
      const share = Math.max(0, enemy.hp / enemy.maxHp);
      ctx.fillStyle = PALETTE.hpBack;
      ctx.fillRect(x - 1, y - 1, width + 2, height + 2);
      ctx.fillStyle = share > 0.35 ? PALETTE.hp : PALETTE.hpLow;
      ctx.fillRect(x, y, width * share, height);
    }
  }

  private drawProjectiles(frame: RenderFrame): void {
    const size = this.layout.cellSize;
    const kinds = new Map(frame.simulation.world.towers.map((t) => [t.id, t.def.id]));
    for (const shot of frame.simulation.world.projectiles) {
      const p = this.point(
        lerp(shot.prevX, shot.x, frame.alpha),
        lerp(shot.prevY, shot.y, frame.alpha),
      );
      const kind = kinds.get(shot.towerId);
      if (shot.splashRadius > 0) {
        paintShell(this.ctx, p.x, p.y, size, towerColor(kind ?? "cannon"));
        continue;
      }
      const aim = this.point(shot.aimX, shot.aimY);
      const angle = Math.atan2(aim.y - p.y, aim.x - p.x);
      paintDart(this.ctx, p.x, p.y, angle, size, towerColor(kind ?? "bolt"));
    }
  }

  private drawSelection(frame: RenderFrame): void {
    const { selection, simulation } = frame;
    if (selection.kind !== "tower") return;
    const tower = simulation.world.towers.find((t) => t.id === selection.towerId);
    if (!tower) return;
    const size = this.layout.cellSize;
    const origin = this.cellOrigin(tower.x, tower.y);
    this.ctx.strokeStyle = PALETTE.selection;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.roundRect(origin.x + 1, origin.y + 1, size - 2, size - 2, size * 0.14);
    this.ctx.stroke();
    this.strokeRange(towerCenter(tower), currentLevel(tower).range, towerColor(tower.def.id));
  }

  private strokeRange(center: { x: number; y: number }, range: number, color: string): void {
    const { ctx } = this;
    const p = this.point(center.x, center.y);
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, range * this.layout.cellSize, 0, TAU);
    ctx.fillStyle = withAlpha(color, 0.06);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.restore();
  }
}
