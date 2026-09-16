import type { HeroDef } from "../core/content-types";

/**
 * The Sentinel: the player's own body on the field. Its damage output sits
 * around one and a half Bolt towers, so it matters early and helps late
 * without ever replacing the maze. Touching a boss is close to lethal on
 * purpose: the hero fights around the big ones, not through them.
 */
export const SENTINEL: HeroDef = {
  id: "sentinel",
  name: "Sentinel",
  summary: "You. Runs the maze, fires at anything in reach, dashes through gaps.",
  hp: 100,
  speed: 3.4,
  radius: 0.3,
  attack: { damage: 7, cooldown: 0.28, range: 3.2, speed: 14 },
  dash: { distance: 2.2, duration: 0.18, cooldown: 2.4 },
  nova: { damage: 70, radius: 2.4, slow: { factor: 0.5, duration: 2.5 }, charge: 260 },
  contactDamage: 6,
  regen: 4,
  respawn: 6,
};

export const HEROES: readonly HeroDef[] = [SENTINEL];
