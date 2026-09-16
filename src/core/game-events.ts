import type { PowerDef } from "./content-types";
import type { EnemyState, ProjectileState, TowerState } from "./state";

/** Everything observable that happens inside the simulation. */
export interface GameEvents {
  towerPlaced: { readonly tower: Readonly<TowerState> };
  towerUpgraded: { readonly tower: Readonly<TowerState> };
  towerSold: { readonly tower: Readonly<TowerState>; readonly refund: number };
  enemySpawned: { readonly enemy: Readonly<EnemyState> };
  enemyHit: { readonly enemy: Readonly<EnemyState>; readonly damage: number };
  enemyKilled: { readonly enemy: Readonly<EnemyState>; readonly bounty: number };
  enemyLeaked: { readonly enemy: Readonly<EnemyState>; readonly livesLost: number };
  enemySplit: { readonly enemy: Readonly<EnemyState>; readonly count: number };
  enemyHealed: {
    readonly healer: Readonly<EnemyState>;
    readonly targets: readonly Readonly<EnemyState>[];
  };
  projectileFired: { readonly projectile: Readonly<ProjectileState> };
  explosion: { readonly x: number; readonly y: number; readonly radius: number };
  beamFired: { readonly tower: Readonly<TowerState>; readonly target: Readonly<EnemyState> };
  pulseFired: { readonly tower: Readonly<TowerState>; readonly radius: number };
  /** The arc's path: the first target, then every enemy it jumped to. */
  chainFired: {
    readonly tower: Readonly<TowerState>;
    readonly targets: readonly Readonly<EnemyState>[];
  };
  powerCast: {
    readonly power: PowerDef;
    readonly x: number;
    readonly y: number;
    readonly targets: number;
  };
  waveStarted: { readonly wave: number; readonly early: boolean; readonly bonus: number };
  waveCleared: { readonly wave: number; readonly bonus: number };
  gameOver: { readonly won: boolean };
}
