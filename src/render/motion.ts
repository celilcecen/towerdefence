import type { EventBus } from "../core/events";
import type { GameEvents } from "../core/game-events";
import { cellCenter } from "../core/geometry";
import type { EnemyState } from "../core/state";
import { towerCenter } from "../core/state";

const TAU = Math.PI * 2;
/** Milliseconds a turret takes to swing onto a new target. */
export const TURN_MS = 90;
/** Milliseconds of barrel kick after a shot. */
export const RECOIL_MS = 160;

/** Shortest signed rotation from `from` to `to`, in (-π, π]. */
export function angleDelta(from: number, to: number): number {
  const delta = (((to - from) % TAU) + TAU) % TAU;
  return delta > Math.PI ? delta - TAU : delta;
}

/** World-space direction an enemy faces: towards its waypoint, or along its last step. */
export function enemyHeading(
  enemy: Pick<EnemyState, "x" | "y" | "prevX" | "prevY" | "waypoint">,
): number {
  const target = cellCenter(enemy.waypoint);
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  if (Math.hypot(dx, dy) > 1e-3) return Math.atan2(dy, dx);
  const sx = enemy.x - enemy.prevX;
  const sy = enemy.y - enemy.prevY;
  return Math.hypot(sx, sy) > 1e-6 ? Math.atan2(sy, sx) : 0;
}

interface Aim {
  from: number;
  to: number;
  turnedAt: number;
  firedAt: number;
}

/**
 * Where each turret points and when it last fired, derived purely from
 * simulation events. Cosmetic state only: it never feeds back into the game.
 * Angles are in world space; 0 faces the exit.
 */
export class TurretAim {
  private readonly aims = new Map<number, Aim>();

  constructor(private readonly clock: () => number) {}

  attach(events: EventBus<GameEvents>): () => void {
    const unsubscribers = [
      events.on("projectileFired", ({ projectile }) => {
        const angle = Math.atan2(projectile.aimY - projectile.y, projectile.aimX - projectile.x);
        this.fire(projectile.towerId, angle);
      }),
      events.on("beamFired", ({ tower, target }) => {
        const from = towerCenter(tower);
        this.fire(tower.id, Math.atan2(target.y - from.y, target.x - from.x));
      }),
      events.on("pulseFired", ({ tower }) => {
        this.fire(tower.id, undefined);
      }),
      events.on("towerSold", ({ tower }) => {
        this.aims.delete(tower.id);
      }),
    ];
    return () => {
      unsubscribers.forEach((off) => {
        off();
      });
    };
  }

  clear(): void {
    this.aims.clear();
  }

  angle(towerId: number, now: number): number {
    const aim = this.aims.get(towerId);
    if (!aim) return 0;
    const t = Math.min(1, Math.max(0, (now - aim.turnedAt) / TURN_MS));
    return aim.from + angleDelta(aim.from, aim.to) * t;
  }

  /** 1 at the moment of firing, easing to 0 over RECOIL_MS. */
  recoil(towerId: number, now: number): number {
    const aim = this.aims.get(towerId);
    if (!aim) return 0;
    const t = (now - aim.firedAt) / RECOIL_MS;
    return t < 0 || t >= 1 ? 0 : (1 - t) * (1 - t);
  }

  private fire(towerId: number, angle: number | undefined): void {
    const now = this.clock();
    const aim = this.aims.get(towerId);
    const current = aim ? this.angle(towerId, now) : 0;
    this.aims.set(towerId, {
      from: current,
      to: angle ?? aim?.to ?? 0,
      turnedAt: now,
      firedAt: now,
    });
  }
}
