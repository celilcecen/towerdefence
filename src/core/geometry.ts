/** A continuous position in world units. One grid cell is one unit wide. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** An integer grid coordinate. */
export interface Cell {
  readonly x: number;
  readonly y: number;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function cellCenter(cell: Cell): Point {
  return { x: cell.x + 0.5, y: cell.y + 0.5 };
}

export function cellOf(point: Point): Cell {
  return { x: Math.floor(point.x), y: Math.floor(point.y) };
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}
