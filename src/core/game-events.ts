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
  projectileFired: { readonly projectile: Readonly<ProjectileState> };
  explosion: { readonly x: number; readonly y: number; readonly radius: number };
  beamFired: { readonly tower: Readonly<TowerState>; readonly target: Readonly<EnemyState> };
  pulseFired: { readonly tower: Readonly<TowerState>; readonly radius: number };
  waveStarted: { readonly wave: number };
  waveCleared: { readonly wave: number; readonly bonus: number };
  gameOver: { readonly won: boolean };
}
