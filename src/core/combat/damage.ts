import type { SlowEffect } from "../content-types";
import type { EnemyState } from "../state";
import type { TickContext } from "../tick";

/** Flat armor, floored so armored enemies are never immune. */
export function damageAfterArmor(raw: number, armor: number, minDamageRatio: number): number {
  return Math.max(raw * minDamageRatio, raw - armor);
}

export function applyDamage(ctx: TickContext, enemy: EnemyState, raw: number): void {
  if (enemy.status !== "alive") return;
  const dealt = damageAfterArmor(raw, enemy.def.armor, ctx.content.rules.minDamageRatio);
  enemy.hp = Math.max(0, enemy.hp - dealt);
  ctx.events.emit("enemyHit", { enemy, damage: dealt });
  if (enemy.hp === 0) enemy.status = "killed";
}

/** Slows do not stack: a stronger slow replaces, an equal one refreshes, a weaker one is ignored. */
export function applySlow(enemy: EnemyState, slow: SlowEffect): void {
  if (enemy.status !== "alive") return;
  const active = enemy.slowTimer > 0;
  if (!active || slow.factor < enemy.slowFactor) {
    enemy.slowFactor = slow.factor;
    enemy.slowTimer = slow.duration;
  } else if (slow.factor === enemy.slowFactor) {
    enemy.slowTimer = Math.max(enemy.slowTimer, slow.duration);
  }
}

export function tickSlow(enemy: EnemyState, dt: number): void {
  if (enemy.slowTimer <= 0) return;
  enemy.slowTimer -= dt;
  if (enemy.slowTimer <= 0) {
    enemy.slowTimer = 0;
    enemy.slowFactor = 1;
  }
}
