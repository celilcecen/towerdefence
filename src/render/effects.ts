import type { EventBus } from "../core/events";
import type { GameEvents } from "../core/game-events";
import { towerCenter } from "../core/state";
import { hash, TAU } from "./art/common";
import { lighten, withAlpha } from "./color";
import { enemyColor, PALETTE, towerColor } from "./palette";

interface Timed {
  readonly x: number;
  readonly y: number;
  readonly start: number;
  readonly duration: number;
}

type Effect = Timed &
  (
    | { readonly kind: "beam"; readonly x2: number; readonly y2: number; readonly color: string }
    | {
        readonly kind: "ring";
        readonly radius: number;
        readonly color: string;
        readonly filled: boolean;
      }
    | { readonly kind: "blast"; readonly radius: number }
    | { readonly kind: "flash"; readonly radius: number; readonly color: string }
    | {
        readonly kind: "particles";
        readonly radius: number;
        readonly color: string;
        readonly count: number;
        readonly seed: number;
      }
    | { readonly kind: "text"; readonly text: string; readonly color: string }
  );

export type Project = (x: number, y: number) => { x: number; y: number };

export const HIT_FLASH_MS = 120;
export const CORE_HURT_MS = 650;
const MUZZLE_REACH = 0.42;

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

/**
 * Short-lived visual feedback driven by simulation events. Purely cosmetic:
 * it keeps its own wall-clock timeline and never feeds back into the game.
 */
export class Effects {
  private items: Effect[] = [];
  private readonly hits = new Map<number, number>();
  private hurtAt = Number.NEGATIVE_INFINITY;
  private seeds = 0;

  constructor(
    private readonly reducedMotion: boolean,
    private readonly clock: () => number,
  ) {}

  attach(events: EventBus<GameEvents>): () => void {
    const now = this.clock;
    const add = (effect: Effect): void => {
      this.items.push(effect);
    };
    const burst = (
      x: number,
      y: number,
      radius: number,
      color: string,
      count: number,
      duration: number,
    ): void => {
      add({
        kind: "particles",
        x,
        y,
        radius,
        color,
        count,
        seed: this.seeds++,
        start: now(),
        duration,
      });
    };
    const unsubscribers = [
      events.on("projectileFired", ({ projectile }) => {
        const angle = Math.atan2(projectile.aimY - projectile.y, projectile.aimX - projectile.x);
        const heavy = projectile.splashRadius > 0;
        add({
          kind: "flash",
          x: projectile.x + Math.cos(angle) * MUZZLE_REACH,
          y: projectile.y + Math.sin(angle) * MUZZLE_REACH,
          radius: heavy ? 0.3 : 0.18,
          color: heavy ? "#fbbf24" : "#ecfccb",
          start: now(),
          duration: heavy ? 140 : 90,
        });
      }),
      events.on("beamFired", ({ tower, target }) => {
        const from = towerCenter(tower);
        const color = towerColor(tower.def.id);
        add({
          kind: "beam",
          x: from.x,
          y: from.y,
          x2: target.x,
          y2: target.y,
          color,
          start: now(),
          duration: 220,
        });
        add({
          kind: "flash",
          x: target.x,
          y: target.y,
          radius: 0.35,
          color,
          start: now(),
          duration: 200,
        });
      }),
      events.on("pulseFired", ({ tower, radius }) => {
        const c = towerCenter(tower);
        const color = towerColor(tower.def.id);
        add({
          kind: "ring",
          x: c.x,
          y: c.y,
          radius,
          color,
          filled: true,
          start: now(),
          duration: 420,
        });
        burst(c.x, c.y, radius, lighten(color, 0.5), 10, 420);
      }),
      events.on("explosion", ({ x, y, radius }) => {
        add({ kind: "blast", x, y, radius, start: now(), duration: 380 });
        burst(x, y, radius * 0.9, "#78716c", 8, 420);
      }),
      events.on("enemyHit", ({ enemy }) => {
        this.hits.set(enemy.id, now());
      }),
      events.on("enemyKilled", ({ enemy, bounty }) => {
        this.hits.delete(enemy.id);
        burst(
          enemy.x,
          enemy.y,
          Math.max(0.45, enemy.def.radius * 2),
          enemyColor(enemy.def.id),
          9,
          420,
        );
        add({
          kind: "text",
          x: enemy.x,
          y: enemy.y,
          text: `+${bounty}`,
          color: PALETTE.gold,
          start: now(),
          duration: 850,
        });
      }),
      events.on("enemyLeaked", ({ enemy, livesLost }) => {
        this.hits.delete(enemy.id);
        this.hurtAt = now();
        add({
          kind: "ring",
          x: enemy.x,
          y: enemy.y,
          radius: 0.9,
          color: PALETTE.hpLow,
          filled: false,
          start: now(),
          duration: 500,
        });
        add({
          kind: "text",
          x: enemy.x,
          y: enemy.y,
          text: `−${livesLost} ♥`,
          color: PALETTE.hpLow,
          start: now(),
          duration: 900,
        });
      }),
      events.on("towerPlaced", ({ tower }) => {
        const c = towerCenter(tower);
        add({
          kind: "ring",
          x: c.x,
          y: c.y,
          radius: 0.6,
          color: towerColor(tower.def.id),
          filled: false,
          start: now(),
          duration: 350,
        });
        burst(c.x, c.y, 0.6, "#94a3b8", 8, 380);
      }),
      events.on("towerUpgraded", ({ tower }) => {
        const c = towerCenter(tower);
        const color = towerColor(tower.def.id);
        add({
          kind: "ring",
          x: c.x,
          y: c.y,
          radius: 0.75,
          color,
          filled: false,
          start: now(),
          duration: 450,
        });
        burst(c.x, c.y, 0.7, lighten(color, 0.4), 10, 450);
        add({
          kind: "text",
          x: c.x,
          y: c.y,
          text: `Level ${tower.level + 1}`,
          color,
          start: now(),
          duration: 900,
        });
      }),
      events.on("towerSold", ({ tower, refund }) => {
        const c = towerCenter(tower);
        burst(c.x, c.y, 0.6, "#94a3b8", 8, 380);
        add({
          kind: "text",
          x: c.x,
          y: c.y,
          text: `+${refund}`,
          color: PALETTE.gold,
          start: now(),
          duration: 850,
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
    this.hits.clear();
    this.hurtAt = Number.NEGATIVE_INFINITY;
  }

  /** 1 the instant an enemy is hit, fading to 0 over HIT_FLASH_MS. */
  hitFlash(enemyId: number, now: number): number {
    const at = this.hits.get(enemyId);
    if (at === undefined) return 0;
    const t = (now - at) / HIT_FLASH_MS;
    if (t >= 1) {
      this.hits.delete(enemyId);
      return 0;
    }
    return t < 0 ? 0 : 1 - t;
  }

  /** 1 when an enemy has just reached the core, fading to 0 over CORE_HURT_MS. */
  coreHurt(now: number): number {
    const t = (now - this.hurtAt) / CORE_HURT_MS;
    return t < 0 || t >= 1 ? 0 : 1 - t;
  }

  draw(ctx: CanvasRenderingContext2D, project: Project, cellSize: number, now: number): void {
    this.items = this.items.filter((e) => now - e.start < e.duration);
    ctx.save();
    for (const effect of this.items) {
      if (effect.kind !== "text") this.drawEffect(ctx, project, cellSize, now, effect);
    }
    for (const effect of this.items) {
      if (effect.kind === "text") this.drawEffect(ctx, project, cellSize, now, effect);
    }
    ctx.restore();
  }

  private drawEffect(
    ctx: CanvasRenderingContext2D,
    project: Project,
    s: number,
    now: number,
    effect: Effect,
  ): void {
    const t = Math.min(1, Math.max(0, (now - effect.start) / effect.duration));
    const p = project(effect.x, effect.y);
    ctx.globalAlpha = 1 - t;

    switch (effect.kind) {
      case "beam": {
        const q = project(effect.x2, effect.y2);
        const segments = 7;
        const nx = -(q.y - p.y);
        const ny = q.x - p.x;
        const length = Math.hypot(nx, ny) || 1;
        const frame = this.reducedMotion ? 0 : Math.floor(now / 45);
        ctx.beginPath();
        for (let i = 0; i <= segments; i++) {
          const f = i / segments;
          const jitter =
            i === 0 || i === segments ? 0 : (hash(effect.start | 0, i, frame) - 0.5) * s * 0.4;
          ctx.lineTo(
            p.x + (q.x - p.x) * f + (nx / length) * jitter,
            p.y + (q.y - p.y) * f + (ny / length) * jitter,
          );
        }
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = withAlpha(effect.color, 0.35);
        ctx.lineWidth = Math.max(3, s * 0.24 * (1 - t));
        ctx.stroke();
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = Math.max(2, s * 0.09);
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.stroke();
        break;
      }
      case "ring": {
        const grow = this.reducedMotion ? 1 : 0.35 + 0.65 * easeOut(t);
        const radius = effect.radius * s * grow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, TAU);
        if (effect.filled) {
          ctx.fillStyle = withAlpha(effect.color, 0.16);
          ctx.fill();
        }
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = Math.max(1, s * 0.06);
        ctx.stroke();
        break;
      }
      case "blast": {
        const radius = effect.radius * s * (this.reducedMotion ? 1 : 0.45 + 0.55 * easeOut(t));
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        gradient.addColorStop(0, "#fffbeb");
        gradient.addColorStop(0.3, "#fde047");
        gradient.addColorStop(0.65, "rgba(245, 158, 11, 0.75)");
        gradient.addColorStop(1, "rgba(120, 53, 15, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, TAU);
        ctx.fill();
        break;
      }
      case "flash": {
        const radius = effect.radius * s;
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.4, effect.color);
        gradient.addColorStop(1, withAlpha(effect.color, 0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, TAU);
        ctx.fill();
        break;
      }
      case "particles": {
        if (this.reducedMotion) break;
        ctx.fillStyle = effect.color;
        const travel = effect.radius * s * (0.25 + 0.75 * easeOut(t));
        for (let i = 0; i < effect.count; i++) {
          const angle = (i / effect.count) * TAU + hash(effect.seed, i) * 0.8;
          const reach = travel * (0.6 + hash(effect.seed, i, 1) * 0.4);
          ctx.beginPath();
          ctx.arc(
            p.x + Math.cos(angle) * reach,
            p.y + Math.sin(angle) * reach,
            Math.max(1, s * 0.05 * (1 - t)),
            0,
            TAU,
          );
          ctx.fill();
        }
        break;
      }
      case "text": {
        const rise = this.reducedMotion ? 0 : easeOut(t) * s * 0.7;
        const size = Math.round(Math.max(12, s * 0.36));
        ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
        ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = Math.max(2, size * 0.22);
        ctx.strokeStyle = "rgba(5, 8, 11, 0.85)";
        ctx.strokeText(effect.text, p.x, p.y - s * 0.3 - rise);
        ctx.fillStyle = effect.color;
        ctx.fillText(effect.text, p.x, p.y - s * 0.3 - rise);
        break;
      }
    }
    ctx.globalAlpha = 1;
  }
}
