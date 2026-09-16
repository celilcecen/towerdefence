import { describe, expect, it } from "vitest";
import type { TargetingMode } from "../src/core/content-types";
import {
  makeEnemy,
  makeSimulation,
  mutableWorld,
  recordEvents,
  TEST_TOWER,
} from "./support/fixtures";

describe("placeTower", () => {
  it("builds a tower, charges gold and reroutes the maze", () => {
    const sim = makeSimulation({ map: { id: "m", name: "m", rows: ["S..E", "...."] } });
    const placed = recordEvents(sim.events, "towerPlaced");
    const before = sim.flow.distanceAt(0, 0);

    expect(sim.apply({ type: "placeTower", tower: "gun", x: 1, y: 0 })).toEqual({ ok: true });

    const [tower] = sim.world.towers;
    expect(tower).toMatchObject({ x: 1, y: 0, level: 0, targeting: "first", invested: 10 });
    expect(sim.world.gold).toBe(90);
    expect(sim.grid.occupantAt(1, 0)).toBe(tower?.id);
    expect(sim.flow.distanceAt(0, 0)).toBeGreaterThan(before);
    expect(placed).toHaveLength(1);
  });

  it.each([
    [{ x: 9, y: 0 }, "out-of-bounds"],
    [{ x: 1.5, y: 0 }, "out-of-bounds"],
    [{ x: 0, y: 0 }, "not-buildable"],
    [{ x: 5, y: 0 }, "not-buildable"],
  ] as const)("rejects placement at %j with %s", (cell, error) => {
    const sim = makeSimulation();
    expect(sim.apply({ type: "placeTower", tower: "gun", ...cell })).toEqual({ ok: false, error });
    expect(sim.world.gold).toBe(100);
  });

  it("rejects building on an existing tower", () => {
    const sim = makeSimulation({ map: { id: "m", name: "m", rows: ["S..E", "...."] } });
    sim.apply({ type: "placeTower", tower: "gun", x: 1, y: 1 });
    expect(sim.apply({ type: "placeTower", tower: "gun", x: 1, y: 1 })).toEqual({
      ok: false,
      error: "not-buildable",
    });
  });

  it("rejects unknown tower types", () => {
    const sim = makeSimulation();
    expect(sim.apply({ type: "placeTower", tower: "laser", x: 1, y: 0 })).toEqual({
      ok: false,
      error: "unknown-tower-type",
    });
  });

  it("never lets the player seal the only path", () => {
    const sim = makeSimulation();
    expect(sim.apply({ type: "placeTower", tower: "gun", x: 2, y: 0 })).toEqual({
      ok: false,
      error: "blocks-path",
    });
    expect(sim.grid.isWalkable(2, 0)).toBe(true);
  });

  it("never traps a living enemy in a sealed pocket", () => {
    const sim = makeSimulation({ map: { id: "m", name: "m", rows: ["S...E", "#.###", "#.###"] } });
    mutableWorld(sim).enemies.push(makeEnemy({ x: 1.5, y: 2.5, waypoint: { x: 1, y: 2 } }));
    expect(sim.apply({ type: "placeTower", tower: "gun", x: 1, y: 1 })).toEqual({
      ok: false,
      error: "blocks-path",
    });
  });

  it("refuses cells an enemy stands on or is walking into", () => {
    const sim = makeSimulation({ map: { id: "m", name: "m", rows: ["S...E", "....."] } });
    mutableWorld(sim).enemies.push(makeEnemy({ x: 1.9, y: 0.5, waypoint: { x: 2, y: 0 } }));
    for (const x of [1, 2]) {
      expect(sim.apply({ type: "placeTower", tower: "gun", x, y: 0 })).toEqual({
        ok: false,
        error: "occupied-by-enemy",
      });
    }
  });

  it("requires enough gold", () => {
    const sim = makeSimulation({ map: { id: "m", name: "m", rows: ["S..E", "...."] } });
    mutableWorld(sim).gold = TEST_TOWER.levels[0].cost - 1;
    expect(sim.apply({ type: "placeTower", tower: "gun", x: 1, y: 1 })).toEqual({
      ok: false,
      error: "insufficient-gold",
    });
  });
});

describe("upgradeTower", () => {
  it("raises the level and tracks investment until max level", () => {
    const sim = makeSimulation({ map: { id: "m", name: "m", rows: ["S..E", "...."] } });
    sim.apply({ type: "placeTower", tower: "gun", x: 1, y: 1 });
    const id = sim.world.towers[0]?.id ?? -1;
    const upgraded = recordEvents(sim.events, "towerUpgraded");

    expect(sim.apply({ type: "upgradeTower", towerId: id })).toEqual({ ok: true });
    expect(sim.world.towers[0]).toMatchObject({ level: 1, invested: 30 });
    expect(sim.world.gold).toBe(70);
    expect(upgraded).toHaveLength(1);

    expect(sim.apply({ type: "upgradeTower", towerId: id })).toEqual({
      ok: false,
      error: "max-level",
    });
  });

  it("rejects unknown towers and insufficient gold", () => {
    const sim = makeSimulation({ map: { id: "m", name: "m", rows: ["S..E", "...."] } });
    expect(sim.apply({ type: "upgradeTower", towerId: 999 })).toEqual({
      ok: false,
      error: "unknown-tower",
    });

    sim.apply({ type: "placeTower", tower: "gun", x: 1, y: 1 });
    mutableWorld(sim).gold = 0;
    const id = sim.world.towers[0]?.id ?? -1;
    expect(sim.apply({ type: "upgradeTower", towerId: id })).toEqual({
      ok: false,
      error: "insufficient-gold",
    });
  });
});

describe("sellTower", () => {
  it("refunds a share of the investment and reopens the cell", () => {
    const sim = makeSimulation({ map: { id: "m", name: "m", rows: ["S..E", "...."] } });
    sim.apply({ type: "placeTower", tower: "gun", x: 1, y: 0 });
    const id = sim.world.towers[0]?.id ?? -1;
    sim.apply({ type: "upgradeTower", towerId: id });
    const sold = recordEvents(sim.events, "towerSold");
    const detour = sim.flow.distanceAt(0, 0);

    expect(sim.apply({ type: "sellTower", towerId: id })).toEqual({ ok: true });

    expect(sim.world.towers).toHaveLength(0);
    expect(sim.world.gold).toBe(70 + 15);
    expect(sim.grid.isBuildable(1, 0)).toBe(true);
    expect(sim.flow.distanceAt(0, 0)).toBeLessThan(detour);
    expect(sold[0]?.refund).toBe(15);
  });

  it("rejects unknown towers", () => {
    const sim = makeSimulation();
    expect(sim.apply({ type: "sellTower", towerId: 5 })).toEqual({
      ok: false,
      error: "unknown-tower",
    });
  });
});

describe("setTargeting", () => {
  const withTower = () => {
    const sim = makeSimulation({ map: { id: "m", name: "m", rows: ["S..E", "...."] } });
    sim.apply({ type: "placeTower", tower: "gun", x: 1, y: 1 });
    return { sim, id: sim.world.towers[0]?.id ?? -1 };
  };

  it("changes the tower's strategy", () => {
    const { sim, id } = withTower();
    expect(sim.apply({ type: "setTargeting", towerId: id, mode: "strongest" })).toEqual({
      ok: true,
    });
    expect(sim.world.towers[0]?.targeting).toBe("strongest");
  });

  it("validates input that bypassed the type system", () => {
    const { sim, id } = withTower();
    const mode = "random" as TargetingMode;
    expect(sim.apply({ type: "setTargeting", towerId: id, mode })).toEqual({
      ok: false,
      error: "invalid-targeting",
    });
    expect(sim.apply({ type: "setTargeting", towerId: 404, mode: "last" })).toEqual({
      ok: false,
      error: "unknown-tower",
    });
  });
});

describe("startWave", () => {
  it("queues the wave's spawn groups", () => {
    const sim = makeSimulation();
    const started = recordEvents(sim.events, "waveStarted");
    expect(sim.apply({ type: "startWave" })).toEqual({ ok: true });
    expect(sim.world.phase).toBe("wave");
    expect(sim.world.wavesStarted).toBe(1);
    expect(started).toEqual([{ wave: 1, early: false, bonus: 0 }]);
    expect(sim.apply({ type: "startWave" })).toEqual({ ok: false, error: "wave-in-progress" });
  });

  it("rejects every command once the game is over", () => {
    const sim = makeSimulation();
    mutableWorld(sim).phase = "lost";
    expect(sim.apply({ type: "startWave" })).toEqual({ ok: false, error: "game-over" });
    expect(sim.apply({ type: "placeTower", tower: "gun", x: 1, y: 0 })).toEqual({
      ok: false,
      error: "game-over",
    });
    expect(sim.apply({ type: "upgradeTower", towerId: 1 })).toEqual({
      ok: false,
      error: "game-over",
    });
    expect(sim.apply({ type: "sellTower", towerId: 1 })).toEqual({ ok: false, error: "game-over" });
    expect(sim.apply({ type: "setTargeting", towerId: 1, mode: "last" })).toEqual({
      ok: false,
      error: "game-over",
    });
  });
});
