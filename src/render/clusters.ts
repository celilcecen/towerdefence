import type { Cell } from "../core/geometry";

/** Centre and half extents, in cells, of the box around a group of cells. */
export interface Region {
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

export function regionOf(cells: readonly Cell[]): Region | undefined {
  if (cells.length === 0) return undefined;
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs) + 1;
  const maxY = Math.max(...ys) + 1;
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    halfWidth: (maxX - minX) / 2,
    halfHeight: (maxY - minY) / 2,
  };
}

/**
 * Splits cells into groups that touch edge to edge (4-connected). Groups come
 * out in the order their first cell appears in `cells`, so the result is stable.
 */
export function clusterCells(cells: readonly Cell[]): Cell[][] {
  const key = (x: number, y: number): string => `${x},${y}`;
  const byKey = new Map(cells.map((c) => [key(c.x, c.y), c]));
  const seen = new Set<string>();
  const groups: Cell[][] = [];
  for (const start of cells) {
    if (seen.has(key(start.x, start.y))) continue;
    const group: Cell[] = [];
    const queue: Cell[] = [start];
    seen.add(key(start.x, start.y));
    for (let cell = queue.shift(); cell; cell = queue.shift()) {
      group.push(cell);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const k = key(cell.x + dx, cell.y + dy);
        const next = byKey.get(k);
        if (next && !seen.has(k)) {
          seen.add(k);
          queue.push(next);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

/** One region per connected group of cells: one portal per rift, one crystal per gate. */
export function clusterRegions(cells: readonly Cell[]): Region[] {
  return clusterCells(cells).flatMap((group) => regionOf(group) ?? []);
}
