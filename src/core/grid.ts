import type { Cell } from "./geometry";

export type Terrain = "open" | "rock" | "spawn" | "exit";

const LEGEND: ReadonlyMap<string, Terrain> = new Map([
  [".", "open"],
  ["#", "rock"],
  ["S", "spawn"],
  ["E", "exit"],
]);

export class GridParseError extends Error {
  override readonly name = "GridParseError";
}

const NO_OCCUPANT = 0;

/**
 * Static terrain plus tower occupancy. Terrain never changes after parsing;
 * occupancy changes only through tower commands.
 */
export class Grid {
  private readonly occupants: Int32Array;

  private constructor(
    readonly width: number,
    readonly height: number,
    private readonly terrain: readonly Terrain[],
    readonly spawns: readonly Cell[],
    readonly exits: readonly Cell[],
  ) {
    this.occupants = new Int32Array(width * height);
  }

  static parse(rows: readonly string[]): Grid {
    const width = rows[0]?.length ?? 0;
    if (rows.length === 0 || width === 0) {
      throw new GridParseError("Map must have at least one row and one column.");
    }

    const terrain: Terrain[] = [];
    const spawns: Cell[] = [];
    const exits: Cell[] = [];

    for (let y = 0; y < rows.length; y++) {
      const row = rows[y] ?? "";
      if (row.length !== width) {
        throw new GridParseError(`Row ${y} has ${row.length} cells, expected ${width}.`);
      }
      // Map symbols are single ASCII characters; anything else is rejected below.
      for (let x = 0; x < width; x++) {
        const symbol = row.charAt(x);
        const kind = LEGEND.get(symbol);
        if (kind === undefined) {
          throw new GridParseError(`Unknown map symbol "${symbol}" at (${x}, ${y}).`);
        }
        if (kind === "spawn") spawns.push({ x, y });
        if (kind === "exit") exits.push({ x, y });
        terrain.push(kind);
      }
    }

    if (spawns.length === 0) throw new GridParseError("Map needs at least one spawn (S).");
    if (exits.length === 0) throw new GridParseError("Map needs at least one exit (E).");

    return new Grid(width, rows.length, terrain, spawns, exits);
  }

  contains(x: number, y: number): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      x < this.width &&
      y < this.height
    );
  }

  /** Cells outside the grid behave as rock. */
  terrainAt(x: number, y: number): Terrain {
    return this.contains(x, y) ? (this.terrain[this.index(x, y)] ?? "rock") : "rock";
  }

  occupantAt(x: number, y: number): number | undefined {
    if (!this.contains(x, y)) return undefined;
    const id = this.occupants[this.index(x, y)];
    return id === NO_OCCUPANT ? undefined : id;
  }

  isWalkable(x: number, y: number): boolean {
    return this.terrainAt(x, y) !== "rock" && this.occupantAt(x, y) === undefined;
  }

  isBuildable(x: number, y: number): boolean {
    return this.terrainAt(x, y) === "open" && this.occupantAt(x, y) === undefined;
  }

  setOccupant(x: number, y: number, towerId: number): void {
    this.occupants[this.index(x, y)] = towerId;
  }

  clearOccupant(x: number, y: number): void {
    this.occupants[this.index(x, y)] = NO_OCCUPANT;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }
}
