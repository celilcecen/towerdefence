import type { Cell } from "../core/geometry";
import { cellCenter } from "../core/geometry";
import type { Simulation } from "../core/simulation";
import type { EnemyState, TowerState } from "../core/state";
import { currentLevel, towerCenter } from "../core/state";
import type { Selection } from "../app/session";
import type { Effects } from "./effects";
import type { BoardLayout } from "./layout";
import { computeLayout, pointToCell, toScreen } from "./layout";
import { enemyColor, isBoss, PALETTE, towerColor } from "./palette";

export interface RenderFrame {
  readonly simulation: Simulation;
  readonly selection: Selection;
  readonly hover: Cell | undefined;
  /** Interpolation between the previous and current tick, in [0, 1). */
  readonly alpha: number;
  readonly now: number;
  readonly effects: Effects;
  readonly animatePath: boolean;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Draws a read-only view of the world. Holds no game state of its own. */
export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private layout: BoardLayout = computeLayout(1, 1, 1, 1);
  private cssWidth = 1;
  private cssHeight = 1;
  private pixelRatio = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not supported in this browser.");
    this.ctx = ctx;
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
  }

  cellAt(clientX: number, clientY: number): Cell | undefined {
    const rect = this.canvas.getBoundingClientRect();
    return pointToCell(this.layout, clientX - rect.left, clientY - rect.top);
  }

  draw(frame: RenderFrame): void {
    const { ctx } = this;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.fillStyle = PALETTE.background;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    this.drawBoard(frame.simulation);
    this.drawPath(frame);
    this.drawHover(frame);
    for (const tower of frame.simulation.world.towers) this.drawTower(tower, frame.selection);
    for (const enemy of frame.simulation.world.enemies) this.drawEnemy(enemy, frame.alpha);
    this.drawProjectiles(frame);
    frame.effects.draw(ctx, (x, y) => this.point(x, y), this.layout.cellSize, frame.now);
    this.drawRanges(frame);
  }

  private point(x: number, y: number): { x: number; y: number } {
    return toScreen(this.layout, x, y);
  }

  private drawBoard(simulation: Simulation): void {
    const { ctx } = this;
    const { grid } = simulation;
    const size = this.layout.cellSize;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        // Cells are positioned by their centre, which is correct whether or not the board is rotated.
        const center = this.point(x + 0.5, y + 0.5);
        const sx = center.x - size / 2;
        const sy = center.y - size / 2;
        const terrain = grid.terrainAt(x, y);
        ctx.fillStyle =
          terrain === "rock"
            ? PALETTE.rock
            : terrain === "spawn"
              ? PALETTE.spawn
              : terrain === "exit"
                ? PALETTE.exit
                : (x + y) % 2 === 0
                  ? PALETTE.open
                  : PALETTE.openAlt;
        ctx.fillRect(sx, sy, size, size);
        if (terrain === "rock") {
          ctx.fillStyle = PALETTE.rockEdge;
          ctx.fillRect(sx, sy, size, Math.max(1, size * 0.08));
        }
      }
    }
    const a = this.point(0, 0);
    const b = this.point(grid.width, grid.height);
    ctx.strokeStyle = PALETTE.gridLine;
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.min(a.x, b.x) + 0.5,
      Math.min(a.y, b.y) + 0.5,
      Math.abs(b.x - a.x) - 1,
      Math.abs(b.y - a.y) - 1,
    );
  }

  private drawPath(frame: RenderFrame): void {
    const { ctx } = this;
    const size = this.layout.cellSize;
    ctx.save();
    ctx.strokeStyle = PALETTE.path;
    ctx.lineWidth = Math.max(1.5, size * 0.06);
    ctx.lineCap = "round";
    ctx.setLineDash([size * 0.12, size * 0.22]);
    ctx.lineDashOffset = frame.animatePath ? -frame.now / 40 : 0;
    for (const spawn of frame.simulation.grid.spawns) {
      const path = frame.simulation.flow.pathFrom(spawn);
      ctx.beginPath();
      path.forEach((cell, i) => {
        const c = cellCenter(cell);
        const p = this.point(c.x, c.y);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHover(frame: RenderFrame): void {
    const { hover, selection, simulation } = frame;
    if (!hover) return;
    const { ctx } = this;
    const size = this.layout.cellSize;
    const center = this.point(hover.x + 0.5, hover.y + 0.5);
    const p = { x: center.x - size / 2, y: center.y - size / 2 };

    if (selection.kind === "build") {
      const def = simulation.content.tower(selection.tower);
      const placeable =
        simulation.checkPlacement(hover.x, hover.y).ok &&
        simulation.world.gold >= def.levels[0].cost;
      ctx.fillStyle = placeable ? PALETTE.valid : PALETTE.invalid;
      ctx.fillRect(p.x, p.y, size, size);
      this.strokeRange(
        cellCenter(hover),
        def.levels[0].range,
        placeable ? towerColor(def.id) : PALETTE.hpLow,
      );
      return;
    }
    ctx.strokeStyle = PALETTE.range;
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x + 0.5, p.y + 0.5, size - 1, size - 1);
  }

  private drawTower(tower: Readonly<TowerState>, selection: Selection): void {
    const { ctx } = this;
    const size = this.layout.cellSize;
    const center = towerCenter(tower);
    const c = this.point(center.x, center.y);
    const color = towerColor(tower.def.id);
    const half = size * 0.39;

    ctx.fillStyle = PALETTE.towerBase;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath();
    ctx.roundRect(c.x - half, c.y - half, half * 2, half * 2, size * 0.12);
    ctx.fill();
    ctx.stroke();

    const r = size * (0.16 + tower.level * 0.03);
    ctx.fillStyle = color;
    ctx.beginPath();
    switch (tower.def.id) {
      case "cannon":
        ctx.rect(c.x - r, c.y - r, r * 2, r * 2);
        break;
      case "spire":
        ctx.moveTo(c.x, c.y - r * 1.3);
        ctx.lineTo(c.x + r, c.y);
        ctx.lineTo(c.x, c.y + r * 1.3);
        ctx.lineTo(c.x - r, c.y);
        ctx.closePath();
        break;
      case "bolt":
        ctx.moveTo(c.x, c.y - r * 1.2);
        ctx.lineTo(c.x + r * 1.1, c.y + r * 0.9);
        ctx.lineTo(c.x - r * 1.1, c.y + r * 0.9);
        ctx.closePath();
        break;
      default:
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    }
    ctx.fill();

    for (let i = 0; i <= tower.level; i++) {
      ctx.beginPath();
      ctx.arc(
        c.x - half + size * 0.14 + i * size * 0.13,
        c.y + half - size * 0.1,
        size * 0.035,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    if (selection.kind === "tower" && selection.towerId === tower.id) {
      ctx.strokeStyle = PALETTE.selection;
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x - size / 2 + 1, c.y - size / 2 + 1, size - 2, size - 2);
    }
  }

  private drawEnemy(enemy: Readonly<EnemyState>, alpha: number): void {
    const { ctx } = this;
    const size = this.layout.cellSize;
    const p = this.point(lerp(enemy.prevX, enemy.x, alpha), lerp(enemy.prevY, enemy.y, alpha));
    const radius = enemy.def.radius * size;

    ctx.fillStyle = enemyColor(enemy.def.id);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (enemy.slowTimer > 0) {
      ctx.strokeStyle = PALETTE.slowed;
      ctx.lineWidth = Math.max(1.5, size * 0.06);
      ctx.stroke();
    }
    if (isBoss(enemy.def.id)) {
      ctx.strokeStyle = PALETTE.selection;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (enemy.hp < enemy.maxHp) {
      const width = size * 0.7;
      const height = Math.max(2, size * 0.07);
      const x = p.x - width / 2;
      const y = p.y - radius - height * 2.2;
      const share = enemy.hp / enemy.maxHp;
      ctx.fillStyle = PALETTE.hpBack;
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = share > 0.35 ? PALETTE.hp : PALETTE.hpLow;
      ctx.fillRect(x, y, width * share, height);
    }
  }

  private drawProjectiles(frame: RenderFrame): void {
    const { ctx } = this;
    const size = this.layout.cellSize;
    const colors = new Map(frame.simulation.world.towers.map((t) => [t.id, towerColor(t.def.id)]));
    for (const shot of frame.simulation.world.projectiles) {
      const p = this.point(
        lerp(shot.prevX, shot.x, frame.alpha),
        lerp(shot.prevY, shot.y, frame.alpha),
      );
      ctx.fillStyle = colors.get(shot.towerId) ?? PALETTE.fallback;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * (shot.splashRadius > 0 ? 0.11 : 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawRanges(frame: RenderFrame): void {
    const { selection, simulation } = frame;
    if (selection.kind !== "tower") return;
    const tower = simulation.world.towers.find((t) => t.id === selection.towerId);
    if (tower)
      this.strokeRange(towerCenter(tower), currentLevel(tower).range, towerColor(tower.def.id));
  }

  private strokeRange(center: { x: number; y: number }, range: number, color: string): void {
    const { ctx } = this;
    const p = this.point(center.x, center.y);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, range * this.layout.cellSize, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
