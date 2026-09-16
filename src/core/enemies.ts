import type { EnemyDef } from "./content-types";
import type { Cell, Point } from "./geometry";
import { cellCenter, distance } from "./geometry";
import type { EnemyState } from "./state";
import type { TickContext } from "./tick";

/** The exit cell a flyer heads for: the nearest one, ties broken by map order. */
export function nearestExit(ctx: Pick<TickContext, "grid">, from: Point): Cell | undefined {
  let best: Cell | undefined;
  let bestDistance = Infinity;
  for (const exit of ctx.grid.exits) {
    const d = distance(from, cellCenter(exit));
    if (d < bestDistance) {
      best = exit;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Creates an enemy, adds it to the world and announces it. Used for wave
 * spawns and for enemies released by a splitter's death alike, so both
 * follow exactly the same rules.
 */
export function addEnemy(
  ctx: Pick<TickContext, "world" | "grid" | "flow" | "events">,
  def: EnemyDef,
  position: Point,
  waypoint: Cell,
  hpMultiplier: number,
): EnemyState {
  const maxHp = Math.max(1, Math.round(def.hp * hpMultiplier));
  const target = def.flying ? (nearestExit(ctx, position) ?? waypoint) : waypoint;
  const enemy: EnemyState = {
    id: ctx.world.nextId++,
    def,
    maxHp,
    hp: maxHp,
    x: position.x,
    y: position.y,
    prevX: position.x,
    prevY: position.y,
    waypoint: target,
    remaining: def.flying
      ? distance(position, cellCenter(target))
      : ctx.flow.distanceAt(waypoint.x, waypoint.y) + distance(position, cellCenter(waypoint)),
    slowFactor: 1,
    slowTimer: 0,
    abilityTimer: def.heal?.interval ?? 0,
    status: "alive",
  };
  ctx.world.enemies.push(enemy);
  ctx.events.emit("enemySpawned", { enemy });
  return enemy;
}
