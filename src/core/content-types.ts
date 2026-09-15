/**
 * Game content is data, not code. Adding a tower, enemy or wave means adding
 * a definition that satisfies these types; the simulation does not change
 * (open/closed principle). Presentation concerns such as colours live in the
 * renderer, keyed by id, so the core stays free of them.
 */

export type TargetingMode = "first" | "last" | "strongest" | "closest";

export const TARGETING_MODES: readonly TargetingMode[] = ["first", "last", "strongest", "closest"];

export interface SlowEffect {
  /** Speed multiplier while slowed, in (0, 1]. Lower is stronger. */
  readonly factor: number;
  /** Seconds. */
  readonly duration: number;
}

export type AttackSpec =
  | {
      readonly kind: "projectile";
      readonly damage: number;
      /** Cells per second. */
      readonly speed: number;
      /** 0 hits only the target; greater than 0 damages everything in the radius. */
      readonly splashRadius: number;
    }
  | { readonly kind: "beam"; readonly damage: number }
  | { readonly kind: "pulse"; readonly damage: number; readonly slow: SlowEffect };

export type AttackKind = AttackSpec["kind"];

export interface TowerLevel {
  /** Gold to build (level 0) or to upgrade into this level. */
  readonly cost: number;
  /** Cells. */
  readonly range: number;
  /** Seconds between attacks. */
  readonly cooldown: number;
  readonly attack: AttackSpec;
}

export interface TowerDef {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly hotkey: string;
  readonly defaultTargeting: TargetingMode;
  readonly levels: readonly [TowerLevel, ...TowerLevel[]];
}

export interface EnemyDef {
  readonly id: string;
  readonly name: string;
  readonly hp: number;
  /** Cells per second. */
  readonly speed: number;
  /** Flat damage reduction per hit. */
  readonly armor: number;
  readonly bounty: number;
  /** Lives lost when this enemy reaches the exit. */
  readonly leakDamage: number;
  /** Cells. Used for rendering and hit feedback. */
  readonly radius: number;
}

export interface SpawnGroup {
  readonly enemy: string;
  readonly count: number;
  /** Seconds between spawns inside the group. */
  readonly interval: number;
  /** Seconds after the wave starts before the first spawn. */
  readonly delay: number;
}

export interface WaveDef {
  readonly groups: readonly SpawnGroup[];
  /** Scales every enemy's hit points in this wave. */
  readonly hpMultiplier: number;
  readonly clearBonus: number;
}

export interface MapDef {
  readonly id: string;
  readonly name: string;
  /** "." open, "#" rock, "S" spawn, "E" exit. */
  readonly rows: readonly string[];
}

export interface RulesDef {
  readonly startingGold: number;
  readonly startingLives: number;
  /** Share of total investment returned when a tower is sold. */
  readonly sellRefundRatio: number;
  /** Armor can never reduce a hit below this share of its raw damage. */
  readonly minDamageRatio: number;
}

export interface GameContent {
  readonly towers: readonly TowerDef[];
  readonly enemies: readonly EnemyDef[];
  readonly waves: readonly WaveDef[];
  readonly map: MapDef;
  readonly rules: RulesDef;
}
