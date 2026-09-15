import { describe, expect, it, vi } from "vitest";
import { ENEMIES } from "../src/content/enemies";
import { TOWERS } from "../src/content/towers";
import type { AttackSpec, TowerDef } from "../src/core/content-types";
import { EventBus } from "../src/core/events";
import type { GameEvents } from "../src/core/game-events";
import type { EnemyState, ProjectileState, TowerState } from "../src/core/state";
import { darken, lighten, mix, withAlpha } from "../src/render/color";
import { computeLayout, screenAngle } from "../src/render/layout";
import { angleDelta, enemyHeading, RECOIL_MS, TURN_MS, TurretAim } from "../src/render/motion";
import type { SpriteSurface } from "../src/render/sprite-cache";
import { SpriteCache } from "../src/render/sprite-cache";
import {
  describeAttack,
  describeLevel,
  enemyProfile,
  towerRole,
  waveRoster,
} from "../src/ui/describe";
import { makeEnemy, TEST_TOWER } from "./support/fixtures";

describe("colour helpers", () => {
  it("blends, lightens and darkens #rrggbb colours", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#102030", "#102030", 0.7)).toBe("#102030");
    expect(lighten("#000000", 1)).toBe("#ffffff");
    expect(darken("#ffffff", 1)).toBe("#000000");
  });

  it("clamps blend and alpha amounts", () => {
    expect(mix("#000000", "#ffffff", 2)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", -1)).toBe("#000000");
    expect(withAlpha("#ff8000", 0.5)).toBe("rgba(255, 128, 0, 0.5)");
    expect(withAlpha("#ff8000", 3)).toBe("rgba(255, 128, 0, 1)");
  });

  it("rejects colours it cannot parse", () => {
    expect(() => mix("red", "#ffffff", 0.5)).toThrow(RangeError);
  });
});

describe("SpriteCache", () => {
  const fakeContext = () => {
    const spies = {
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
    };
    return { spies, ctx: spies as unknown as CanvasRenderingContext2D };
  };

  const setup = () => {
    const sizes: [number, number][] = [];
    const factory = vi.fn((width: number, height: number): SpriteSurface => {
      sizes.push([width, height]);
      return {
        image: { width, height } as unknown as CanvasImageSource,
        context: fakeContext().ctx,
      };
    });
    return { cache: new SpriteCache(factory), factory, sizes };
  };

  it("paints each key once at device resolution", () => {
    const { cache, factory, sizes } = setup();
    cache.configure(30, 2);
    const paint = vi.fn();

    const first = cache.get("tower", 1.3, paint);
    const again = cache.get("tower", 1.3, paint);

    expect(again).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(sizes[0]).toEqual([78, 78]);
    expect(paint).toHaveBeenCalledTimes(1);
    expect(paint.mock.lastCall?.[1]).toBe(30);
  });

  it("repaints only when the cell size or pixel ratio changes", () => {
    const { cache } = setup();
    const paint = vi.fn();
    cache.configure(30, 1);
    cache.get("a", 1, paint);
    cache.configure(30, 1);
    expect(cache.size).toBe(1);
    cache.configure(31, 1);
    expect(cache.size).toBe(0);
    cache.get("a", 1, paint);
    cache.configure(31, 2);
    expect(cache.size).toBe(0);
    expect(paint).toHaveBeenCalledTimes(2);
  });

  it("draws centred, rotating only when asked", () => {
    const { cache } = setup();
    cache.configure(20, 1);
    const { ctx, spies } = fakeContext();

    cache.draw(ctx, "a", 1, vi.fn(), 50, 60);
    expect(spies.drawImage).toHaveBeenCalledWith(expect.anything(), 40, 50, 20, 20);
    expect(spies.rotate).not.toHaveBeenCalled();

    cache.draw(ctx, "a", 1, vi.fn(), 50, 60, Math.PI);
    expect(spies.translate).toHaveBeenCalledWith(50, 60);
    expect(spies.rotate).toHaveBeenCalledWith(Math.PI);
    expect(spies.drawImage).toHaveBeenLastCalledWith(expect.anything(), -10, -10, 20, 20);
    expect(spies.restore).toHaveBeenCalledTimes(1);
  });
});

describe("motion", () => {
  it("measures the shortest turn between angles", () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angleDelta(Math.PI * 0.9, -Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2);
    expect(angleDelta(0, Math.PI * 4)).toBeCloseTo(0);
  });

  it("faces enemies towards their waypoint, then along their last step", () => {
    expect(enemyHeading(makeEnemy({ x: 0.5, y: 0.5, waypoint: { x: 1, y: 0 } }))).toBeCloseTo(0);
    expect(enemyHeading(makeEnemy({ x: 0.5, y: 0.5, waypoint: { x: 0, y: 1 } }))).toBeCloseTo(
      Math.PI / 2,
    );
    expect(
      enemyHeading(makeEnemy({ x: 0.5, y: 0.5, prevX: 0.5, prevY: 0.9, waypoint: { x: 0, y: 0 } })),
    ).toBeCloseTo(-Math.PI / 2);
    expect(enemyHeading(makeEnemy({ waypoint: { x: 0, y: 0 } }))).toBe(0);
  });

  it("turns world angles into screen angles on a rotated board", () => {
    const upright = computeLayout(1000, 500, 18, 11);
    const rotated = computeLayout(400, 900, 18, 11);
    expect(screenAngle(upright, 1)).toBe(1);
    expect(rotated.rotated).toBe(true);
    expect(screenAngle(rotated, 0)).toBeCloseTo(Math.PI / 2);
  });

  describe("TurretAim", () => {
    const tower = { id: 7, x: 2, y: 2, def: TEST_TOWER } as unknown as Readonly<TowerState>;
    const setup = () => {
      let now = 1000;
      const bus = new EventBus<GameEvents>();
      const aim = new TurretAim(() => now);
      const detach = aim.attach(bus);
      return { bus, aim, detach, advance: (ms: number) => (now += ms), time: () => now };
    };
    const shot = (aimX: number, aimY: number): Readonly<ProjectileState> =>
      ({ towerId: 7, x: 2.5, y: 2.5, aimX, aimY }) as Readonly<ProjectileState>;

    it("defaults to facing the exit with no recoil", () => {
      const { aim, time } = setup();
      expect(aim.angle(7, time())).toBe(0);
      expect(aim.recoil(7, time())).toBe(0);
    });

    it("swings onto a projectile's target and kicks back", () => {
      const { bus, aim, advance, time } = setup();
      bus.emit("projectileFired", { projectile: shot(2.5, 5) });

      expect(aim.angle(7, time())).toBeCloseTo(0);
      expect(aim.recoil(7, time())).toBe(1);
      advance(TURN_MS / 2);
      expect(aim.angle(7, time())).toBeCloseTo(Math.PI / 4);
      advance(TURN_MS);
      expect(aim.angle(7, time())).toBeCloseTo(Math.PI / 2);
      advance(RECOIL_MS);
      expect(aim.recoil(7, time())).toBe(0);
      expect(aim.recoil(7, time() - RECOIL_MS * 10)).toBe(0);
    });

    it("aims beams at their target and keeps the heading on a pulse", () => {
      const { bus, aim, advance, time } = setup();
      const target = { x: 0.5, y: 2.5 } as Readonly<EnemyState>;
      bus.emit("beamFired", { tower, target });
      advance(TURN_MS);
      expect(Math.abs(aim.angle(7, time()))).toBeCloseTo(Math.PI);

      bus.emit("pulseFired", { tower, radius: 2 });
      advance(TURN_MS);
      expect(Math.abs(aim.angle(7, time()))).toBeCloseTo(Math.PI);
      expect(aim.recoil(7, time())).toBeGreaterThan(0);
    });

    it("forgets sold towers, stops listening when detached and can be cleared", () => {
      const { bus, aim, detach, advance, time } = setup();
      bus.emit("projectileFired", { projectile: shot(2.5, 5) });
      advance(TURN_MS);
      bus.emit("towerSold", { tower, refund: 5 });
      expect(aim.angle(7, time())).toBe(0);

      bus.emit("pulseFired", { tower, radius: 2 });
      aim.clear();
      expect(aim.recoil(7, time())).toBe(0);

      detach();
      bus.emit("projectileFired", { projectile: shot(2.5, 5) });
      expect(aim.recoil(7, time())).toBe(0);
    });
  });
});

describe("player-facing descriptions", () => {
  const withAttack = (attack: AttackSpec, cooldown = 1, range = 2): TowerDef => ({
    ...TEST_TOWER,
    levels: [{ cost: 10, range, cooldown, attack }],
  });

  it("describes every attack kind and level", () => {
    expect(describeAttack({ kind: "projectile", damage: 9, speed: 1, splashRadius: 0 })).toBe(
      "9 dmg",
    );
    expect(describeAttack({ kind: "projectile", damage: 20, speed: 1, splashRadius: 1 })).toBe(
      "20 splash",
    );
    expect(describeAttack({ kind: "beam", damage: 55 })).toBe("55 beam");
    expect(describeAttack({ kind: "pulse", damage: 4, slow: { factor: 0.55, duration: 1 } })).toBe(
      "4 dmg, slow 45%",
    );
    expect(describeLevel(TOWERS[0]!.levels[0])).toBe("9 dmg · range 2.6 · 1.8/s");
  });

  it("gives each tower a role from its data", () => {
    expect(TOWERS.map(towerRole)).toEqual([
      "Rapid fire",
      "Area damage",
      "Slows nearby",
      "Long range, pierces armor",
    ]);
    expect(
      towerRole(withAttack({ kind: "projectile", damage: 1, speed: 1, splashRadius: 0 })),
    ).toBe("Single target");
    expect(towerRole(withAttack({ kind: "beam", damage: 1 }))).toBe("Pierces armor");
  });

  it("profiles enemies relative to the roster", () => {
    const profile = (id: string) =>
      enemyProfile(
        ENEMIES.find((e) => e.id === id)!,
        ENEMIES,
      );
    expect(profile("runner").traits).toEqual(["Fast", "−1 life"]);
    expect(profile("grunt").traits).toEqual(["Basic", "−1 life"]);
    expect(profile("brute").traits).toEqual(["Slow", "Armored", "−3 lives"]);
    expect(profile("warden")).toEqual({
      traits: ["Boss", "Slow", "Armored", "−20 lives"],
      boss: true,
    });
    expect(enemyProfile(ENEMIES[0]!, []).boss).toBe(false);
  });

  it("merges a wave's groups by enemy in order of arrival", () => {
    expect(
      waveRoster({
        hpMultiplier: 1,
        clearBonus: 0,
        groups: [
          { enemy: "brute", count: 2, interval: 1, delay: 8 },
          { enemy: "grunt", count: 14, interval: 1, delay: 0 },
          { enemy: "brute", count: 1, interval: 1, delay: 20 },
        ],
      }),
    ).toEqual([
      { enemy: "grunt", count: 14 },
      { enemy: "brute", count: 3 },
    ]);
  });
});
