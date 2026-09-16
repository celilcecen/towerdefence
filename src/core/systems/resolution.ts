import { addEnemy } from "../enemies";
import type { EnemyState } from "../state";
import type { System, TickContext } from "../tick";

/** Children fan out slightly around the parent so they do not render as one sprite. */
const SPLIT_SPREAD = 0.18;

function releaseSplit(ctx: TickContext, parent: EnemyState): void {
  const split = parent.def.split;
  if (!split) return;
  const def = ctx.content.enemy(split.enemy);
  const multiplier = parent.maxHp / parent.def.hp;
  for (let i = 0; i < split.count; i++) {
    const offset = (i - (split.count - 1) / 2) * SPLIT_SPREAD;
    addEnemy(ctx, def, { x: parent.x + offset, y: parent.y - offset }, parent.waypoint, multiplier);
  }
  ctx.events.emit("enemySplit", { enemy: parent, count: split.count });
}

/**
 * Settles the consequences of the tick: bounties, splits, leaks, wave
 * completion, victory and defeat. Keeping this in one place means every other
 * system can simply mark state, and the rules for "what counts" live in a
 * single file.
 */
export class ResolutionSystem implements System {
  readonly name = "resolution";

  update(ctx: TickContext): void {
    const { world, events } = ctx;

    const settled = world.enemies;
    world.enemies = [];
    for (const enemy of settled) {
      switch (enemy.status) {
        case "killed":
          world.gold += enemy.def.bounty;
          events.emit("enemyKilled", { enemy, bounty: enemy.def.bounty });
          releaseSplit(ctx, enemy);
          break;
        case "leaked":
          world.lives = Math.max(0, world.lives - enemy.def.leakDamage);
          events.emit("enemyLeaked", { enemy, livesLost: enemy.def.leakDamage });
          break;
        case "alive":
          world.enemies.push(enemy);
          break;
      }
    }

    if (world.phase !== "wave") return;

    if (world.lives === 0) {
      world.phase = "lost";
      world.spawnQueue = [];
      events.emit("gameOver", { won: false });
      return;
    }

    if (world.spawnQueue.length > 0 || world.enemies.length > 0) return;

    // Waves called early are all settled together once the board is empty.
    while (world.wavesCleared < world.wavesStarted) {
      const bonus = ctx.content.wave(world.wavesCleared).clearBonus;
      world.wavesCleared += 1;
      world.gold += bonus;
      events.emit("waveCleared", { wave: world.wavesCleared, bonus });
    }

    if (world.wavesCleared >= ctx.content.waves.length) {
      world.phase = "won";
      events.emit("gameOver", { won: true });
    } else {
      world.phase = "building";
    }
  }
}
