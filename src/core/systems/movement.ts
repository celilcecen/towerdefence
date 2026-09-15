import { tickSlow } from "../combat/damage";
import type { FlowField } from "../flow-field";
import { cellCenter } from "../geometry";
import type { EnemyState } from "../state";
import type { System, TickContext } from "../tick";

function remainingDistance(enemy: EnemyState, flow: FlowField): number {
  const target = cellCenter(enemy.waypoint);
  const toWaypoint = Math.hypot(target.x - enemy.x, target.y - enemy.y);
  return flow.distanceAt(enemy.waypoint.x, enemy.waypoint.y) + toWaypoint;
}

/**
 * Walks enemies from cell centre to cell centre along the flow field. Unused
 * movement budget carries over to the next waypoint, so speed is exact and
 * independent of how cell boundaries fall on tick boundaries.
 */
export class EnemyMovementSystem implements System {
  readonly name = "movement";

  update(ctx: TickContext): void {
    for (const enemy of ctx.world.enemies) {
      enemy.prevX = enemy.x;
      enemy.prevY = enemy.y;
      if (enemy.status !== "alive") continue;

      tickSlow(enemy, ctx.dt);
      let budget = enemy.def.speed * enemy.slowFactor * ctx.dt;

      while (budget > 0) {
        const target = cellCenter(enemy.waypoint);
        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const gap = Math.hypot(dx, dy);

        if (gap > budget) {
          enemy.x += (dx / gap) * budget;
          enemy.y += (dy / gap) * budget;
          break;
        }

        enemy.x = target.x;
        enemy.y = target.y;
        budget -= gap;

        const next = ctx.flow.nextStep(enemy.waypoint.x, enemy.waypoint.y);
        if (!next) {
          if (ctx.flow.distanceAt(enemy.waypoint.x, enemy.waypoint.y) === 0) {
            enemy.status = "leaked";
          }
          break;
        }
        enemy.waypoint = next;
      }

      enemy.remaining = remainingDistance(enemy, ctx.flow);
    }
  }
}
