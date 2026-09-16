import type { EventBus } from "../core/events";
import type { GameEvents } from "../core/game-events";
import type { Cell } from "../core/geometry";
import { towerCenter } from "../core/state";
import { hash, TAU } from "./art/common";
import { METEOR_FIRE, paintMeteor } from "./art/powers";
import type { Region } from "./clusters";
import { clusterRegions } from "./clusters";
import { lighten, withAlpha } from "./color";
import { enemyHeading } from "./motion";
import { enemyColor, isBoss, PALETTE, towerColor } from "./palette";

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
    | {
        /** Lightning from (x, y) through every point in turn. */
        readonly kind: "chain";
        readonly points: readonly { readonly x: number; readonly y: number }[];
        readonly color: string;
      }
    | { readonly kind: "plus"; readonly color: string }
    | {
        readonly kind: "goo";
        readonly radius: number;
        readonly color: string;
        readonly seed: number;
      }
    /** A meteor falling onto (x, y); it lands when the effect ends. */
    | { readonly kind: "meteor"; readonly radius: number }
    /** Snowflakes drifting across the whole board. */
    | { readonly kind: "snow"; readonly count: number; readonly seed: number }
    /** Text over every exit gate; (x, y) is ignored. */
    | { readonly kind: "exitText"; readonly text: string; readonly color: string }
  );

export type Project = (x: number, y: number) => { x: number; y: number };

/** The board as effects see it: its size in cells and where the gates are. */
export interface EffectBoard {
  readonly width: number;
  readonly height: number;
  readonly exits: readonly Cell[];
}

/** An enemy caught mid-dissolve just after it died. Positions are in cells. */
export interface DyingEnemy {
  /** The enemy definition id, which picks its sprite. */
  readonly enemy: string;
  readonly radius: number;
  readonly x: number;
  readonly y: number;
  /** World-space facing at the moment of death. */
  readonly heading: number;
  readonly start: number;
}

/** A small displacement, in cells. */
export interface Offset {
  readonly x: number;
  readonly y: number;
}

/** How a tower being built is posed: `lift` in cells above its cell. */
export interface BuildPose {
  readonly scale: number;
  readonly lift: number;
  readonly alpha: number;
}

export const HIT_FLASH_MS = 120;
export const CORE_HURT_MS = 650;
export const FREEZE_MS = 1100;
/** Milliseconds a meteor takes to fall before it lands. */
export const METEOR_MS = 420;
/** Milliseconds a new tower takes to drop in and settle. */
export const BUILD_MS = 260;
export const UPGRADE_FLASH_MS = 320;
/** Milliseconds a killed enemy takes to dissolve. */
export const DEATH_MS = 260;
/** Milliseconds an ordinary screen shake takes to die away. */
export const SHAKE_MS = 300;
export const BOSS_ARRIVAL_MS = 900;
/** Share of BUILD_MS a new tower spends falling before it lands. */
const BUILD_FALL = 0.55;
const MUZZLE_REACH = 0.42;
const HEAL_COLOR = "#4ade80";
const GOO_COLOR = "#d9f99d";
const STILL: Offset = { x: 0, y: 0 };

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

/**
 * A tower's pose `t` of the way through its build, in [0, 1]: it falls from
 * above, lands, bulges and settles back to its normal size.
 */
export function buildPop(t: number): BuildPose {
  const k = Math.min(1, Math.max(0, t));
  if (k < BUILD_FALL) {
    const u = k / BUILD_FALL;
    return { scale: 1, lift: (1 - u * u) * 0.6, alpha: Math.min(1, u * 2.5) };
  }
  const u = (k - BUILD_FALL) / (1 - BUILD_FALL);
  return { scale: 1 + 0.16 * Math.sin(u * Math.PI * 1.5) * (1 - u), lift: 0, alpha: 1 };
}

/**
 * Short-lived visual feedback driven by simulation events. Purely cosmetic:
 * it keeps its own wall-clock timeline and never feeds back into the game.
 */
export class Effects {
  private items: Effect[] = [];
  private readonly hits = new Map<number, number>();
  private readonly builds = new Map<number, number>();
  private readonly upgrades = new Map<number, number>();
  private deaths: DyingEnemy[] = [];
  private shakes: {
    readonly start: number;
    readonly strength: number;
    readonly duration: number;
  }[] = [];
  private hurtAt = Number.NEGATIVE_INFINITY;
  private freezeAt = Number.NEGATIVE_INFINITY;
  private bossAt = Number.NEGATIVE_INFINITY;
  private seeds = 0;
  private gates: { readonly exits: readonly Cell[]; readonly regions: Region[] } | undefined;

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
      start = now(),
    ): void => {
      add({ kind: "particles", x, y, radius, color, count, seed: this.seeds++, start, duration });
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
      events.on("chainFired", ({ tower, targets }) => {
        if (targets.length === 0) return;
        const from = towerCenter(tower);
        const color = towerColor(tower.def.id);
        add({
          kind: "chain",
          x: from.x,
          y: from.y,
          points: targets.map((t) => ({ x: t.x, y: t.y })),
          color,
          start: now(),
          duration: 260,
        });
        add({ kind: "flash", ...from, radius: 0.4, color, start: now(), duration: 160 });
        for (const target of targets) {
          add({
            kind: "flash",
            x: target.x,
            y: target.y,
            radius: 0.3,
            color: lighten(color, 0.3),
            start: now(),
            duration: 200,
          });
        }
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
      events.on("enemySpawned", ({ enemy }) => {
        if (!isBoss(enemy.def.id)) return;
        this.bossAt = now();
        this.kick(0.12, 520);
      }),
      events.on("enemyHit", ({ enemy }) => {
        this.hits.set(enemy.id, now());
      }),
      events.on("enemyHealed", ({ healer, targets }) => {
        add({
          kind: "ring",
          x: healer.x,
          y: healer.y,
          radius: healer.def.heal?.radius ?? 1.2,
          color: withAlpha(HEAL_COLOR, 0.45),
          filled: false,
          start: now(),
          duration: 520,
        });
        for (const target of [healer, ...targets]) {
          add({
            kind: "plus",
            x: target.x,
            y: target.y,
            color: HEAL_COLOR,
            start: now(),
            duration: 720,
          });
        }
      }),
      events.on("enemySplit", ({ enemy }) => {
        const color = enemyColor(enemy.def.id);
        add({
          kind: "goo",
          x: enemy.x,
          y: enemy.y,
          radius: Math.max(0.55, enemy.def.radius * 2.4),
          color,
          seed: this.seeds++,
          start: now(),
          duration: 520,
        });
        add({
          kind: "flash",
          x: enemy.x,
          y: enemy.y,
          radius: enemy.def.radius * 2,
          color: GOO_COLOR,
          start: now(),
          duration: 180,
        });
      }),
      events.on("enemyKilled", ({ enemy, bounty }) => {
        this.hits.delete(enemy.id);
        const color = enemyColor(enemy.def.id);
        const reach = Math.max(0.45, enemy.def.radius * 2);
        burst(enemy.x, enemy.y, reach, color, 10, 460);
        burst(enemy.x, enemy.y, reach * 0.6, lighten(color, 0.55), 6, 320);
        if (!this.reducedMotion) {
          this.deaths.push({
            enemy: enemy.def.id,
            radius: enemy.def.radius,
            x: enemy.x,
            y: enemy.y,
            heading: enemyHeading(enemy),
            start: now(),
          });
        }
        if (isBoss(enemy.def.id)) this.kick(0.22, 420);
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
        this.kick(0.07);
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
      events.on("powerCast", ({ power, x, y }) => {
        const { spec } = power;
        switch (spec.kind) {
          case "strike": {
            const fall = this.reducedMotion ? 0 : METEOR_MS;
            if (fall > 0) {
              add({ kind: "meteor", x, y, radius: spec.radius, start: now(), duration: fall });
            }
            const impact = now() + fall;
            this.kick(0.24, 380, impact);
            add({ kind: "blast", x, y, radius: spec.radius, start: impact, duration: 600 });
            add({
              kind: "ring",
              x,
              y,
              radius: spec.radius * 1.1,
              color: METEOR_FIRE,
              filled: false,
              start: impact,
              duration: 520,
            });
            burst(x, y, spec.radius * 1.1, "#57534e", 12, 560, impact);
            burst(x, y, spec.radius * 0.8, "#fdba74", 10, 460, impact);
            break;
          }
          case "freeze":
            this.freezeAt = now();
            add({
              kind: "snow",
              x,
              y,
              count: 26,
              seed: this.seeds++,
              start: now(),
              duration: 1500,
            });
            break;
        }
      }),
      events.on("waveStarted", ({ early, bonus }) => {
        if (!early || bonus <= 0) return;
        add({
          kind: "exitText",
          x: 0,
          y: 0,
          text: `+${bonus}`,
          color: PALETTE.gold,
          start: now(),
          duration: 1300,
        });
      }),
      events.on("towerPlaced", ({ tower }) => {
        const c = towerCenter(tower);
        // The dust ring waits for the tower to land.
        const landing = now() + (this.reducedMotion ? 0 : BUILD_MS * BUILD_FALL);
        if (!this.reducedMotion) this.builds.set(tower.id, now());
        add({
          kind: "ring",
          x: c.x,
          y: c.y,
          radius: 0.7,
          color: "#a8a29e",
          filled: false,
          start: landing,
          duration: 360,
        });
        add({
          kind: "ring",
          x: c.x,
          y: c.y,
          radius: 0.5,
          color: towerColor(tower.def.id),
          filled: false,
          start: landing,
          duration: 300,
        });
        burst(c.x, c.y, 0.7, "#a8a29e", 10, 400, landing);
      }),
      events.on("towerUpgraded", ({ tower }) => {
        const c = towerCenter(tower);
        const color = towerColor(tower.def.id);
        this.upgrades.set(tower.id, now());
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
        add({ kind: "flash", ...c, radius: 0.8, color, start: now(), duration: 260 });
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
        this.builds.delete(tower.id);
        this.upgrades.delete(tower.id);
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
    this.builds.clear();
    this.upgrades.clear();
    this.deaths = [];
    this.shakes = [];
    this.hurtAt = Number.NEGATIVE_INFINITY;
    this.freezeAt = Number.NEGATIVE_INFINITY;
    this.bossAt = Number.NEGATIVE_INFINITY;
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

  /**
   * Strength in [0, 1] of the board-wide icy tint after a freeze power: a
   * quick rise, then a fade over FREEZE_MS.
   */
  freezeOverlay(now: number): number {
    const t = (now - this.freezeAt) / FREEZE_MS;
    if (t < 0 || t >= 1) return 0;
    const rise = this.reducedMotion ? 0 : 0.08;
    return t < rise ? t / rise : 1 - easeOut((t - rise) / (1 - rise));
  }

  /** How far a tower is through its drop-in, in [0, 1]; 1 once settled or if never animated. */
  buildProgress(towerId: number, now: number): number {
    const at = this.builds.get(towerId);
    if (at === undefined) return 1;
    const t = (now - at) / BUILD_MS;
    if (t >= 1) {
      this.builds.delete(towerId);
      return 1;
    }
    return Math.max(0, t);
  }

  /** 1 the instant a tower is upgraded, fading to 0 over UPGRADE_FLASH_MS. */
  upgradeFlash(towerId: number, now: number): number {
    const at = this.upgrades.get(towerId);
    if (at === undefined) return 0;
    const t = (now - at) / UPGRADE_FLASH_MS;
    if (t >= 1) {
      this.upgrades.delete(towerId);
      return 0;
    }
    return t < 0 ? 0 : 1 - t;
  }

  /** Enemies still dissolving; each lasts DEATH_MS from its `start`. Empty under reduced motion. */
  dying(now: number): readonly DyingEnemy[] {
    if (this.deaths.length > 0) this.deaths = this.deaths.filter((d) => now - d.start < DEATH_MS);
    return this.deaths;
  }

  /**
   * The board's shake offset right now, in cells (multiply by the cell size).
   * Leaks nudge it, boss deaths and meteors rock it; each decays within a few
   * hundred milliseconds. Always zero under reduced motion.
   */
  shake(now: number): Offset {
    if (this.shakes.length === 0) return STILL;
    this.shakes = this.shakes.filter((k) => now - k.start < k.duration);
    let amplitude = 0;
    for (const k of this.shakes) {
      if (now < k.start) continue;
      const t = (now - k.start) / k.duration;
      amplitude = Math.max(amplitude, k.strength * (1 - t) * (1 - t));
    }
    if (amplitude === 0) return STILL;
    return { x: amplitude * Math.sin(now / 17 + 0.7), y: amplitude * Math.cos(now / 23) };
  }

  /** 1 the moment a boss steps out of the rift, fading to 0 over BOSS_ARRIVAL_MS. */
  bossArrival(now: number): number {
    const t = (now - this.bossAt) / BOSS_ARRIVAL_MS;
    return t < 0 || t >= 1 ? 0 : 1 - t;
  }

  /** `board` places effects that span the map (snow, gate text); without it they are skipped. */
  draw(
    ctx: CanvasRenderingContext2D,
    project: Project,
    cellSize: number,
    now: number,
    board?: EffectBoard,
  ): void {
    this.items = this.items.filter((e) => now - e.start < e.duration);
    const isText = (e: Effect): boolean => e.kind === "text" || e.kind === "exitText";
    ctx.save();
    for (const effect of this.items) {
      if (now >= effect.start && !isText(effect)) {
        this.drawEffect(ctx, project, cellSize, now, effect, board);
      }
    }
    for (const effect of this.items) {
      if (now >= effect.start && isText(effect)) {
        this.drawEffect(ctx, project, cellSize, now, effect, board);
      }
    }
    ctx.restore();
  }

  private kick(strength: number, duration = SHAKE_MS, start = this.clock()): void {
    if (this.reducedMotion) return;
    this.shakes.push({ start, strength, duration });
  }

  private gateRegions(board: EffectBoard): Region[] {
    if (this.gates?.exits !== board.exits) {
      this.gates = { exits: board.exits, regions: clusterRegions(board.exits) };
    }
    return this.gates.regions;
  }

  /** A jagged bolt between two screen points; `salt` keeps each segment's jitter distinct. */
  private bolt(
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    s: number,
    seed: number,
    salt: number,
    frame: number,
  ): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const segments = Math.max(3, Math.round(length / (s * 0.3)));
    ctx.moveTo(from.x, from.y);
    for (let i = 1; i <= segments; i++) {
      const f = i / segments;
      const jitter =
        i === segments ? 0 : (hash(seed, salt * 31 + i, frame) - 0.5) * Math.min(s * 0.45, length);
      ctx.lineTo(
        from.x + dx * f - (dy / length) * jitter,
        from.y + dy * f + (dx / length) * jitter,
      );
    }
  }

  private drawText(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    s: number,
    t: number,
    text: string,
    color: string,
    scale: number,
  ): void {
    const rise = this.reducedMotion ? 0 : easeOut(t) * s * 0.7;
    const size = Math.round(Math.max(12, s * 0.36) * scale);
    ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(2, size * 0.22);
    ctx.strokeStyle = "rgba(5, 8, 11, 0.85)";
    ctx.strokeText(text, x, y - s * 0.3 - rise);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y - s * 0.3 - rise);
  }

  private drawEffect(
    ctx: CanvasRenderingContext2D,
    project: Project,
    s: number,
    now: number,
    effect: Effect,
    board: EffectBoard | undefined,
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
      case "chain": {
        const frame = this.reducedMotion ? 0 : Math.floor(now / 40);
        const seed = effect.start | 0;
        ctx.beginPath();
        let from = p;
        effect.points.forEach((point, i) => {
          const to = project(point.x, point.y);
          this.bolt(ctx, from, to, s, seed, i, frame);
          from = to;
        });
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = withAlpha(effect.color, 0.3);
        ctx.lineWidth = Math.max(3, s * 0.22 * (1 - t * 0.5));
        ctx.stroke();
        ctx.strokeStyle = lighten(effect.color, 0.25);
        ctx.lineWidth = Math.max(1.5, s * 0.07);
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(1, s * 0.025);
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
      case "plus": {
        const rise = this.reducedMotion ? s * 0.2 : easeOut(t) * s * 0.55;
        const arm = Math.max(3, s * 0.12);
        const thick = Math.max(1.5, arm * 0.42);
        const cx = p.x + s * 0.12;
        const cy = p.y - s * 0.2 - rise;
        ctx.globalAlpha = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
        ctx.fillStyle = "rgba(5, 8, 11, 0.7)";
        ctx.fillRect(cx - arm - 1, cy - thick / 2 - 1, arm * 2 + 2, thick + 2);
        ctx.fillRect(cx - thick / 2 - 1, cy - arm - 1, thick + 2, arm * 2 + 2);
        ctx.fillStyle = effect.color;
        ctx.fillRect(cx - arm, cy - thick / 2, arm * 2, thick);
        ctx.fillRect(cx - thick / 2, cy - arm, thick, arm * 2);
        break;
      }
      case "goo": {
        const splat = effect.radius * s;
        ctx.fillStyle = withAlpha(effect.color, 0.3);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, splat * 0.55, splat * 0.42, hash(effect.seed, 0) * TAU, 0, TAU);
        ctx.fill();
        if (this.reducedMotion) break;
        const travel = splat * easeOut(t);
        for (let i = 0; i < 9; i++) {
          const angle = (i / 9) * TAU + hash(effect.seed, i, 2) * 0.6;
          const reach = travel * (0.5 + hash(effect.seed, i, 3) * 0.5);
          const size = s * (0.05 + hash(effect.seed, i, 4) * 0.06) * (1 - t * 0.6);
          const x = p.x + Math.cos(angle) * reach;
          const y = p.y + Math.sin(angle) * reach;
          ctx.fillStyle = i % 3 === 0 ? GOO_COLOR : effect.color;
          ctx.beginPath();
          ctx.ellipse(x, y, size * 1.3, size, angle, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case "meteor": {
        ctx.globalAlpha = 1;
        // The strike zone tightens as the meteor comes in.
        ctx.beginPath();
        ctx.arc(p.x, p.y, effect.radius * s * (1.25 - 0.25 * t), 0, TAU);
        ctx.fillStyle = withAlpha(METEOR_FIRE, 0.08 + 0.12 * t);
        ctx.fill();
        ctx.setLineDash([s * 0.2, s * 0.14]);
        ctx.strokeStyle = withAlpha(METEOR_FIRE, 0.5 + 0.4 * t);
        ctx.lineWidth = Math.max(1.5, s * 0.05);
        ctx.stroke();
        ctx.setLineDash([]);
        const fall = t * t;
        ctx.save();
        ctx.translate(p.x + s * 3.2 * (1 - fall), p.y - s * 4.6 * (1 - fall));
        paintMeteor(ctx, s * 2.4);
        ctx.restore();
        break;
      }
      case "snow": {
        if (!board) break;
        ctx.globalAlpha = Math.sin(Math.PI * t);
        ctx.strokeStyle = "#f0f9ff";
        ctx.lineCap = "round";
        const drift = this.reducedMotion ? 0 : t * 1.4;
        for (let i = 0; i < effect.count; i++) {
          const q = project(
            hash(effect.seed, i) * board.width,
            hash(effect.seed, i, 1) * board.height + drift,
          );
          const arm = s * (0.1 + hash(effect.seed, i, 2) * 0.1);
          const spin = hash(effect.seed, i, 3) * TAU + drift;
          ctx.lineWidth = Math.max(1, s * 0.03);
          ctx.beginPath();
          for (let k = 0; k < 3; k++) {
            const angle = spin + (k / 3) * Math.PI;
            ctx.moveTo(q.x - Math.cos(angle) * arm, q.y - Math.sin(angle) * arm);
            ctx.lineTo(q.x + Math.cos(angle) * arm, q.y + Math.sin(angle) * arm);
          }
          ctx.stroke();
        }
        break;
      }
      case "text":
        this.drawText(ctx, p.x, p.y, s, t, effect.text, effect.color, 1);
        break;
      case "exitText": {
        if (!board) break;
        for (const gate of this.gateRegions(board)) {
          const q = project(gate.x, gate.y);
          this.drawText(ctx, q.x, q.y - s * 0.3, s, t, effect.text, effect.color, 1.35);
        }
        break;
      }
    }
    ctx.globalAlpha = 1;
  }
}
