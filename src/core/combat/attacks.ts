import type { AttackKind, AttackSpec, TowerLevel } from "../content-types";
import { distance } from "../geometry";
import type { EnemyState, TowerState } from "../state";
import { canHit, towerCenter } from "../state";
import type { TickContext } from "../tick";
import { applyDamage, applySlow } from "./damage";

export interface AttackBehaviour<S extends AttackSpec> {
  fire(
    ctx: TickContext,
    tower: TowerState,
    level: TowerLevel,
    spec: S,
    target: EnemyState,
    inRange: readonly EnemyState[],
  ): void;
}

type AttackRegistry = {
  readonly [K in AttackKind]: AttackBehaviour<Extract<AttackSpec, { kind: K }>>;
};

const hitsAir = (tower: TowerState): boolean => tower.def.groundOnly !== true;

/** Nearest living, hittable enemy within reach that the arc has not touched; older wins ties. */
function nextJump(
  ctx: TickContext,
  from: EnemyState,
  reach: number,
  air: boolean,
  visited: ReadonlySet<number>,
): EnemyState | undefined {
  let best: EnemyState | undefined;
  let bestDistance = Infinity;
  for (const enemy of ctx.world.enemies) {
    if (enemy.status !== "alive" || visited.has(enemy.id) || !canHit(air, enemy)) continue;
    const d = distance(from, enemy);
    if (d <= reach && d < bestDistance) {
      best = enemy;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * One behaviour per attack kind. A new kind is a new entry here plus a new
 * member of the AttackSpec union; the tower system itself never changes.
 */
export const ATTACKS: AttackRegistry = {
  projectile: {
    fire(ctx, tower, _level, spec, target) {
      const origin = towerCenter(tower);
      const projectile = {
        id: ctx.world.nextId++,
        towerId: tower.id,
        targetId: target.id,
        damage: spec.damage,
        speed: spec.speed,
        splashRadius: spec.splashRadius,
        hitsAir: hitsAir(tower),
        x: origin.x,
        y: origin.y,
        prevX: origin.x,
        prevY: origin.y,
        aimX: target.x,
        aimY: target.y,
        done: false,
      };
      ctx.world.projectiles.push(projectile);
      ctx.events.emit("projectileFired", { projectile });
    },
  },
  beam: {
    fire(ctx, tower, _level, spec, target) {
      ctx.events.emit("beamFired", { tower, target });
      applyDamage(ctx, target, spec.damage);
    },
  },
  pulse: {
    fire(ctx, tower, level, spec, _target, inRange) {
      ctx.events.emit("pulseFired", { tower, radius: level.range });
      for (const enemy of inRange) {
        applyDamage(ctx, enemy, spec.damage);
        applySlow(enemy, spec.slow);
      }
    },
  },
  chain: {
    fire(ctx, tower, _level, spec, target) {
      // The whole path is chosen before any damage lands, so a kill mid-chain
      // cannot change which enemies the arc reaches.
      const targets: EnemyState[] = [target];
      const visited = new Set([target.id]);
      let current = target;
      for (let jump = 0; jump < spec.jumps; jump++) {
        const next = nextJump(ctx, current, spec.jumpRange, hitsAir(tower), visited);
        if (!next) break;
        targets.push(next);
        visited.add(next.id);
        current = next;
      }
      ctx.events.emit("chainFired", { tower, targets });
      targets.forEach((enemy, i) => {
        applyDamage(ctx, enemy, spec.damage * spec.falloff ** i);
      });
    },
  },
};

export function fireAttack(
  ctx: TickContext,
  tower: TowerState,
  level: TowerLevel,
  target: EnemyState,
  inRange: readonly EnemyState[],
): void {
  // TypeScript cannot correlate `level.attack.kind` with the registry key,
  // so the lookup is widened once here; the registry type guarantees safety.
  const behaviour = ATTACKS[level.attack.kind] as AttackBehaviour<AttackSpec>;
  behaviour.fire(ctx, tower, level, level.attack, target, inRange);
}
