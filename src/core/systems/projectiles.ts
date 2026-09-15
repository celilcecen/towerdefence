import { applyDamage } from "../combat/damage";
import { distance } from "../geometry";
import type { EnemyState, ProjectileState } from "../state";
import type { System, TickContext } from "../tick";

function impact(
  ctx: TickContext,
  projectile: ProjectileState,
  target: EnemyState | undefined,
): void {
  if (projectile.splashRadius > 0) {
    const center = { x: projectile.x, y: projectile.y };
    ctx.events.emit("explosion", { ...center, radius: projectile.splashRadius });
    for (const enemy of ctx.world.enemies) {
      if (distance(center, enemy) <= projectile.splashRadius) {
        applyDamage(ctx, enemy, projectile.damage);
      }
    }
    return;
  }
  if (target) applyDamage(ctx, target, projectile.damage);
}

/** Homing shots. If the target dies mid-flight the shot lands where it was last seen. */
export class ProjectileSystem implements System {
  readonly name = "projectiles";

  update(ctx: TickContext): void {
    const { world } = ctx;
    for (const projectile of world.projectiles) {
      projectile.prevX = projectile.x;
      projectile.prevY = projectile.y;

      const found = world.enemies.find((e) => e.id === projectile.targetId);
      const target = found?.status === "alive" ? found : undefined;
      if (target) {
        projectile.aimX = target.x;
        projectile.aimY = target.y;
      }

      const dx = projectile.aimX - projectile.x;
      const dy = projectile.aimY - projectile.y;
      const gap = Math.hypot(dx, dy);
      const step = projectile.speed * ctx.dt;

      if (gap <= step) {
        projectile.x = projectile.aimX;
        projectile.y = projectile.aimY;
        projectile.done = true;
        impact(ctx, projectile, target);
      } else {
        projectile.x += (dx / gap) * step;
        projectile.y += (dy / gap) * step;
      }
    }
    world.projectiles = world.projectiles.filter((p) => !p.done);
  }
}
