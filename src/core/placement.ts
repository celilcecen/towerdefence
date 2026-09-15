import { FlowField } from "./flow-field";
import { cellOf, sameCell } from "./geometry";
import type { SimulationInternals } from "./internals";

export type PlacementError =
  "out-of-bounds" | "not-buildable" | "occupied-by-enemy" | "blocks-path";

export type PlacementCheck =
  | { readonly ok: true; readonly field: FlowField }
  | { readonly ok: false; readonly error: PlacementError };

/**
 * A tower may never seal the maze. Placement is simulated first: the flow
 * field is recomputed with the cell blocked and must still connect every
 * spawn, and every living enemy, to an exit. The computed field is returned
 * so a successful placement does not pay for the search twice.
 */
export function checkPlacement(
  sim: Pick<SimulationInternals, "grid" | "world">,
  x: number,
  y: number,
): PlacementCheck {
  const { grid, world } = sim;
  if (!grid.contains(x, y)) return { ok: false, error: "out-of-bounds" };
  if (!grid.isBuildable(x, y)) return { ok: false, error: "not-buildable" };

  const cell = { x, y };
  const living = world.enemies.filter((e) => e.status === "alive");
  if (living.some((e) => sameCell(cellOf(e), cell) || sameCell(e.waypoint, cell))) {
    return { ok: false, error: "occupied-by-enemy" };
  }

  const field = FlowField.compute(grid, cell);
  const sealsSpawn = grid.spawns.some((s) => !field.isReachable(s.x, s.y));
  const trapsEnemy = living.some((e) => !field.isReachable(e.waypoint.x, e.waypoint.y));
  if (sealsSpawn || trapsEnemy) return { ok: false, error: "blocks-path" };

  return { ok: true, field };
}
