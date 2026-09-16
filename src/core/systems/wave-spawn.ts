import { addEnemy } from "../enemies";
import { cellCenter } from "../geometry";
import type { SpawnCursor } from "../state";
import type { System, TickContext } from "../tick";

function spawnEnemy(ctx: TickContext, cursor: SpawnCursor): void {
  const def = ctx.content.enemy(cursor.group.enemy);
  const spawns = ctx.grid.spawns;
  const spawn = spawns[ctx.rng.int(spawns.length)] ?? spawns[0];
  if (!spawn) return;
  addEnemy(ctx, def, cellCenter(spawn), spawn, cursor.hpMultiplier);
}

/** Releases enemies from the active waves' spawn groups on their schedule. */
export class WaveSpawnSystem implements System {
  readonly name = "wave-spawn";

  update(ctx: TickContext): void {
    const { world } = ctx;
    for (const cursor of world.spawnQueue) {
      cursor.timer -= ctx.dt;
      while (cursor.timer <= 0 && cursor.spawned < cursor.group.count) {
        spawnEnemy(ctx, cursor);
        cursor.spawned += 1;
        cursor.timer += cursor.group.interval;
      }
    }
    world.spawnQueue = world.spawnQueue.filter((c) => c.spawned < c.group.count);
  }
}
