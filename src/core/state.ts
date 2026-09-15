import type { EnemyDef, SpawnGroup, TargetingMode, TowerDef, TowerLevel } from "./content-types";
import type { Cell, Point } from "./geometry";

export type Phase = "building" | "wave" | "won" | "lost";

export type EnemyStatus = "alive" | "killed" | "leaked";

export interface EnemyState {
  readonly id: number;
  readonly def: EnemyDef;
  readonly maxHp: number;
  hp: number;
  x: number;
  y: number;
  /** Position at the start of the tick, for render interpolation. */
  prevX: number;
  prevY: number;
  /** The cell whose centre the enemy is walking towards. */
  waypoint: Cell;
  /** Path distance to the exit; drives "first" and "last" targeting. */
  remaining: number;
  slowFactor: number;
  slowTimer: number;
  status: EnemyStatus;
}

export interface TowerState {
  readonly id: number;
  readonly def: TowerDef;
  readonly x: number;
  readonly y: number;
  level: number;
  cooldown: number;
  targeting: TargetingMode;
  /** Total gold spent on this tower, the basis for its sell value. */
  invested: number;
}

export interface ProjectileState {
  readonly id: number;
  readonly towerId: number;
  readonly targetId: number;
  readonly damage: number;
  readonly speed: number;
  readonly splashRadius: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Last known target position; the shot still lands if the target dies. */
  aimX: number;
  aimY: number;
  done: boolean;
}

export interface SpawnCursor {
  readonly group: SpawnGroup;
  readonly hpMultiplier: number;
  spawned: number;
  /** Seconds until the next spawn. */
  timer: number;
}

export interface WorldState {
  tick: number;
  gold: number;
  lives: number;
  phase: Phase;
  wavesStarted: number;
  enemies: EnemyState[];
  towers: TowerState[];
  projectiles: ProjectileState[];
  spawnQueue: SpawnCursor[];
  nextId: number;
}

/** Read-only view handed to adapters (renderer, UI, bots). */
export interface WorldView {
  readonly tick: number;
  readonly gold: number;
  readonly lives: number;
  readonly phase: Phase;
  readonly wavesStarted: number;
  readonly enemies: readonly Readonly<EnemyState>[];
  readonly towers: readonly Readonly<TowerState>[];
  readonly projectiles: readonly Readonly<ProjectileState>[];
}

export function towerCenter(tower: Pick<TowerState, "x" | "y">): Point {
  return { x: tower.x + 0.5, y: tower.y + 0.5 };
}

export function currentLevel(tower: Pick<TowerState, "def" | "level">): TowerLevel {
  const level = tower.def.levels[tower.level];
  if (!level) throw new RangeError(`Tower "${tower.def.id}" has no level ${tower.level}.`);
  return level;
}

export function nextLevel(tower: Pick<TowerState, "def" | "level">): TowerLevel | undefined {
  return tower.def.levels[tower.level + 1];
}

export function sellValue(tower: Pick<TowerState, "invested">, refundRatio: number): number {
  return Math.floor(tower.invested * refundRatio);
}
