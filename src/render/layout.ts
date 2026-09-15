import type { Cell, Point } from "../core/geometry";

export interface BoardLayout {
  readonly cellSize: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly columns: number;
  readonly rows: number;
  /**
   * On tall screens the board is drawn rotated a quarter turn, so the route
   * runs top to bottom and cells are large enough to tap. The simulation is
   * unaware of this; only the world-to-screen mapping changes.
   */
  readonly rotated: boolean;
}

const MIN_CELL = 8;
/** Rotate only when it buys clearly bigger cells, not for a marginal gain. */
const ROTATION_GAIN = 1.15;

function fit(width: number, height: number, across: number, down: number, padding: number): number {
  return Math.min((width - padding * 2) / across, (height - padding * 2) / down);
}

/** Largest whole-pixel cell size that fits the board in the viewport, centred. */
export function computeLayout(
  viewWidth: number,
  viewHeight: number,
  columns: number,
  rows: number,
  padding = 8,
): BoardLayout {
  const upright = fit(viewWidth, viewHeight, columns, rows, padding);
  const turned = fit(viewWidth, viewHeight, rows, columns, padding);
  const rotated = turned > upright * ROTATION_GAIN;
  const cellSize = Math.max(MIN_CELL, Math.floor(rotated ? turned : upright));
  const across = rotated ? rows : columns;
  const down = rotated ? columns : rows;
  return {
    cellSize,
    offsetX: Math.round((viewWidth - cellSize * across) / 2),
    offsetY: Math.round((viewHeight - cellSize * down) / 2),
    columns,
    rows,
    rotated,
  };
}

/** World coordinates (cells, may be fractional) to CSS pixels on the canvas. */
export function toScreen(layout: BoardLayout, x: number, y: number): Point {
  const { cellSize, offsetX, offsetY, rows, rotated } = layout;
  return rotated
    ? { x: offsetX + (rows - y) * cellSize, y: offsetY + x * cellSize }
    : { x: offsetX + x * cellSize, y: offsetY + y * cellSize };
}

/** Maps a point in CSS pixels, relative to the canvas, to a board cell. */
export function pointToCell(layout: BoardLayout, px: number, py: number): Cell | undefined {
  const { cellSize, offsetX, offsetY, columns, rows, rotated } = layout;
  const across = Math.floor((px - offsetX) / cellSize);
  const down = Math.floor((py - offsetY) / cellSize);
  const x = rotated ? down : across;
  const y = rotated ? rows - 1 - across : down;
  if (x < 0 || y < 0 || x >= columns || y >= rows) return undefined;
  return { x, y };
}
