import type { EventBus } from "../core/events";
import type { GameEvents } from "../core/game-events";
import { towerCenter } from "../core/state";
import { PALETTE, towerColor } from "./palette";

type Effect =
  | {
      kind: "beam";
      x: number;
      y: number;
      x2: number;
      y2: number;
      color: string;
      start: number;
      duration: number;
    }
  | {
      kind: "ring";
      x: number;
      y: number;
      radius: number;
      color: string;
      start: number;
      duration: number;
    }
  | {
      kind: "burst";
      x: number;
      y: number;
      radius: number;
      color: string;
      start: number;
      duration: number;
    };

export type Project = (x: number, y: number) => { x: number; y: number };

const SPARKS = 6;

/**
 * Short-lived visual feedback driven by simulation events. Purely cosmetic:
 * it keeps its own wall-clock timeline and never feeds back into the game.
 */
export class Effects {
  private items: Effect[] = [];

  constructor(
    private readonly reducedMotion: boolean,
    private readonly clock: () => number,
  ) {}

  attach(events: EventBus<GameEvents>): () => void {
    const now = this.clock;
    const add = (effect: Effect): void => {
      this.items.push(effect);
    };
    const unsubscribers = [
      events.on("beamFired", ({ tower, target }) => {
        const from = towerCenter(tower);
        add({
          kind: "beam",
          x: from.x,
          y: from.y,
          x2: target.x,
          y2: target.y,
          color: towerColor(tower.def.id),
          start: now(),
          duration: 160,
        });
      }),
      events.on("pulseFired", ({ tower, radius }) => {
        const c = towerCenter(tower);
        add({
          kind: "ring",
          x: c.x,
          y: c.y,
          radius,
          color: towerColor(tower.def.id),
          start: now(),
          duration: 380,
        });
      }),
      events.on("explosion", ({ x, y, radius }) => {
        add({
          kind: "ring",
          x,
          y,
          radius,
          color: towerColor("cannon"),
          start: now(),
          duration: 300,
        });
      }),
      events.on("enemyKilled", ({ enemy }) => {
        add({
          kind: "burst",
          x: enemy.x,
          y: enemy.y,
          radius: 0.45,
          color: PALETTE.selection,
          start: now(),
          duration: 360,
        });
      }),
      events.on("enemyLeaked", ({ enemy }) => {
        add({
          kind: "ring",
          x: enemy.x,
          y: enemy.y,
          radius: 0.9,
          color: PALETTE.hpLow,
          start: now(),
          duration: 500,
        });
      }),
    ];
    return () => {
      unsubscribers.forEach((off) => {
        off();
      });
    };
  }

  clear(): void {
    this.items = [];
  }

  draw(ctx: CanvasRenderingContext2D, project: Project, cellSize: number, now: number): void {
    this.items = this.items.filter((e) => now - e.start < e.duration);
    for (const effect of this.items) {
      const t = Math.min(1, (now - effect.start) / effect.duration);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = effect.color;
      const p = project(effect.x, effect.y);

      switch (effect.kind) {
        case "beam": {
          const q = project(effect.x2, effect.y2);
          ctx.lineWidth = Math.max(1.5, cellSize * 0.1 * (1 - t));
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
          break;
        }
        case "ring": {
          const grow = this.reducedMotion ? 1 : 0.35 + 0.65 * t;
          ctx.lineWidth = Math.max(1, cellSize * 0.06);
          ctx.beginPath();
          ctx.arc(p.x, p.y, effect.radius * cellSize * grow, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case "burst": {
          if (this.reducedMotion) break;
          ctx.lineWidth = Math.max(1, cellSize * 0.05);
          const inner = effect.radius * cellSize * t * 0.6;
          const outer = effect.radius * cellSize * (0.3 + t);
          for (let i = 0; i < SPARKS; i++) {
            const angle = (i / SPARKS) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(p.x + Math.cos(angle) * inner, p.y + Math.sin(angle) * inner);
            ctx.lineTo(p.x + Math.cos(angle) * outer, p.y + Math.sin(angle) * outer);
            ctx.stroke();
          }
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}
