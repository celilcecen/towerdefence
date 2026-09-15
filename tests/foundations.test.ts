import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/core/events";
import { cellCenter, cellOf, distance, sameCell } from "../src/core/geometry";
import { isBetter, parseRecord } from "../src/core/records";
import { Rng } from "../src/core/rng";
import { currentLevel, nextLevel, sellValue } from "../src/core/state";
import { TEST_TOWER } from "./support/fixtures";

describe("Rng", () => {
  it("is reproducible from its seed", () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const sequence = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(sequence);
    expect(a.currentState).toBe(b.currentState);
  });

  it("stays within its ranges", () => {
    const rng = new Rng(9);
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(rng.int(3)).toBeOneOf([0, 1, 2]);
    }
  });
});

describe("EventBus", () => {
  interface Events {
    ping: { n: number };
  }

  it("delivers to subscribers until they unsubscribe", () => {
    const bus = new EventBus<Events>();
    const listener = vi.fn();
    const off = bus.on("ping", listener);
    bus.emit("ping", { n: 1 });
    off();
    bus.emit("ping", { n: 2 });
    expect(listener).toHaveBeenCalledExactlyOnceWith({ n: 1 });
  });

  it("tolerates unsubscribing during delivery and clearing", () => {
    const bus = new EventBus<Events>();
    const second = vi.fn();
    const off = bus.on("ping", () => {
      off();
    });
    bus.on("ping", second);
    bus.emit("ping", { n: 1 });
    expect(second).toHaveBeenCalledTimes(1);

    bus.clear();
    bus.emit("ping", { n: 2 });
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("geometry", () => {
  it("converts between cells and points", () => {
    expect(cellCenter({ x: 2, y: 3 })).toEqual({ x: 2.5, y: 3.5 });
    expect(cellOf({ x: 2.99, y: 0.01 })).toEqual({ x: 2, y: 0 });
    expect(sameCell({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(true);
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("tower level helpers", () => {
  it("reads current and next levels and sell value", () => {
    expect(currentLevel({ def: TEST_TOWER, level: 1 }).cost).toBe(20);
    expect(nextLevel({ def: TEST_TOWER, level: 0 })?.cost).toBe(20);
    expect(nextLevel({ def: TEST_TOWER, level: 1 })).toBeUndefined();
    expect(sellValue({ invested: 45 }, 0.7)).toBe(31);
    expect(() => currentLevel({ def: TEST_TOWER, level: 5 })).toThrow(RangeError);
  });
});

describe("records", () => {
  it.each([
    [{ wave: 3, won: false, lives: 12 }, true],
    [{ wave: 15, won: true, lives: 0 }, true],
    [null, false],
    ["{}", false],
    [{ wave: -1, won: false, lives: 1 }, false],
    [{ wave: 2.5, won: false, lives: 1 }, false],
    [{ wave: 1e9, won: false, lives: 1 }, false],
    [{ wave: 1, won: "yes", lives: 1 }, false],
    [{ wave: 1, won: false }, false],
  ])("parseRecord(%j) accepted: %s", (input, accepted) => {
    expect(parseRecord(input) !== undefined).toBe(accepted);
  });

  it("drops unexpected fields", () => {
    expect(parseRecord({ wave: 2, won: false, lives: 3, admin: true })).toEqual({
      wave: 2,
      won: false,
      lives: 3,
    });
  });

  it("ranks wins, then progress, then lives", () => {
    const loss = { wave: 14, won: false, lives: 0 };
    const win = { wave: 15, won: true, lives: 1 };
    expect(isBetter(loss, undefined)).toBe(true);
    expect(isBetter(win, loss)).toBe(true);
    expect(isBetter(loss, win)).toBe(false);
    expect(isBetter({ ...loss, wave: 15 }, loss)).toBe(true);
    expect(isBetter({ ...win, lives: 5 }, win)).toBe(true);
    expect(isBetter(win, win)).toBe(false);
  });
});
