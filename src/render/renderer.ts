import type { Selection } from "../app/session";
import type { Cell } from "../core/geometry";
import { cellCenter } from "../core/geometry";
import type { Grid } from "../core/grid";
import type { Simulation } from "../core/simulation";
import type { EnemyState, HeroState, TowerState } from "../core/state";
import { currentLevel, HERO_ID, towerCenter } from "../core/state";
import { circle, radial, TAU } from "./art/common";
import { enemyArt, FLAP_FRAMES, paintFeet } from "./art/enemies";
import {
  HERO_EXTENT,
  HERO_FRAMES,
  paintHero,
  paintHeroAura,
  paintHeroBolt,
  paintHeroOrbit,
  paintHeroShadow,
  paintHeroSigil,
} from "./art/hero";
import { paintDart, paintMortarShell, paintShell } from "./art/projectiles";
import type { TerrainTheme } from "./art/terrain";
import {
  paintCore,
  paintExitTile,
  paintGround,
  paintPortal,
  paintRock,
  paintSpawnTile,
  terrainTheme,
} from "./art/terrain";
import { towerArt, TURRET_SCALE } from "./art/towers";
import type { ScreenRect } from "./atmosphere";
import { paintAtmosphere, paintEdgeGlow, paintVignette } from "./atmosphere";
import type { Region } from "./clusters";
import { clusterRegions } from "./clusters";
import { withAlpha } from "./color";
import type { Effects } from "./effects";
import { buildPop, DEATH_MS } from "./effects";
import type { BoardLayout } from "./layout";
import { computeLayout, pointToCell, screenAngle, toScreen, worldDirection } from "./layout";
import type { TurretAim } from "./motion";
import { enemyHeading } from "./motion";
import { enemyColor, HERO_COLOR, HERO_GOLD, isBoss, PALETTE, towerColor } from "./palette";
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
  /** The chapter's visual theme id ("meadow", "frost", "ash", "rift"). Defaults to "meadow". */
  readonly theme?: string;
  /** Tutorial cells to call out; the first also gets a bouncing pointer. */
  readonly guide?: readonly Cell[] | undefined;
  /**
   * Forces the low-lives warning on or off. By default it shows while lives
   * are at or below a quarter of the level's starting lives.
   */
  readonly lowLives?: boolean | undefined;
}

/** A rectangle in viewport (client) coordinates, as for positioning DOM overlays. */
export interface ClientRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Milliseconds for one wingbeat or flame flicker of a flying enemy. */
const FLAP_MS = 560;
/** Milliseconds for one up-and-down bob of a flying enemy. */
const BOB_MS = 1500;
const GUIDE_COLOR = "#fde047";
const DANGER_COLOR = "#ef4444";
const HURT_COLOR = "#f43f5e";
/** Afterimages drawn behind a dashing hero. */
const DASH_GHOSTS = 3;
/** The hero's drawn size relative to its collision radius. */
const HERO_SCALE = 1.2;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

interface Landmarks {
  readonly grid: Grid;
  readonly spawns: Region[];
  readonly exits: Region[];
  readonly rocks: Cell[];
}

/** Draws a read-only view of the world. Holds no game state of its own. */
export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sprites: SpriteCache;
  private layout: BoardLayout = computeLayout(1, 1, 1, 1);
  private cssWidth = 1;
  private cssHeight = 1;
  private pixelRatio = 1;
  /** Terrain never changes during a game, so it is painted once per size, map and theme. */
  private terrain:
    | { readonly grid: Grid; readonly theme: TerrainTheme; readonly image: CanvasImageSource }
    | undefined;
  /** One rift per group of spawn cells, one crystal per group of exit cells, and the rocks. */
  private landmarks: Landmarks | undefined;

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

  /** A direction on screen as a direction on the board; the stick and arrow keys use it. */
  worldDirection(dx: number, dy: number): { readonly x: number; readonly y: number } {
    return worldDirection(this.layout, dx, dy);
  }

  cellAt(clientX: number, clientY: number): Cell | undefined {
    const rect = this.canvas.getBoundingClientRect();
    return pointToCell(this.layout, clientX - rect.left, clientY - rect.top);
  }

  /** A board cell's rectangle in viewport coordinates, correct when the board is rotated. */
  cellClientRect(x: number, y: number): ClientRect {
    const origin = this.cellOrigin(x, y);
    const size = this.layout.cellSize;
    return this.toClient({ x: origin.x, y: origin.y, width: size, height: size });
  }

  /**
   * Viewport rectangles around each rift (spawn group) and crystal gate (exit
   * group). Empty until the first frame has been drawn.
   */
  landmarkClientRects(): {
    readonly spawns: readonly ClientRect[];
    readonly exits: readonly ClientRect[];
  } {
    const marks = this.landmarks;
    if (!marks) return { spawns: [], exits: [] };
    const box = (region: Region): ClientRect => {
      const a = this.point(region.x - region.halfWidth, region.y - region.halfHeight);
      const b = this.point(region.x + region.halfWidth, region.y + region.halfHeight);
      return this.toClient({
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
      });
    };
    return { spawns: marks.spawns.map(box), exits: marks.exits.map(box) };
  }

  draw(frame: RenderFrame): void {
    // A collapsed stage (hidden tab, first layout pass) has nothing to draw into.
    if (this.canvas.width === 0 || this.canvas.height === 0) return;
    const { ctx } = this;
    const theme = terrainTheme(frame.theme);
    const size = this.layout.cellSize;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    const { grid } = frame.simulation;
    const marks = this.landmarksFor(grid);
    const board = this.boardRect(grid);
    const shake = frame.effects.shake(frame.now);
    ctx.translate(shake.x * size, shake.y * size);

    this.drawTerrain(grid, theme);
    this.drawLandmarks(frame, marks);
    this.drawPath(frame);
    this.drawHover(frame);
    for (const tower of frame.simulation.world.towers) this.drawTower(tower, frame);
    this.drawDying(frame);
    for (const enemy of frame.simulation.world.enemies) this.drawEnemy(enemy, frame);
    this.drawHero(frame);
    this.drawProjectiles(frame);
    if (!frame.reducedMotion) {
      paintAtmosphere(ctx, theme.id, board, size, frame.now, marks.rocks, (x, y) =>
        this.point(x + 0.5, y + 0.5),
      );
    }
    this.drawFreeze(frame, board);
    this.drawNovaFlash(frame, board);
    this.drawBossShadow(frame, board);
    this.drawDanger(frame, board);
    this.drawHeroHurt(frame, board);
    frame.effects.draw(ctx, (x, y) => this.point(x, y), size, frame.now, grid);
    this.drawSelection(frame);
    this.drawGuide(frame);
  }

  private point(x: number, y: number): { x: number; y: number } {
    return toScreen(this.layout, x, y);
  }

  /** Canvas CSS pixels to viewport coordinates, allowing for CSS scaling of the canvas. */
  private toClient(rect: ScreenRect): ClientRect {
    const bounds = this.canvas.getBoundingClientRect();
    const kx = this.cssWidth > 0 ? bounds.width / this.cssWidth : 1;
    const ky = this.cssHeight > 0 ? bounds.height / this.cssHeight : 1;
    return {
      left: bounds.left + rect.x * kx,
      top: bounds.top + rect.y * ky,
      width: rect.width * kx,
      height: rect.height * ky,
    };
  }

  /** Top-left corner, in CSS pixels, of a cell. Correct whether or not the board is rotated. */
  private cellOrigin(x: number, y: number): { x: number; y: number } {
    const center = this.point(x + 0.5, y + 0.5);
    const half = this.layout.cellSize / 2;
    return { x: center.x - half, y: center.y - half };
  }

  /** Screen rectangle covering the whole board. */
  private boardRect(grid: Grid): ScreenRect {
    const a = this.point(0, 0);
    const b = this.point(grid.width, grid.height);
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    };
  }

  private landmarksFor(grid: Grid): Landmarks {
    if (this.landmarks?.grid !== grid) {
      const rocks: Cell[] = [];
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          if (grid.terrainAt(x, y) === "rock") rocks.push({ x, y });
        }
      }
      this.landmarks = {
        grid,
        spawns: clusterRegions(grid.spawns),
        exits: clusterRegions(grid.exits),
        rocks,
      };
    }
    return this.landmarks;
  }

  private drawTerrain(grid: Grid, theme: TerrainTheme): void {
    if (this.terrain?.grid !== grid || this.terrain.theme !== theme) {
      const { image, context } = this.createSurface(this.canvas.width, this.canvas.height);
      context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      const size = this.layout.cellSize;
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          const { x: left, y: top } = this.cellOrigin(x, y);
          switch (grid.terrainAt(x, y)) {
            case "rock":
              paintRock(context, theme, x, y, left, top, size);
              break;
            case "spawn":
              paintSpawnTile(context, theme, left, top, size);
              break;
            case "exit":
              paintExitTile(context, theme, left, top, size);
              break;
            case "open":
              paintGround(context, theme, x, y, left, top, size);
              break;
          }
        }
      }
      const board = this.boardRect(grid);
      paintVignette(context, board);
      context.strokeStyle = "rgba(255, 255, 255, 0.08)";
      context.lineWidth = 1;
      context.strokeRect(board.x + 0.5, board.y + 0.5, board.width - 1, board.height - 1);
      this.terrain = { grid, theme, image };
    }
    this.ctx.drawImage(this.terrain.image, 0, 0, this.cssWidth, this.cssHeight);
  }

  /** The rifts enemies come from and the crystals they are trying to reach. */
  private drawLandmarks(frame: RenderFrame, marks: Landmarks): void {
    const { ctx } = this;
    const size = this.layout.cellSize;
    const now = frame.reducedMotion ? 0 : frame.now;
    const screenRadii = (region: Region): { rx: number; ry: number } =>
      this.layout.rotated
        ? { rx: region.halfHeight * size, ry: region.halfWidth * size }
        : { rx: region.halfWidth * size, ry: region.halfHeight * size };

    // A boss arriving makes every rift flare and swell.
    const arrival = frame.effects.bossArrival(frame.now);
    const surge = Math.max(frame.simulation.world.phase === "wave" ? 1 : 0, arrival);
    for (const spawn of marks.spawns) {
      const c = this.point(spawn.x, spawn.y);
      const { rx, ry } = screenRadii(spawn);
      if (arrival > 0) {
        const flare = Math.max(rx, ry) * (1.6 + arrival);
        circle(ctx, c.x, c.y, flare);
        ctx.fillStyle = radial(ctx, c.x, c.y, flare, [
          [0, withAlpha(PALETTE.portal, 0.6 * arrival)],
          [1, withAlpha(PALETTE.portal, 0)],
        ]);
        ctx.fill();
      }
      const swell = 1 + arrival * 0.35;
      paintPortal(ctx, c.x, c.y, rx * 0.85 * swell, ry * 0.9 * swell, now, surge);
    }
    const hurt = frame.effects.coreHurt(frame.now);
    for (const exit of marks.exits) {
      const c = this.point(exit.x, exit.y);
      const { rx, ry } = screenRadii(exit);
      paintCore(ctx, c.x, c.y, Math.min(rx, ry) * 1.6, now, hurt);
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

    if (selection.kind === "power") {
      if (!simulation.content.hasPower(selection.power)) return;
      const { spec } = simulation.content.power(selection.power);
      if (spec.kind === "strike") this.drawStrikeReticle(frame, cellCenter(hover), spec.radius);
      return;
    }

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

  /** Where a targeted strike power will land: its blast circle, a crosshair and marked enemies. */
  private drawStrikeReticle(
    frame: RenderFrame,
    center: { x: number; y: number },
    radius: number,
  ): void {
    const { ctx } = this;
    const size = this.layout.cellSize;
    const color = "#f97316";
    const p = this.point(center.x, center.y);
    const reach = radius * size;
    const pulse = frame.reducedMotion ? 0 : (frame.now / 900) % 1;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, reach, 0, TAU);
    ctx.fillStyle = withAlpha("#ef4444", 0.16);
    ctx.fill();
    ctx.setLineDash([size * 0.22, size * 0.14]);
    ctx.lineDashOffset = -pulse * size * 0.72;
    ctx.strokeStyle = withAlpha("#fdba74", 0.95);
    ctx.lineWidth = Math.max(1.5, size * 0.06);
    ctx.stroke();
    ctx.setLineDash([]);

    const arm = Math.min(reach * 0.35, size * 0.45);
    ctx.beginPath();
    ctx.moveTo(p.x - arm, p.y);
    ctx.lineTo(p.x - arm * 0.35, p.y);
    ctx.moveTo(p.x + arm * 0.35, p.y);
    ctx.lineTo(p.x + arm, p.y);
    ctx.moveTo(p.x, p.y - arm);
    ctx.lineTo(p.x, p.y - arm * 0.35);
    ctx.moveTo(p.x, p.y + arm * 0.35);
    ctx.lineTo(p.x, p.y + arm);
    ctx.strokeStyle = "#fff7ed";
    ctx.lineWidth = Math.max(1.5, size * 0.05);
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.strokeStyle = withAlpha(color, 0.9);
    ctx.lineWidth = Math.max(1, size * 0.04);
    for (const enemy of frame.simulation.world.enemies) {
      const x = lerp(enemy.prevX, enemy.x, frame.alpha);
      const y = lerp(enemy.prevY, enemy.y, frame.alpha);
      if (Math.hypot(x - center.x, y - center.y) > radius) continue;
      const q = this.point(x, y);
      circle(ctx, q.x, q.y, enemy.def.radius * size * 1.35);
      ctx.stroke();
    }
    ctx.restore();
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
    const { ctx } = this;
    const size = this.layout.cellSize;
    const center = towerCenter(tower);
    const c = this.point(center.x, center.y);
    const art = towerArt(tower.def.id);
    const spin = art.motion === "spin";
    const angle = spin
      ? frame.reducedMotion
        ? 0
        : frame.now / 2600
      : screenAngle(this.layout, frame.aim.angle(tower.id, frame.now));
    const kick = spin ? 0 : frame.aim.recoil(tower.id, frame.now) * size * 0.08;

    const build = frame.effects.buildProgress(tower.id, frame.now);
    if (build < 1) {
      // Dropping in: a shadow waits on the cell while the tower falls onto it.
      const pose = buildPop(build);
      ctx.save();
      ctx.fillStyle = PALETTE.shadow;
      ctx.globalAlpha = 1 - pose.lift;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + size * 0.1, size * 0.42, size * 0.3, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = pose.alpha;
      ctx.translate(c.x, c.y - pose.lift * size);
      ctx.scale(pose.scale, pose.scale);
      this.drawTowerSprites(tower.def.id, tower.level, 0, 0, angle, kick);
      ctx.restore();
    } else {
      this.drawTowerSprites(tower.def.id, tower.level, c.x, c.y, angle, kick);
    }

    const flash = frame.effects.upgradeFlash(tower.id, frame.now);
    if (flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = flash * 0.8;
      this.drawTowerSprites(tower.def.id, tower.level, c.x, c.y, angle, kick);
      ctx.restore();
    }
  }

  /** Killed enemies swell, flare white and fade out rather than vanishing. */
  private drawDying(frame: RenderFrame): void {
    const { ctx } = this;
    for (const dead of frame.effects.dying(frame.now)) {
      const t = (frame.now - dead.start) / DEATH_MS;
      if (t < 0 || t >= 1) continue;
      const art = enemyArt(dead.enemy);
      const color = enemyColor(dead.enemy);
      const extent = dead.radius * art.extent;
      const paint = (g: CanvasRenderingContext2D, cell: number): void => {
        art.body(g, dead.radius * cell, color);
      };
      const p = this.point(dead.x, dead.y);
      const heading = screenAngle(this.layout, dead.heading);
      const grow = 1 + 0.45 * t;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(grow, grow);
      ctx.globalAlpha = (1 - t) * (1 - t);
      this.sprites.draw(ctx, `enemy:${dead.enemy}`, extent, paint, 0, 0, heading);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = (1 - t) * 0.7;
      this.sprites.draw(ctx, `enemy:${dead.enemy}`, extent, paint, 0, 0, heading);
      ctx.restore();
    }
  }

  private drawEnemy(enemy: Readonly<EnemyState>, frame: RenderFrame): void {
    const { ctx } = this;
    const size = this.layout.cellSize;
    const { id } = enemy.def;
    const ground = this.point(
      lerp(enemy.prevX, enemy.x, frame.alpha),
      lerp(enemy.prevY, enemy.y, frame.alpha),
    );
    const r = enemy.def.radius * size;
    const color = enemyColor(id);
    const heading = screenAngle(this.layout, enemyHeading(enemy));
    const art = enemyArt(id);
    const flying = enemy.def.flying === true;

    // Flyers stay on their true position but hover: their shadow falls away
    // below them, smaller and softer, and the body bobs gently.
    const bob =
      flying && !frame.reducedMotion
        ? Math.sin((frame.now / BOB_MS) * TAU + enemy.id) * r * 0.14
        : 0;
    const p = { x: ground.x, y: ground.y + bob };
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath();
    if (flying) {
      ctx.globalAlpha = 0.7;
      ctx.ellipse(ground.x + r * 0.2, ground.y + r * 1.05, r * 0.7, r * 0.36, 0, 0, TAU);
    } else {
      ctx.ellipse(ground.x, ground.y + r * 0.35, r * 1.05, r * 0.6, 0, 0, TAU);
    }
    ctx.fill();
    ctx.globalAlpha = 1;

    if (isBoss(id)) {
      const pulse = frame.reducedMotion ? 0 : Math.sin(frame.now / 260);
      circle(ctx, p.x, p.y, r * (1.4 + pulse * 0.08));
      ctx.strokeStyle = withAlpha(color, 0.45);
      ctx.lineWidth = Math.max(1.5, size * 0.05);
      ctx.stroke();
    }

    if (!flying) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(heading);
      const stride = frame.reducedMotion ? 0 : (frame.now / 1000) * enemy.def.speed * 8 + enemy.id;
      paintFeet(ctx, id, r, stride);
      ctx.restore();
    }

    const extent = enemy.def.radius * art.extent;
    const { flap } = art;
    if (flap) {
      const cycle = frame.reducedMotion ? 0.25 : (frame.now / FLAP_MS + enemy.id * 0.37) % 1;
      const index = Math.floor(cycle * FLAP_FRAMES) % FLAP_FRAMES;
      this.sprites.draw(
        ctx,
        `enemy-flap:${id}:${index}`,
        extent,
        (g, cell) => {
          flap(g, enemy.def.radius * cell, color, index / FLAP_FRAMES);
        },
        p.x,
        p.y,
        heading,
      );
    }

    const key = `enemy:${id}`;
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
      if (shot.towerId === HERO_ID) {
        const aim = this.point(shot.aimX, shot.aimY);
        paintHeroBolt(this.ctx, p.x, p.y, Math.atan2(aim.y - p.y, aim.x - p.x), size);
        continue;
      }
      const kind = kinds.get(shot.towerId);
      if (shot.splashRadius > 0) {
        if (kind === "mortar") paintMortarShell(this.ctx, p.x, p.y, size, towerColor(kind));
        else paintShell(this.ctx, p.x, p.y, size, towerColor(kind ?? "cannon"));
        continue;
      }
      const aim = this.point(shot.aimX, shot.aimY);
      const angle = Math.atan2(aim.y - p.y, aim.x - p.x);
      paintDart(this.ctx, p.x, p.y, angle, size, towerColor(kind ?? "bolt"));
    }
  }

  private drawHero(frame: RenderFrame): void {
    const hero = frame.simulation.world.hero;
    if (!hero) return;
    const { ctx } = this;
    const size = this.layout.cellSize;
    // Drawn a little larger than its collision circle so it reads at phone size.
    const r = hero.def.radius * size * HERO_SCALE;
    const still = frame.reducedMotion;
    const p = this.point(
      lerp(hero.prevX, hero.x, frame.alpha),
      lerp(hero.prevY, hero.y, frame.alpha),
    );
    const heading = screenAngle(this.layout, hero.facing);
    const extent = hero.def.radius * HERO_EXTENT;
    const moving = hero.moveX !== 0 || hero.moveY !== 0 || hero.dashTimer > 0;
    // The cloak ripples quickly on the move and slowly at rest; each pose is its own sprite.
    const pose = still ? 0 : Math.floor(frame.now / (moving ? 90 : 320)) % HERO_FRAMES;
    const key = `hero:${hero.def.id}:${pose}`;
    const paint = (g: CanvasRenderingContext2D, cell: number): void => {
      paintHero(g, hero.def.radius * cell, pose);
    };
    const pulse = still ? 0.5 : 0.5 + 0.5 * Math.sin(frame.now / 240);

    if (hero.status === "down") {
      paintHeroShadow(ctx, p.x, p.y, r * 0.8);
      const wake = 1 - hero.respawnTimer / hero.def.respawn;
      // The light gathers again as the return draws near.
      paintHeroAura(ctx, p.x, p.y, r * 0.8, 0, wake * wake);
      ctx.save();
      ctx.globalAlpha = 0.35 + wake * 0.2;
      this.sprites.draw(ctx, key, extent, paint, p.x, p.y, heading + Math.PI / 2);
      ctx.restore();
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.6, -Math.PI / 2, -Math.PI / 2 + TAU * wake);
      ctx.strokeStyle = withAlpha(HERO_COLOR, 0.25);
      ctx.lineWidth = Math.max(5, size * 0.18);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(HERO_COLOR, 0.95);
      ctx.lineWidth = Math.max(2, size * 0.07);
      ctx.stroke();
      return;
    }

    if (!still) {
      for (const trail of frame.effects.dashTrails(frame.now)) {
        for (let i = 1; i <= DASH_GHOSTS; i++) {
          const f = Math.max(0, trail.t - i * 0.14);
          const reach = hero.def.dash.distance * f;
          const g = this.point(trail.x + trail.dx * reach, trail.y + trail.dy * reach);
          ctx.save();
          ctx.globalAlpha = (1 - trail.t) * 0.35 * (1 - (i - 1) / DASH_GHOSTS);
          this.sprites.draw(ctx, key, extent, paint, g.x, g.y, heading);
          ctx.restore();
        }
      }
    }

    paintHeroShadow(ctx, p.x, p.y, r);
    const spin = still ? 0 : (frame.now / 2600) * TAU;
    paintHeroSigil(ctx, p.x, p.y, r, spin, hero.charge, pulse);
    paintHeroAura(ctx, p.x, p.y, r, hero.charge, pulse);
    this.drawHeroAim(hero, p, frame);

    // The body bobs on the spot and kicks back along its facing for a beat after each shot.
    const bob = still ? 0 : Math.sin(frame.now / 380) * size * 0.025;
    const recoil = frame.effects.heroRecoil(frame.now);
    const kick = r * 0.22 * recoil;
    const x = p.x - Math.cos(heading) * kick;
    const y = p.y + bob - Math.sin(heading) * kick;
    const orbit = still ? 0 : (frame.now / (hero.charge >= 1 ? 900 : 2400)) * TAU;
    paintHeroOrbit(ctx, x, y, r, orbit, hero.charge, "back");
    this.sprites.draw(ctx, key, extent, paint, x, y, heading);

    const hurt = frame.effects.heroHurt(frame.now);
    if (hurt > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      circle(ctx, x, y, r * 1.7);
      ctx.fillStyle = radial(ctx, x, y, r * 1.7, [
        [0, withAlpha(HURT_COLOR, 0.5 * hurt)],
        [1, withAlpha(HURT_COLOR, 0)],
      ]);
      ctx.fill();
      ctx.globalAlpha = hurt * 0.5;
      this.sprites.draw(ctx, key, extent, paint, x, y, heading);
      ctx.restore();
    }

    if (recoil > 0) {
      // A flash at the spear's crystal tip: the tip sits ahead and to the right of the body.
      const ahead = r * 2.1;
      const aside = r * 0.68;
      const tx = x + Math.cos(heading) * ahead - Math.sin(heading) * aside;
      const ty = y + Math.sin(heading) * ahead + Math.cos(heading) * aside;
      const reach = r * (0.5 + 0.7 * recoil);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      circle(ctx, tx, ty, reach);
      ctx.fillStyle = radial(ctx, tx, ty, reach, [
        [0, withAlpha("#ffffff", 0.9 * recoil)],
        [0.4, withAlpha(HERO_COLOR, 0.6 * recoil)],
        [1, withAlpha(HERO_COLOR, 0)],
      ]);
      ctx.fill();
      ctx.restore();
    }

    paintHeroOrbit(ctx, x, y, r, orbit, hero.charge, "front");

    // Nova charge as a golden arc around the hero; it closes and blazes when the nova is ready.
    if (hero.charge > 0) {
      const ready = hero.charge >= 1;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, hero.charge));
      ctx.strokeStyle = withAlpha(HERO_GOLD, ready ? 0.25 + 0.25 * pulse : 0.2);
      ctx.lineWidth = Math.max(4, size * 0.14);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(HERO_GOLD, ready ? 0.7 + 0.3 * pulse : 0.85);
      ctx.lineWidth = Math.max(1.5, size * 0.05);
      ctx.stroke();
      if (ready) {
        // Four sparks ride the ring so a charged nova is unmistakable.
        ctx.fillStyle = "#ffffff";
        for (let i = 0; i < 4; i++) {
          const a = spin * 1.5 + (i / 4) * TAU;
          circle(ctx, p.x + Math.cos(a) * r * 1.5, p.y + Math.sin(a) * r * 1.5, r * 0.12);
          ctx.fill();
        }
      }
    }

    if (hero.hp < hero.def.hp) {
      const width = Math.max(size * 0.8, r * 2.4);
      const height = Math.max(3, size * 0.08);
      const bx = p.x - width / 2;
      const by = p.y - r * 1.9 - height * 2;
      const share = Math.max(0, hero.hp / hero.def.hp);
      ctx.fillStyle = PALETTE.hpBack;
      ctx.fillRect(bx - 1, by - 1, width + 2, height + 2);
      ctx.fillStyle = share > 0.35 ? HERO_COLOR : PALETTE.hpLow;
      ctx.fillRect(bx, by, width * share, height);
    }
  }

  /** A faint line to the enemy the hero is shooting at, ending in a turning reticle. */
  private drawHeroAim(
    hero: Readonly<HeroState>,
    p: { x: number; y: number },
    frame: RenderFrame,
  ): void {
    if (hero.targetId === undefined) return;
    const target = frame.simulation.world.enemies.find((e) => e.id === hero.targetId);
    if (!target) return;
    const q = this.point(
      lerp(target.prevX, target.x, frame.alpha),
      lerp(target.prevY, target.y, frame.alpha),
    );
    const { ctx } = this;
    const size = this.layout.cellSize;
    ctx.save();
    ctx.strokeStyle = withAlpha(HERO_COLOR, 0.22);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const reach = target.def.radius * size * 1.35 + size * 0.08;
    const turn = frame.reducedMotion ? 0 : frame.now / 700;
    ctx.strokeStyle = withAlpha(HERO_COLOR, 0.7);
    ctx.lineWidth = Math.max(1.5, size * 0.04);
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const a = turn + (i / 4) * TAU;
      ctx.beginPath();
      ctx.arc(q.x, q.y, reach, a, a + Math.PI / 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A wash of light over the board the instant a nova goes off. */
  private drawNovaFlash(frame: RenderFrame, board: ScreenRect): void {
    const amount = frame.effects.novaFlash(frame.now);
    if (amount <= 0) return;
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = withAlpha("#ccfbf1", 0.3 * amount);
    ctx.fillRect(board.x, board.y, board.width, board.height);
    paintEdgeGlow(ctx, board, HERO_GOLD, 0.4 * amount, this.layout.cellSize * 1.2);
    ctx.restore();
  }

  /** A red pulse at the board's edges while the hero is being hurt. */
  private drawHeroHurt(frame: RenderFrame, board: ScreenRect): void {
    const hurt = frame.effects.heroHurt(frame.now);
    if (hurt <= 0) return;
    this.ctx.save();
    paintEdgeGlow(this.ctx, board, HURT_COLOR, 0.28 * hurt, this.layout.cellSize * 1.1);
    this.ctx.restore();
  }

  /** An icy wash over the whole board just after Frostbind is cast. */
  private drawFreeze(frame: RenderFrame, board: ScreenRect): void {
    const amount = frame.effects.freezeOverlay(frame.now);
    if (amount <= 0) return;
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = withAlpha("#bae6fd", 0.24 * amount);
    ctx.fillRect(board.x, board.y, board.width, board.height);
    ctx.strokeStyle = withAlpha("#e0f2fe", 0.75 * amount);
    ctx.lineWidth = Math.max(2, this.layout.cellSize * 0.14);
    ctx.strokeRect(board.x, board.y, board.width, board.height);
    ctx.restore();
  }

  /** The board dims for a heartbeat as a boss steps out of the rift. */
  private drawBossShadow(frame: RenderFrame, board: ScreenRect): void {
    const arrival = frame.effects.bossArrival(frame.now);
    if (arrival <= 0) return;
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = `rgba(10, 2, 14, ${0.5 * arrival * arrival * arrival})`;
    ctx.fillRect(board.x, board.y, board.width, board.height);
    paintEdgeGlow(ctx, board, PALETTE.portal, 0.35 * arrival, this.layout.cellSize * 1.2);
    ctx.restore();
  }

  /** A red pulse at the board's edges while the crystal is close to falling. */
  private drawDanger(frame: RenderFrame, board: ScreenRect): void {
    const { world, content } = frame.simulation;
    const low =
      frame.lowLives ??
      (world.phase !== "won" &&
        world.phase !== "lost" &&
        world.lives > 0 &&
        world.lives <= content.rules.startingLives * 0.25);
    if (!low) return;
    const pulse = frame.reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(frame.now / 320);
    this.ctx.save();
    paintEdgeGlow(this.ctx, board, DANGER_COLOR, 0.2 + 0.25 * pulse, this.layout.cellSize * 1.4);
    this.ctx.restore();
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

  /** Tutorial call-out: glowing, pulsing cells and a bouncing pointer on the first one. */
  private drawGuide(frame: RenderFrame): void {
    const cells = frame.guide;
    const first = cells?.[0];
    if (!cells || !first) return;
    const { ctx } = this;
    const size = this.layout.cellSize;
    const pulse = frame.reducedMotion ? 0.7 : 0.5 + 0.5 * Math.sin(frame.now / 260);
    ctx.save();
    ctx.lineJoin = "round";
    for (const cell of cells) {
      const o = this.cellOrigin(cell.x, cell.y);
      const grow = size * 0.04 * pulse;
      ctx.beginPath();
      ctx.roundRect(
        o.x + 1 - grow,
        o.y + 1 - grow,
        size - 2 + grow * 2,
        size - 2 + grow * 2,
        size * 0.18,
      );
      ctx.fillStyle = withAlpha(GUIDE_COLOR, 0.14 + 0.14 * pulse);
      ctx.fill();
      ctx.strokeStyle = withAlpha(GUIDE_COLOR, 0.18 + 0.3 * pulse);
      ctx.lineWidth = Math.max(4, size * 0.24);
      ctx.stroke();
      ctx.strokeStyle = "#fef9c3";
      ctx.lineWidth = Math.max(2, size * 0.07);
      ctx.stroke();
    }

    // The pointer sits above the cell, or below it when the cell is at the top edge.
    const c = this.point(first.x + 0.5, first.y + 0.5);
    const bounce = frame.reducedMotion ? 0 : Math.abs(Math.sin(frame.now / 300)) * size * 0.28;
    const above = c.y - size * 1.35 >= 0;
    const dir = above ? 1 : -1;
    const tipY = c.y - dir * (size * 0.62 + bounce);
    const head = size * 0.3;
    const stem = size * 0.13;
    ctx.beginPath();
    ctx.moveTo(c.x, tipY);
    ctx.lineTo(c.x - head, tipY - dir * head);
    ctx.lineTo(c.x - stem, tipY - dir * head);
    ctx.lineTo(c.x - stem, tipY - dir * size * 0.62);
    ctx.lineTo(c.x + stem, tipY - dir * size * 0.62);
    ctx.lineTo(c.x + stem, tipY - dir * head);
    ctx.lineTo(c.x + head, tipY - dir * head);
    ctx.closePath();
    ctx.shadowColor = withAlpha(GUIDE_COLOR, 0.9);
    ctx.shadowBlur = size * 0.4;
    ctx.fillStyle = GUIDE_COLOR;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(5, 8, 11, 0.85)";
    ctx.lineWidth = Math.max(1.5, size * 0.05);
    ctx.stroke();
    ctx.restore();
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
