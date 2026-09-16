import type { GameEvents } from "../core/game-events";

/**
 * Sound cues are named, not synthesized, here. This module only decides which
 * cue a simulation event deserves; the Web Audio adapter decides how it sounds.
 */
export const GAME_CUES = [
  "shot-bolt",
  "shot-cannon",
  "shot-mortar",
  "beam",
  "frost",
  "arc",
  "boom",
  "hit",
  "pop",
  "boss-arrive",
  "boss-down",
  "leak",
  "split",
  "heal",
  "build",
  "upgrade",
  "sell",
  "wave-start",
  "coins",
  "wave-clear",
  "victory",
  "defeat",
  "meteor",
  "freeze",
] as const;

/** Cues the UI plays directly rather than through simulation events. */
export const UI_CUES = ["tap", "denied", "star"] as const;

export type GameCue = (typeof GAME_CUES)[number];
export type UiCue = (typeof UI_CUES)[number];
export type Cue = GameCue | UiCue;

export const CUES: readonly Cue[] = [...GAME_CUES, ...UI_CUES];

export interface CuePlay {
  readonly cue: Cue;
  /** 0..1. How big the moment is: a wider blast, a heavier enemy, a higher level. */
  readonly size: number;
}

export interface CueContext {
  /** Tower def id for a live tower id; projectiles only carry the tower's id. */
  readonly towerKindOf: (towerId: number) => string | undefined;
}

export type EventCues = {
  readonly [K in keyof GameEvents]: (
    payload: GameEvents[K],
    context: CueContext,
  ) => readonly CuePlay[];
};

/** Enemies whose arrival and death get the boss treatment. */
export const BOSS_ENEMIES: ReadonlySet<string> = new Set(["tyrant"]);

/** Splash radius from which an unknown projectile tower sounds like a mortar. */
const MORTAR_SPLASH = 1.3;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const one = (cue: Cue, size = 0): readonly CuePlay[] => [{ cue, size }];

const none: readonly CuePlay[] = [];

const SHOT_CUES: Readonly<Record<string, GameCue>> = {
  bolt: "shot-bolt",
  cannon: "shot-cannon",
  mortar: "shot-mortar",
};

/** The shot sound for a projectile tower, falling back on the shot's splash for unknown towers. */
export function shotCue(towerKind: string | undefined, splashRadius: number): GameCue {
  const known = towerKind === undefined ? undefined : SHOT_CUES[towerKind];
  if (known) return known;
  if (splashRadius <= 0) return "shot-bolt";
  return splashRadius >= MORTAR_SPLASH ? "shot-mortar" : "shot-cannon";
}

export const EVENT_CUES: EventCues = {
  towerPlaced: () => one("build"),
  towerUpgraded: ({ tower }) => one("upgrade", clamp01(tower.level / 2)),
  towerSold: () => one("sell"),
  enemySpawned: ({ enemy }) => (BOSS_ENEMIES.has(enemy.def.id) ? one("boss-arrive", 1) : none),
  enemyHit: () => one("hit"),
  enemyKilled: ({ enemy }) =>
    BOSS_ENEMIES.has(enemy.def.id)
      ? one("boss-down", 1)
      : one("pop", clamp01((enemy.def.radius - 0.18) / 0.3)),
  enemyLeaked: ({ livesLost }) => one("leak", clamp01((livesLost - 1) / 4)),
  enemySplit: ({ count }) => one("split", clamp01(count / 6)),
  enemyHealed: () => one("heal"),
  projectileFired: ({ projectile }, { towerKindOf }) =>
    one(shotCue(towerKindOf(projectile.towerId), projectile.splashRadius)),
  explosion: ({ radius }) => one("boom", clamp01((radius - 0.8) / 1)),
  beamFired: () => one("beam"),
  pulseFired: () => one("frost"),
  chainFired: ({ targets }) => one("arc", clamp01((targets.length - 1) / 5)),
  powerCast: ({ power }) => one(power.spec.kind === "strike" ? "meteor" : "freeze", 1),
  waveStarted: ({ early }) => (early ? [...one("wave-start"), ...one("coins")] : one("wave-start")),
  waveCleared: () => one("wave-clear"),
  gameOver: ({ won }) => one(won ? "victory" : "defeat", 1),
};

/** Every simulation event the audio adapter listens to. */
export const CUE_EVENTS = Object.keys(EVENT_CUES) as readonly (keyof GameEvents)[];

/** The cues one simulation event deserves. */
export function cuesFor<K extends keyof GameEvents>(
  type: K,
  payload: GameEvents[K],
  context: CueContext,
): readonly CuePlay[] {
  return EVENT_CUES[type](payload, context);
}
