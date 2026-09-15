import type { EnemyState } from "../state";
import type { System, TickContext } from "../tick";

/**
 * Settles the consequences of the tick: bounties, leaks, wave completion,
 * victory and defeat. Keeping this in one place means every other system can
 * simply mark state, and the rules for "what counts" live in a single file.
 */
export class ResolutionSystem implements System {
  readonly name = "resolution";

  update(ctx: TickContext): void {
    const { world, events } = ctx;

    const survivors: EnemyState[] = [];
    for (const enemy of world.enemies) {
      switch (enemy.status) {
        case "killed":
          world.gold += enemy.def.bounty;
          events.emit("enemyKilled", { enemy, bounty: enemy.def.bounty });
          break;
        case "leaked":
          world.lives = Math.max(0, world.lives - enemy.def.leakDamage);
          events.emit("enemyLeaked", { enemy, livesLost: enemy.def.leakDamage });
          break;
        case "alive":
          survivors.push(enemy);
          break;
      }
    }
    world.enemies = survivors;

    if (world.phase !== "wave") return;

    if (world.lives === 0) {
      world.phase = "lost";
      world.spawnQueue = [];
      events.emit("gameOver", { won: false });
      return;
    }

    if (world.spawnQueue.length > 0 || world.enemies.length > 0) return;

    const bonus = ctx.content.wave(world.wavesStarted - 1).clearBonus;
    world.gold += bonus;
    events.emit("waveCleared", { wave: world.wavesStarted, bonus });

    if (world.wavesStarted >= ctx.content.waves.length) {
      world.phase = "won";
      events.emit("gameOver", { won: true });
    } else {
      world.phase = "building";
    }
  }
}
