import { describe, expect, it } from "vitest";
import type { PowerDef } from "../src/core/content-types";
import { EventBus } from "../src/core/events";
import type { GameEvents } from "../src/core/game-events";
import type { TowerState } from "../src/core/state";
import type { AmbientPoint } from "../src/render/atmosphere";
import { ambientPoint } from "../src/render/atmosphere";
import {
  BOSS_ARRIVAL_MS,
  BUILD_MS,
  buildPop,
  DEATH_MS,
  Effects,
  SHAKE_MS,
  UPGRADE_FLASH_MS,
} from "../src/render/effects";
import { makeEnemy, TEST_ENEMY, TEST_TOWER } from "./support/fixtures";

const METEOR: PowerDef = {
  id: "meteor",
  name: "Meteor",
  summary: "",
  cooldown: 1,
  spec: { kind: "strike", damage: 1, radius: 1.5 },
};

const tower = (id: number): TowerState =>
  ({ id, def: TEST_TOWER, x: 2, y: 3, level: 0 }) as unknown as TowerState;

function setup(reducedMotion = false) {
  let now = 1000;
  const bus = new EventBus<GameEvents>();
  const effects = new Effects(reducedMotion, () => now);
  effects.attach(bus);
  return {
    bus,
    effects,
    at: (time: number) => {
      now = time;
    },
  };
}

/** Largest shake magnitude over a span of frames. */
function peakShake(effects: Effects, from: number, to: number): number {
  let peak = 0;
  for (let t = from; t < to; t += 4) {
    const { x, y } = effects.shake(t);
    peak = Math.max(peak, Math.hypot(x, y));
  }
  return peak;
}

describe("ambient particles", () => {
  it("stay inside their area, fade near the edges and move over time", () => {
    const out: AmbientPoint = { x: 0, y: 0, fade: 0 };
    for (let i = 0; i < 40; i++) {
      for (const now of [0, 1234, 98765]) {
        ambientPoint(out, 7, i, now, 300, 200, 12, -30);
        expect(out.x).toBeGreaterThanOrEqual(0);
        expect(out.x).toBeLessThan(300);
        expect(out.y).toBeGreaterThanOrEqual(0);
        expect(out.y).toBeLessThan(200);
        expect(out.fade).toBeGreaterThanOrEqual(0);
        expect(out.fade).toBeLessThanOrEqual(1);
      }
    }
    const a = { ...ambientPoint(out, 7, 3, 0, 300, 200, 12, -30) };
    const b = { ...ambientPoint(out, 7, 3, 0, 300, 200, 12, -30) };
    expect(b).toEqual(a);
    expect(ambientPoint(out, 7, 3, 500, 300, 200, 12, -30).y).not.toBe(a.y);
  });

  it("is safe on an empty area", () => {
    const out: AmbientPoint = { x: 5, y: 5, fade: 1 };
    expect(ambientPoint(out, 1, 1, 100, 0, 0, 1, 1)).toEqual({ x: 0, y: 0, fade: 0 });
  });
});

describe("tower build pose", () => {
  it("falls in from above, then settles at its normal size", () => {
    expect(buildPop(0).lift).toBeGreaterThan(0.5);
    expect(buildPop(0).alpha).toBe(0);
    expect(buildPop(1)).toEqual({ scale: 1, lift: 0, alpha: 1 });
    expect(buildPop(2)).toEqual({ scale: 1, lift: 0, alpha: 1 });
    let lift = Infinity;
    for (let t = 0; t <= 1; t += 0.05) {
      expect(buildPop(t).lift).toBeLessThanOrEqual(lift);
      lift = buildPop(t).lift;
    }
    expect(Math.max(...[0.6, 0.7, 0.8].map((t) => buildPop(t).scale))).toBeGreaterThan(1);
  });
});

describe("Effects juice", () => {
  it("animates a new tower's drop and an upgrade flash, then forgets them", () => {
    const { bus, effects } = setup();
    expect(effects.buildProgress(9, 1000)).toBe(1);
    bus.emit("towerPlaced", { tower: tower(9) });
    expect(effects.buildProgress(9, 1000)).toBe(0);
    expect(effects.buildProgress(9, 1000 + BUILD_MS / 2)).toBeCloseTo(0.5);
    expect(effects.buildProgress(9, 1000 + BUILD_MS)).toBe(1);

    bus.emit("towerUpgraded", { tower: tower(9) });
    expect(effects.upgradeFlash(9, 1000)).toBe(1);
    expect(effects.upgradeFlash(9, 1000 + UPGRADE_FLASH_MS)).toBe(0);
  });

  it("keeps killed enemies dissolving briefly", () => {
    const { bus, effects } = setup();
    bus.emit("enemyKilled", { enemy: makeEnemy({ x: 4, y: 5 }), bounty: 5 });
    const [dead] = effects.dying(1000);
    expect(dead).toMatchObject({ enemy: TEST_ENEMY.id, x: 4, y: 5, start: 1000 });
    expect(effects.dying(1000 + DEATH_MS)).toHaveLength(0);
  });

  it("shakes a little on a leak and more for a meteor, decaying to rest", () => {
    const { bus, effects, at } = setup();
    expect(effects.shake(1000)).toEqual({ x: 0, y: 0 });
    bus.emit("enemyLeaked", { enemy: makeEnemy(), livesLost: 1 });
    const leak = peakShake(effects, 1000, 1000 + SHAKE_MS);
    expect(leak).toBeGreaterThan(0);
    expect(effects.shake(1000 + SHAKE_MS)).toEqual({ x: 0, y: 0 });

    at(5000);
    bus.emit("powerCast", { power: METEOR, x: 3, y: 3, targets: 0 });
    expect(peakShake(effects, 5000, 5400)).toBeLessThan(0.01);
    expect(peakShake(effects, 5420, 5800)).toBeGreaterThan(leak);
    expect(effects.shake(7000)).toEqual({ x: 0, y: 0 });
  });

  it("marks a boss's arrival but not an ordinary spawn", () => {
    const { bus, effects } = setup();
    bus.emit("enemySpawned", { enemy: makeEnemy() });
    expect(effects.bossArrival(1000)).toBe(0);
    bus.emit("enemySpawned", { enemy: makeEnemy({ def: { ...TEST_ENEMY, id: "tyrant" } }) });
    expect(effects.bossArrival(1000)).toBe(1);
    expect(effects.bossArrival(1000 + BOSS_ARRIVAL_MS)).toBe(0);
  });

  it("stays still under reduced motion", () => {
    const { bus, effects } = setup(true);
    bus.emit("towerPlaced", { tower: tower(1) });
    bus.emit("enemyKilled", {
      enemy: makeEnemy({ def: { ...TEST_ENEMY, id: "warden" } }),
      bounty: 1,
    });
    bus.emit("enemyLeaked", { enemy: makeEnemy(), livesLost: 1 });
    expect(effects.buildProgress(1, 1000)).toBe(1);
    expect(effects.dying(1000)).toHaveLength(0);
    expect(peakShake(effects, 1000, 1400)).toBe(0);
  });

  it("clears everything", () => {
    const { bus, effects } = setup();
    bus.emit("towerPlaced", { tower: tower(2) });
    bus.emit("enemyKilled", { enemy: makeEnemy(), bounty: 1 });
    bus.emit("enemyLeaked", { enemy: makeEnemy(), livesLost: 1 });
    effects.clear();
    expect(effects.buildProgress(2, 1000)).toBe(1);
    expect(effects.dying(1000)).toHaveLength(0);
    expect(effects.shake(1000)).toEqual({ x: 0, y: 0 });
  });
});
