import { describe, expect, it } from "vitest";
import { Grid } from "../src/core/grid";
import { clusterCells, clusterRegions, regionOf } from "../src/render/clusters";

describe("landmark clusters", () => {
  it("returns nothing for no cells", () => {
    expect(clusterCells([])).toEqual([]);
    expect(regionOf([])).toBeUndefined();
    expect(clusterRegions([])).toEqual([]);
  });

  it("keeps edge-connected cells together and splits diagonal neighbours", () => {
    const groups = clusterCells([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(3);
    expect(groups[1]).toEqual([{ x: 2, y: 2 }]);
  });

  it("finds one rift per spawn group and one gate per exit group", () => {
    const grid = Grid.parse(["S.......S", "S.......S", "....EE...", "....EE...", "SS......."]);
    const spawns = clusterRegions(grid.spawns);
    expect(spawns).toEqual([
      { x: 0.5, y: 1, halfWidth: 0.5, halfHeight: 1 },
      { x: 8.5, y: 1, halfWidth: 0.5, halfHeight: 1 },
      { x: 1, y: 4.5, halfWidth: 1, halfHeight: 0.5 },
    ]);
    expect(clusterRegions(grid.exits)).toEqual([{ x: 5, y: 3, halfWidth: 1, halfHeight: 1 }]);
  });

  it("measures a tall cluster as taller than it is wide", () => {
    const [region] = clusterRegions([
      { x: 3, y: 4 },
      { x: 3, y: 5 },
      { x: 3, y: 6 },
    ]);
    expect(region?.halfHeight).toBeGreaterThan(region?.halfWidth ?? Infinity);
  });
});
