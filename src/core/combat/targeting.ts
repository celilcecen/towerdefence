import type { TargetingMode } from "../content-types";
import type { Point } from "../geometry";
import { distance } from "../geometry";
import type { EnemyState } from "../state";

/** Chooses one enemy from those already known to be in range. */
export type TargetingStrategy = (
  candidates: readonly EnemyState[],
  origin: Point,
) => EnemyState | undefined;

/** Highest score wins; ties keep the earlier candidate, which is the older enemy. */
function pickBy(
  candidates: readonly EnemyState[],
  score: (enemy: EnemyState) => number,
): EnemyState | undefined {
  let best: EnemyState | undefined;
  let bestScore = -Infinity;
  for (const enemy of candidates) {
    const s = score(enemy);
    if (s > bestScore) {
      best = enemy;
      bestScore = s;
    }
  }
  return best;
}

/**
 * Strategy pattern. The mapped type forces a strategy for every mode, so
 * adding a mode without implementing it fails to compile.
 */
export const TARGETING: Readonly<Record<TargetingMode, TargetingStrategy>> = {
  first: (candidates) => pickBy(candidates, (e) => -e.remaining),
  last: (candidates) => pickBy(candidates, (e) => e.remaining),
  strongest: (candidates) => pickBy(candidates, (e) => e.hp),
  closest: (candidates, origin) => pickBy(candidates, (e) => -distance(origin, e)),
};

export function enemiesInRange(
  enemies: readonly EnemyState[],
  origin: Point,
  range: number,
): EnemyState[] {
  return enemies.filter((e) => e.status === "alive" && distance(origin, e) <= range);
}
