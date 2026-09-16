import { applyDamage, applySlow } from "../combat/damage";
import { distance } from "../geometry";
import { heroHome, slideHero } from "../hero";
import type { EnemyState, HeroState } from "../state";
import { HERO_ID } from "../state";
import type { System, TickContext } from "../tick";

/**
 * Timers count down in fixed ticks; thirty steps of one thirtieth do not
 * land exactly on zero in floating point, so anything this close is done.
 */
const EPSILON = 1e-9;
const countdown = (value: number, dt: number): number => {
  const next = value - dt;
  return next <= EPSILON ? 0 : next;
};

/** Nearest living enemy within reach; the lower id wins ties, so aim never flickers. */
function nearestEnemy(ctx: TickContext, hero: HeroState): EnemyState | undefined {
  let best: EnemyState | undefined;
  let bestDistance = hero.def.attack.range;
  for (const enemy of ctx.world.enemies) {
    if (enemy.status !== "alive") continue;
    const d = distance(hero, enemy);
    if (d < bestDistance || (best === undefined && d <= bestDistance)) {
      best = enemy;
      bestDistance = d;
    }
  }
  return best;
}

function fire(ctx: TickContext, hero: HeroState, target: EnemyState): void {
  const { attack } = hero.def;
  const projectile = {
    id: ctx.world.nextId++,
    towerId: HERO_ID,
    targetId: target.id,
    damage: attack.damage,
    speed: attack.speed,
    splashRadius: 0,
    hitsAir: true,
    x: hero.x,
    y: hero.y,
    prevX: hero.x,
    prevY: hero.y,
    aimX: target.x,
    aimY: target.y,
    done: false,
  };
  ctx.world.projectiles.push(projectile);
  hero.attackCooldown = attack.cooldown;
  hero.facing = Math.atan2(target.y - hero.y, target.x - hero.x);
  ctx.events.emit("projectileFired", { projectile });
  ctx.events.emit("heroFired", { hero, target });
}

/** Damage from every enemy the hero is touching, in hit points for this tick. */
function contact(ctx: TickContext, hero: HeroState): number {
  let total = 0;
  for (const enemy of ctx.world.enemies) {
    if (enemy.status !== "alive") continue;
    if (distance(hero, enemy) < enemy.def.radius + hero.def.radius) {
      total += hero.def.contactDamage * enemy.def.leakDamage * ctx.dt;
    }
  }
  return total;
}

/**
 * Moves the hero, fires at whatever is in reach, and settles contact damage,
 * falling and returning. Runs after enemies have moved so aim and contact
 * use their positions for this tick, and before towers so the hero's shots
 * queue up with theirs.
 */
export class HeroSystem implements System {
  readonly name = "hero";

  update(ctx: TickContext): void {
    const { hero } = ctx.world;
    if (!hero) return;
    hero.prevX = hero.x;
    hero.prevY = hero.y;
    const { dt } = ctx;

    if (hero.status === "down") {
      hero.respawnTimer = countdown(hero.respawnTimer, dt);
      if (hero.respawnTimer === 0) {
        const home = heroHome(ctx.grid);
        hero.x = home.x;
        hero.y = home.y;
        hero.prevX = home.x;
        hero.prevY = home.y;
        hero.hp = hero.def.hp;
        hero.status = "alive";
        ctx.events.emit("heroRespawned", { hero });
      }
      return;
    }

    hero.attackCooldown = countdown(hero.attackCooldown, dt);
    hero.dashCooldown = countdown(hero.dashCooldown, dt);

    if (hero.dashTimer > 0) {
      const { dash } = hero.def;
      const step = (dash.distance / dash.duration) * Math.min(dt, hero.dashTimer);
      slideHero(ctx.grid, hero, hero.dashX * step, hero.dashY * step);
      hero.dashTimer = countdown(hero.dashTimer, dt);
    } else if (hero.moveX !== 0 || hero.moveY !== 0) {
      const step = hero.def.speed * dt;
      slideHero(ctx.grid, hero, hero.moveX * step, hero.moveY * step);
      hero.facing = Math.atan2(hero.moveY, hero.moveX);
    }

    const target = nearestEnemy(ctx, hero);
    hero.targetId = target?.id;
    if (target && hero.attackCooldown === 0) fire(ctx, hero, target);

    const hurt = hero.dashTimer > 0 ? 0 : contact(ctx, hero);
    if (hurt > 0) {
      hero.hp = Math.max(0, hero.hp - hurt);
      ctx.events.emit("heroHurt", { hero, damage: hurt });
      if (hero.hp === 0) {
        hero.status = "down";
        hero.respawnTimer = hero.def.respawn;
        hero.targetId = undefined;
        hero.dashTimer = 0;
        ctx.events.emit("heroDowned", { hero });
      }
    } else if (hero.hp < hero.def.hp) {
      hero.hp = Math.min(hero.def.hp, hero.hp + hero.def.regen * dt);
    }
  }
}

/** Damages and slows every enemy within the nova's radius; returns how many it caught. */
export function detonateNova(
  ctx: Pick<TickContext, "world" | "content" | "events">,
  hero: HeroState,
): number {
  const { nova } = hero.def;
  let targets = 0;
  for (const enemy of ctx.world.enemies) {
    if (enemy.status !== "alive" || distance(hero, enemy) > nova.radius) continue;
    applyDamage(ctx, enemy, nova.damage);
    applySlow(enemy, nova.slow);
    targets++;
  }
  return targets;
}
