import { TARGETING_MODES } from "./content-types";
import type { Phase, WorldView } from "./state";

const PHASES: readonly Phase[] = ["building", "wave", "won", "lost"];
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Floats are quantised so the hash is stable against formatting, not against real drift. */
const QUANTUM = 1024;

class Fnv1a {
  private hash = FNV_OFFSET;

  add(...values: readonly number[]): void {
    for (const value of values) {
      let word = Math.round(value * QUANTUM) >>> 0;
      for (let byte = 0; byte < 4; byte++) {
        this.hash ^= word & 0xff;
        this.hash = Math.imul(this.hash, FNV_PRIME) >>> 0;
        word >>>= 8;
      }
    }
  }

  get value(): number {
    return this.hash >>> 0;
  }
}

/**
 * A fingerprint of everything that affects the future of the game. Two runs
 * with the same seed and commands must produce identical fingerprints tick
 * for tick; this is the basis of the determinism tests (and would be the
 * desync check in lockstep multiplayer).
 */
export function hashWorld(world: WorldView): number {
  const h = new Fnv1a();
  h.add(
    world.tick,
    world.gold,
    world.lives,
    PHASES.indexOf(world.phase),
    world.wavesStarted,
    world.wavesCleared,
  );
  for (const e of world.enemies) {
    h.add(
      e.id,
      e.hp,
      e.x,
      e.y,
      e.waypoint.x,
      e.waypoint.y,
      e.slowFactor,
      e.slowTimer,
      e.abilityTimer,
    );
  }
  for (const t of world.towers) {
    h.add(t.id, t.x, t.y, t.level, t.cooldown, TARGETING_MODES.indexOf(t.targeting), t.invested);
  }
  for (const p of world.projectiles) {
    h.add(p.id, p.x, p.y, p.aimX, p.aimY);
  }
  for (const power of world.powers) {
    h.add(power.cooldown);
  }
  for (const cursor of world.spawnQueue) {
    h.add(cursor.spawned, cursor.timer);
  }
  return h.value;
}
