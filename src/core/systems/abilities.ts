import { distance } from "../geometry";
import type { EnemyState } from "../state";
import type { System, TickContext } from "../tick";

/**
 * Enemy abilities that act on other enemies. Menders restore hit points to
 * wounded allies nearby on a fixed interval; they never heal themselves, so
 * focusing the healer is always the answer.
 */
export class EnemyAbilitySystem implements System {
  readonly name = "abilities";

  update(ctx: TickContext): void {
    const { enemies } = ctx.world;
    for (const healer of enemies) {
      const heal = healer.def.heal;
      if (!heal || healer.status !== "alive") continue;

      healer.abilityTimer -= ctx.dt;
      if (healer.abilityTimer > 0) continue;
      healer.abilityTimer += heal.interval;

      const targets: EnemyState[] = [];
      for (const ally of enemies) {
        if (ally === healer || ally.status !== "alive" || ally.hp >= ally.maxHp) continue;
        if (distance(healer, ally) > heal.radius) continue;
        ally.hp = Math.min(ally.maxHp, ally.hp + heal.amount);
        targets.push(ally);
      }
      if (targets.length > 0) ctx.events.emit("enemyHealed", { healer, targets });
    }
  }
}

/** Power cooldowns only recover while a wave is running, so waiting between waves gains nothing. */
export class PowerCooldownSystem implements System {
  readonly name = "powers";

  update(ctx: TickContext): void {
    if (ctx.world.phase !== "wave") return;
    for (const power of ctx.world.powers) {
      power.cooldown = Math.max(0, power.cooldown - ctx.dt);
    }
  }
}
