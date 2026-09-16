/**
 * Game content is data, not code. Adding a tower, enemy, wave or level means
 * adding a definition that satisfies these types; the simulation does not
 * change (open/closed principle). Presentation concerns such as colours and
 * translated text live in adapters, keyed by id, so the core stays free of them.
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
  | { readonly kind: "pulse"; readonly damage: number; readonly slow: SlowEffect }
  | {
      readonly kind: "chain";
      readonly damage: number;
      /** Extra enemies the arc jumps to after the first. */
      readonly jumps: number;
      /** Cells. Maximum distance of each jump. */
      readonly jumpRange: number;
      /** Damage multiplier applied per jump, in (0, 1]. */
      readonly falloff: number;
    };

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
  /** Ground-only towers can neither target nor splash flying enemies. */
  readonly groundOnly?: boolean;
  readonly levels: readonly [TowerLevel, ...TowerLevel[]];
}

export interface SplitSpec {
  /** Enemy id released when this enemy dies. */
  readonly enemy: string;
  readonly count: number;
}

export interface HealSpec {
  /** Hit points restored to each wounded ally in range. */
  readonly amount: number;
  /** Cells. */
  readonly radius: number;
  /** Seconds between heals. */
  readonly interval: number;
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
  /** Flyers ignore the maze and head straight for the nearest exit. */
  readonly flying?: boolean;
  readonly split?: SplitSpec;
  readonly heal?: HealSpec;
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

export type PowerSpec =
  | {
      /** Damages every enemy, ground or air, in a circle the player chooses. */
      readonly kind: "strike";
      readonly damage: number;
      readonly radius: number;
    }
  | {
      /** Slows every enemy on the board. */
      readonly kind: "freeze";
      readonly slow: SlowEffect;
    };

export type PowerKind = PowerSpec["kind"];

export interface PowerDef {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  /** Seconds of wave time before the power can be used again. */
  readonly cooldown: number;
  readonly spec: PowerSpec;
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
  /** Share of the next wave's clear bonus paid immediately for calling it early. */
  readonly earlyCallRatio: number;
}

export interface GameContent {
  readonly towers: readonly TowerDef[];
  readonly enemies: readonly EnemyDef[];
  readonly waves: readonly WaveDef[];
  readonly powers: readonly PowerDef[];
  readonly map: MapDef;
  readonly rules: RulesDef;
}

/** One playable stage of the campaign. The level picks which shared content it uses. */
export interface LevelDef {
  readonly id: string;
  readonly map: MapDef;
  readonly waves: readonly WaveDef[];
  /** Tower ids available to build, in dock order. */
  readonly towers: readonly string[];
  readonly powers: readonly string[];
  readonly startingGold: number;
  readonly startingLives: number;
}

export interface ChapterDef {
  readonly id: string;
  /** Visual theme id, interpreted by the renderer. */
  readonly theme: string;
  readonly levels: readonly LevelDef[];
}

export interface CampaignDef {
  readonly towers: readonly TowerDef[];
  readonly enemies: readonly EnemyDef[];
  readonly powers: readonly PowerDef[];
  readonly rules: Omit<RulesDef, "startingGold" | "startingLives">;
  readonly chapters: readonly ChapterDef[];
}
