import { fireAttack } from "../combat/attacks";
import { enemiesInRange, TARGETING } from "../combat/targeting";
import { currentLevel, towerCenter } from "../state";
import type { System, TickContext } from "../tick";

/** Cools towers down, selects a target with the tower's strategy and fires. */
export class TowerSystem implements System {
  readonly name = "towers";

  update(ctx: TickContext): void {
    const { enemies, towers } = ctx.world;
    for (const tower of towers) {
      tower.cooldown = Math.max(0, tower.cooldown - ctx.dt);
      if (tower.cooldown > 0) continue;

      const level = currentLevel(tower);
      const origin = towerCenter(tower);
      const inRange = enemiesInRange(enemies, origin, level.range);
      const target = TARGETING[tower.targeting](inRange, origin);
      if (!target) continue;

      fireAttack(ctx, tower, level, target, inRange);
      tower.cooldown = level.cooldown;
    }
  }
}
