import type { Cell } from "./geometry";
import type { Grid } from "./grid";

const UNREACHABLE = -1;

/** Fixed neighbour order makes tie-breaking, and therefore paths, deterministic. */
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/**
 * Distance-to-exit field computed with a multi-source breadth-first search.
 *
 * One O(cells) pass answers "where next?" for every enemy at once, so the
 * cost does not grow with the number of enemies (unlike per-enemy A*).
 * It is recomputed only when the maze changes: a tower is built or sold.
 */
export class FlowField {
  private constructor(
    private readonly grid: Grid,
    private readonly distances: Int32Array,
  ) {}

  /**
   * @param extraBlocked treat this cell as blocked, to test a placement
   *   before committing it.
   */
  static compute(grid: Grid, extraBlocked?: Cell): FlowField {
    const distances = new Int32Array(grid.width * grid.height).fill(UNREACHABLE);
    const queue = new Int32Array(grid.width * grid.height);
    let head = 0;
    let tail = 0;

    const blocked = (x: number, y: number): boolean =>
      !grid.isWalkable(x, y) || (extraBlocked?.x === x && extraBlocked.y === y);

    for (const exit of grid.exits) {
      if (blocked(exit.x, exit.y)) continue;
      const i = grid.index(exit.x, exit.y);
      distances[i] = 0;
      queue[tail++] = i;
    }

    while (head < tail) {
      const current = queue[head++] ?? 0;
      const x = current % grid.width;
      const y = (current - x) / grid.width;
      const nextDistance = (distances[current] ?? 0) + 1;

      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (blocked(nx, ny)) continue;
        const ni = grid.index(nx, ny);
        if (distances[ni] !== UNREACHABLE) continue;
        distances[ni] = nextDistance;
        queue[tail++] = ni;
      }
    }

    return new FlowField(grid, distances);
  }

  /** Steps to the nearest exit, or Infinity when unreachable. */
  distanceAt(x: number, y: number): number {
    if (!this.grid.contains(x, y)) return Infinity;
    const d = this.distances[this.grid.index(x, y)] ?? UNREACHABLE;
    return d === UNREACHABLE ? Infinity : d;
  }

  isReachable(x: number, y: number): boolean {
    return Number.isFinite(this.distanceAt(x, y));
  }

  /** The neighbouring cell one step closer to an exit, if any. */
  nextStep(x: number, y: number): Cell | undefined {
    const here = this.distanceAt(x, y);
    if (!Number.isFinite(here) || here === 0) return undefined;
    for (const [dx, dy] of NEIGHBOURS) {
      if (this.distanceAt(x + dx, y + dy) === here - 1) return { x: x + dx, y: y + dy };
    }
    return undefined;
  }

  /** Full route from a cell to the exit (inclusive). Empty when unreachable. */
  pathFrom(start: Cell): Cell[] {
    if (!this.isReachable(start.x, start.y)) return [];
    const path: Cell[] = [start];
    let next = this.nextStep(start.x, start.y);
    while (next) {
      path.push(next);
      next = this.nextStep(next.x, next.y);
    }
    return path;
  }
}
