import { describe, expect, it } from "vitest";
import { FlowField } from "../src/core/flow-field";
import { Grid, GridParseError } from "../src/core/grid";

describe("Grid.parse", () => {
  it("reads terrain, spawns and exits", () => {
    const grid = Grid.parse(["S.#", "..E"]);
    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);
    expect(grid.spawns).toEqual([{ x: 0, y: 0 }]);
    expect(grid.exits).toEqual([{ x: 2, y: 1 }]);
    expect(grid.terrainAt(2, 0)).toBe("rock");
    expect(grid.terrainAt(1, 1)).toBe("open");
  });

  it.each([
    [[], "at least one row"],
    [[""], "at least one row"],
    [["S..", "E."], "Row 1 has 2 cells, expected 3"],
    [["S?E"], 'Unknown map symbol "?"'],
    [["..E"], "at least one spawn"],
    [["S.."], "at least one exit"],
  ])("rejects malformed map %j", (rows, message) => {
    expect(() => Grid.parse(rows)).toThrow(GridParseError);
    expect(() => Grid.parse(rows)).toThrow(message);
  });
});

describe("Grid queries", () => {
  it("treats anything outside the grid, or non-integer, as solid rock", () => {
    const grid = Grid.parse(["S.E"]);
    for (const [x, y] of [
      [-1, 0],
      [3, 0],
      [0, 1],
      [0.5, 0],
      [Number.NaN, 0],
    ] as const) {
      expect(grid.contains(x, y)).toBe(false);
      expect(grid.terrainAt(x, y)).toBe("rock");
      expect(grid.isWalkable(x, y)).toBe(false);
      expect(grid.occupantAt(x, y)).toBeUndefined();
    }
  });

  it("only allows building on open, unoccupied cells", () => {
    const grid = Grid.parse(["S.#E"]);
    expect(grid.isBuildable(0, 0)).toBe(false);
    expect(grid.isBuildable(1, 0)).toBe(true);
    expect(grid.isBuildable(2, 0)).toBe(false);
    expect(grid.isBuildable(3, 0)).toBe(false);
  });

  it("tracks tower occupancy", () => {
    const grid = Grid.parse(["S..E"]);
    grid.setOccupant(1, 0, 42);
    expect(grid.occupantAt(1, 0)).toBe(42);
    expect(grid.isWalkable(1, 0)).toBe(false);
    expect(grid.isBuildable(1, 0)).toBe(false);
    grid.clearOccupant(1, 0);
    expect(grid.occupantAt(1, 0)).toBeUndefined();
    expect(grid.isWalkable(1, 0)).toBe(true);
  });
});

describe("FlowField", () => {
  it("measures steps to the exit along a corridor", () => {
    const field = FlowField.compute(Grid.parse(["S...E"]));
    expect([0, 1, 2, 3, 4].map((x) => field.distanceAt(x, 0))).toEqual([4, 3, 2, 1, 0]);
  });

  it("routes around rocks", () => {
    const grid = Grid.parse(["S#E", "..."]);
    const field = FlowField.compute(grid);
    expect(field.distanceAt(0, 0)).toBe(4);
    expect(field.pathFrom({ x: 0, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 0 },
    ]);
  });

  it("uses the nearest of several exits", () => {
    const field = FlowField.compute(Grid.parse(["E..S....E"]));
    expect(field.distanceAt(3, 0)).toBe(3);
    expect(field.nextStep(3, 0)).toEqual({ x: 2, y: 0 });
  });

  it("breaks ties deterministically, preferring east, then south", () => {
    const field = FlowField.compute(Grid.parse(["S.", ".E"]));
    expect(field.nextStep(0, 0)).toEqual({ x: 1, y: 0 });
  });

  it("can simulate a blocked cell without mutating the grid", () => {
    const grid = Grid.parse(["S.E"]);
    const blocked = FlowField.compute(grid, { x: 1, y: 0 });
    expect(blocked.isReachable(0, 0)).toBe(false);
    expect(blocked.pathFrom({ x: 0, y: 0 })).toEqual([]);
    expect(blocked.nextStep(0, 0)).toBeUndefined();
    expect(grid.isWalkable(1, 0)).toBe(true);
    expect(FlowField.compute(grid).isReachable(0, 0)).toBe(true);
  });

  it("ignores exits that are blocked", () => {
    const field = FlowField.compute(Grid.parse(["S.E"]), { x: 2, y: 0 });
    expect(field.isReachable(0, 0)).toBe(false);
  });

  it("has no next step at the exit or outside the grid", () => {
    const field = FlowField.compute(Grid.parse(["S.E"]));
    expect(field.nextStep(2, 0)).toBeUndefined();
    expect(field.distanceAt(9, 9)).toBe(Infinity);
    expect(field.nextStep(9, 9)).toBeUndefined();
  });
});
