import { cellCenter } from "../geometry";
import type { EnemyState, SpawnCursor } from "../state";
import type { System, TickContext } from "../tick";

function spawnEnemy(ctx: TickContext, cursor: SpawnCursor): void {
  const def = ctx.content.enemy(cursor.group.enemy);
  const spawns = ctx.grid.spawns;
  const spawn = spawns[ctx.rng.int(spawns.length)] ?? spawns[0];
  if (!spawn) return;

  const center = cellCenter(spawn);
  const maxHp = Math.round(def.hp * cursor.hpMultiplier);
  const enemy: EnemyState = {
    id: ctx.world.nextId++,
    def,
    maxHp,
    hp: maxHp,
    x: center.x,
    y: center.y,
    prevX: center.x,
    prevY: center.y,
    waypoint: spawn,
    remaining: ctx.flow.distanceAt(spawn.x, spawn.y),
    slowFactor: 1,
    slowTimer: 0,
    status: "alive",
  };
  ctx.world.enemies.push(enemy);
  ctx.events.emit("enemySpawned", { enemy });
}

/** Releases enemies from the active wave's spawn groups on their schedule. */
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
