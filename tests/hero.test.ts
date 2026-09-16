import { describe, expect, it, vi } from "vitest";
import { GameSession } from "../src/app/session";
import { CAMPAIGN, GAME_CONTENT } from "../src/content";
import { SENTINEL } from "../src/content/heroes";
import { campaignLevels, levelContent, validateCampaign } from "../src/core/campaign";
import { ContentRegistry } from "../src/core/content-registry";
import type { CampaignDef, HeroDef, LevelDef } from "../src/core/content-types";
import { cellOf } from "../src/core/geometry";
import type { Grid } from "../src/core/grid";
import { evictHero, heroBlocked, nearestFreeCell } from "../src/core/hero";
import { runReplay } from "../src/core/replay";
import { HERO_ID } from "../src/core/state";
import { TICK_RATE, TICK_SECONDS } from "../src/core/tick";
import { validateContent } from "../src/core/validate-content";
import {
  makeContent,
  makeEnemy,
  makeSimulation,
  mutableWorld,
  recordEvents,
  runUntil,
  TEST_ENEMY,
  TEST_HERO,
  TEST_TOWER,
} from "./support/fixtures";

/** A two-row board: the hero starts on the crystal at the right end of the top row. */
const ROWS = ["S....E", "......"];
const STILL = { ...TEST_ENEMY, speed: 0.0001 };

const heroSim = (seed = 1) =>
  makeSimulation({ hero: TEST_HERO, map: { id: "h", name: "h", rows: ROWS } }, seed);

const hero = (sim: ReturnType<typeof heroSim>) => {
  const h = mutableWorld(sim).hero;
  if (!h) throw new Error("no hero");
  return h;
};

const steps = (sim: ReturnType<typeof heroSim>, n: number): void => {
  for (let i = 0; i < n; i++) sim.step();
};

describe("hero definition", () => {
  it("starts on the crystal with full health and no charge", () => {
    const sim = heroSim();
    expect(sim.world.hero).toMatchObject({
      x: 5.5,
      y: 0.5,
      hp: 50,
      charge: 0,
      status: "alive",
      moveX: 0,
      moveY: 0,
    });
    expect(makeSimulation().world.hero).toBeUndefined();
  });

  it("is validated field by field", () => {
    const bad: HeroDef = {
      ...TEST_HERO,
      hp: 0,
      speed: -1,
      radius: 0.9,
      attack: { damage: 0, cooldown: 0, range: 0, speed: 0 },
      dash: { distance: 0, duration: 0, cooldown: 0 },
      nova: { damage: 0, radius: 0, slow: { factor: 2, duration: 0 }, charge: 0 },
      contactDamage: -1,
      regen: -1,
      respawn: 0,
    };
    const problems = validateContent(makeContent({ hero: bad }));
    expect(problems).toHaveLength(18);
    expect(problems.every((p) => p.startsWith('Hero "knight"'))).toBe(true);
    expect(validateContent(makeContent({ hero: TEST_HERO }))).toEqual([]);
  });

  it("is picked per level in the campaign and validated across it", () => {
    for (const { level } of campaignLevels(CAMPAIGN)) {
      expect(levelContent(CAMPAIGN, level).hero?.id, level.id).toBe(SENTINEL.id);
    }
    expect(GAME_CONTENT.hero?.id).toBe(SENTINEL.id);
    expect(validateCampaign(CAMPAIGN)).toEqual([]);

    const first = CAMPAIGN.chapters[0]?.levels[0];
    if (!first) throw new Error("campaign has no level");
    const broken: CampaignDef = {
      ...CAMPAIGN,
      heroes: [SENTINEL, SENTINEL],
      chapters: [{ id: "x", theme: "meadow", levels: [{ ...first, hero: "ghost" }] }],
    };
    const problems = validateCampaign(broken);
    expect(problems).toContain('Duplicate hero id "sentinel".');
    expect(problems).toContain(`Level "${first.id}": unknown hero "ghost".`);
    const withoutHero: LevelDef = {
      id: first.id,
      map: first.map,
      waves: first.waves,
      towers: first.towers,
      powers: first.powers,
      startingGold: first.startingGold,
      startingLives: first.startingLives,
    };
    expect(levelContent(CAMPAIGN, withoutHero).hero).toBeUndefined();
  });
});

describe("hero movement", () => {
  it("walks at its speed and normalises oversized input", () => {
    const sim = heroSim();
    expect(sim.apply({ type: "moveHero", dx: -3, dy: -4 })).toEqual({ ok: true });
    expect(hero(sim).moveX).toBeCloseTo(-0.6, 9);
    expect(hero(sim).moveY).toBeCloseTo(-0.8, 9);

    sim.apply({ type: "moveHero", dx: -1, dy: 0 });
    steps(sim, TICK_RATE);
    expect(hero(sim).x).toBeCloseTo(3.5, 5);
    expect(hero(sim).facing).toBeCloseTo(Math.PI, 5);
    expect(hero(sim).prevX).toBeGreaterThan(hero(sim).x);

    expect(sim.apply({ type: "moveHero", dx: Number.NaN, dy: 0 })).toEqual({
      ok: false,
      error: "out-of-bounds",
    });
  });

  it("slides along walls and never leaves the board", () => {
    const sim = heroSim();
    sim.apply({ type: "moveHero", dx: 1, dy: -1 });
    steps(sim, TICK_RATE * 2);
    const h = hero(sim);
    // The body (collision radius 0.24) presses into the top-right corner and stops there.
    expect(h.x).toBeLessThan(6);
    expect(h.x).toBeGreaterThan(5.5);
    expect(h.y).toBeGreaterThanOrEqual(0.24);
    expect(h.y).toBeLessThan(0.5);

    // Towers are walls for the hero too: heading down and left for a second it moves,
    // but never ends up inside the tower at (4, 1).
    sim.apply({ type: "placeTower", tower: TEST_TOWER.id, x: 4, y: 1 });
    sim.apply({ type: "moveHero", dx: -1, dy: 1 });
    steps(sim, TICK_RATE);
    expect(h.x).toBeLessThan(5.5);
    expect(h.y).toBeGreaterThan(0.5);
    expect(cellOf(h)).not.toEqual({ x: 4, y: 1 });
    expect(heroBlocked(sim.grid, TEST_HERO, 4.5, 1.5)).toBe(true);
    expect(heroBlocked(sim.grid, TEST_HERO, 3.5, 1.5)).toBe(false);
  });

  it("is moved to the nearest free cell when a tower lands on it", () => {
    const sim = heroSim();
    const h = hero(sim);
    h.x = 4.5;
    h.y = 0.5;
    expect(sim.apply({ type: "placeTower", tower: TEST_TOWER.id, x: 4, y: 0 })).toEqual({
      ok: true,
    });
    expect(h).toMatchObject({ x: 3.5, y: 0.5, prevX: 3.5, prevY: 0.5 });
    // Not on the cell: nothing happens.
    evictHero(sim.grid, h, { x: 0, y: 0 });
    expect(h.x).toBe(3.5);
    // A fully walled board has nowhere to go.
    const walled = { width: 1, height: 1, isWalkable: () => false } as unknown as Grid;
    expect(nearestFreeCell(walled, TEST_HERO, { x: 0, y: 0 })).toBeUndefined();
  });
});

describe("hero combat", () => {
  it("fires at the nearest enemy in range and its hits charge the nova", () => {
    const sim = heroSim();
    const fired = recordEvents(sim.events, "heroFired");
    const shots = recordEvents(sim.events, "projectileFired");
    const world = mutableWorld(sim);
    const near = makeEnemy({ id: 1, def: STILL, x: 4.5, y: 0.5, prevX: 4.5 });
    const far = makeEnemy({ id: 2, def: STILL, x: 1.5, y: 0.5, prevX: 1.5 });
    world.enemies.push(near, far);

    sim.step();
    expect(fired).toHaveLength(1);
    expect(fired[0]?.target.id).toBe(1);
    expect(shots[0]?.projectile).toMatchObject({ towerId: HERO_ID, hitsAir: true, damage: 10 });
    expect(hero(sim).targetId).toBe(1);
    expect(hero(sim).facing).toBeCloseTo(Math.PI, 5);

    runUntil(sim, () => near.hp < near.maxHp);
    expect(hero(sim).charge).toBeCloseTo(10 / 20, 5);
    expect(far.hp).toBe(far.maxHp);

    // The cooldown holds the next shot back for half a second.
    const before = fired.length;
    steps(sim, Math.floor(TEST_HERO.attack.cooldown * TICK_RATE) - 2);
    expect(fired.length).toBe(before);
    steps(sim, 3);
    expect(fired.length).toBeGreaterThan(before);
  });

  it("ignores enemies out of range and tower hits never charge the nova", () => {
    const sim = heroSim();
    const world = mutableWorld(sim);
    world.enemies.push(makeEnemy({ id: 1, def: STILL, x: 1.5, y: 0.5, prevX: 1.5 }));
    sim.apply({ type: "placeTower", tower: TEST_TOWER.id, x: 2, y: 1 });
    runUntil(sim, () => world.enemies[0]?.hp !== world.enemies[0]?.maxHp);
    expect(hero(sim).charge).toBe(0);
    expect(hero(sim).targetId).toBeUndefined();
  });

  it("is hurt by touching enemies, falls, and returns to the crystal", () => {
    const sim = heroSim();
    const hurt = recordEvents(sim.events, "heroHurt");
    const downed = recordEvents(sim.events, "heroDowned");
    const returned = recordEvents(sim.events, "heroRespawned");
    const world = mutableWorld(sim);
    world.enemies.push(makeEnemy({ id: 1, def: STILL, x: 5.5, y: 0.5, prevX: 5.5, hp: 10_000 }));
    const h = hero(sim);

    sim.step();
    // contactDamage × leakDamage × dt, then no regeneration while touching.
    expect(hurt[0]?.damage).toBeCloseTo(10 * TEST_ENEMY.leakDamage * TICK_SECONDS, 6);
    expect(h.hp).toBeCloseTo(50 - 10 * 2 * TICK_SECONDS, 6);

    h.hp = 0.01;
    sim.step();
    expect(downed).toHaveLength(1);
    expect(h).toMatchObject({ status: "down", hp: 0, respawnTimer: 1, targetId: undefined });
    expect(sim.apply({ type: "heroDash" })).toEqual({ ok: false, error: "hero-down" });
    expect(sim.apply({ type: "heroNova" })).toEqual({ ok: false, error: "hero-down" });

    // Moving while down does nothing, and the hero stops taking damage.
    h.x = 2.5;
    sim.apply({ type: "moveHero", dx: -1, dy: 0 });
    steps(sim, TICK_RATE - 1);
    expect(h.x).toBe(2.5);
    expect(h.status).toBe("down");
    sim.step();
    expect(returned).toHaveLength(1);
    expect(h).toMatchObject({ status: "alive", hp: 50, x: 5.5, y: 0.5 });
  });

  it("regenerates while nothing touches it", () => {
    const sim = heroSim();
    const h = hero(sim);
    h.hp = 10;
    steps(sim, TICK_RATE);
    expect(h.hp).toBeCloseTo(15, 5);
    steps(sim, TICK_RATE * 20);
    expect(h.hp).toBe(50);
  });
});

describe("hero dash", () => {
  it("covers its distance quickly, cannot be hurt meanwhile, then recharges", () => {
    const sim = heroSim();
    const dashed = recordEvents(sim.events, "heroDashed");
    const world = mutableWorld(sim);
    world.enemies.push(makeEnemy({ id: 1, def: STILL, x: 5.5, y: 0.5, prevX: 5.5, hp: 10_000 }));
    const h = hero(sim);
    sim.apply({ type: "moveHero", dx: -1, dy: 0 });
    expect(sim.apply({ type: "heroDash" })).toEqual({ ok: true });
    expect(dashed[0]).toMatchObject({ dx: -1, dy: 0 });
    expect(sim.apply({ type: "heroDash" })).toEqual({ ok: false, error: "dash-not-ready" });

    const ticks = Math.ceil(TEST_HERO.dash.duration / TICK_SECONDS);
    steps(sim, ticks);
    expect(h.x).toBeCloseTo(5.5 - TEST_HERO.dash.distance, 5);
    expect(h.hp).toBe(50);
    expect(h.dashTimer).toBe(0);

    steps(sim, TICK_RATE);
    expect(sim.apply({ type: "heroDash" })).toEqual({ ok: true });
  });

  it("dashes the way it faces when standing still", () => {
    const sim = heroSim();
    const h = hero(sim);
    h.facing = Math.PI;
    sim.apply({ type: "heroDash" });
    expect(h.dashX).toBeCloseTo(-1, 5);
    expect(h.dashY).toBeCloseTo(0, 5);
    steps(sim, 3);
    expect(h.x).toBeCloseTo(4.5, 5);
  });
});

describe("hero nova", () => {
  it("needs a full charge, then damages and slows everything nearby", () => {
    const sim = heroSim();
    const novas = recordEvents(sim.events, "heroNova");
    const world = mutableWorld(sim);
    const inside = makeEnemy({
      id: 1,
      def: STILL,
      x: 4.5,
      y: 0.5,
      prevX: 4.5,
      hp: 100,
      maxHp: 100,
    });
    const outside = makeEnemy({
      id: 2,
      def: STILL,
      x: 1.5,
      y: 0.5,
      prevX: 1.5,
      hp: 100,
      maxHp: 100,
    });
    world.enemies.push(inside, outside);
    expect(sim.apply({ type: "heroNova" })).toEqual({ ok: false, error: "nova-not-charged" });

    hero(sim).charge = 1;
    expect(sim.apply({ type: "heroNova" })).toEqual({ ok: true });
    expect(inside.hp).toBe(60);
    expect(inside.slowFactor).toBe(0.5);
    expect(outside.hp).toBe(100);
    expect(hero(sim).charge).toBe(0);
    expect(novas[0]).toMatchObject({ radius: 1.5, targets: 1 });
  });

  it("refuses every hero command once the game is over", () => {
    const sim = heroSim();
    mutableWorld(sim).phase = "lost";
    expect(sim.apply({ type: "heroDash" })).toEqual({ ok: false, error: "game-over" });
    expect(sim.apply({ type: "heroNova" })).toEqual({ ok: false, error: "game-over" });
  });

  it("does not exist on levels without a hero", () => {
    const sim = makeSimulation();
    expect(sim.apply({ type: "moveHero", dx: 1, dy: 0 })).toEqual({ ok: false, error: "no-hero" });
    expect(sim.apply({ type: "heroDash" })).toEqual({ ok: false, error: "no-hero" });
    expect(sim.apply({ type: "heroNova" })).toEqual({ ok: false, error: "no-hero" });
  });
});

describe("hero determinism", () => {
  it("is part of the state hash and replays exactly", () => {
    const content = new ContentRegistry(
      makeContent({ hero: TEST_HERO, map: { id: "h", name: "h", rows: ROWS } }),
    );
    const idle = runReplay(content, 7, [], 60);
    const log = [
      { tick: 0, command: { type: "moveHero", dx: -1, dy: 0 } as const },
      { tick: 10, command: { type: "heroDash" } as const },
      { tick: 20, command: { type: "moveHero", dx: 0, dy: 1 } as const },
    ];
    const moved = runReplay(content, 7, log, 60);
    const again = runReplay(content, 7, log, 60);
    expect(moved.hash()).not.toBe(idle.hash());
    expect(moved.hash()).toBe(again.hash());
    expect(moved.world.hero?.x).toBeLessThan(5);
  });
});

describe("GameSession hero verbs", () => {
  const create = () => {
    const content = new ContentRegistry(
      makeContent({ hero: TEST_HERO, map: { id: "h", name: "h", rows: ROWS } }),
    );
    const session = new GameSession(content, () => 1);
    const rejected = vi.fn();
    session.events.on("rejected", rejected);
    return { session, rejected };
  };

  it("steers, stops, dashes and fires the nova only while playing", () => {
    const { session, rejected } = create();
    session.moveHero(-1, 0);
    expect(session.hero?.moveX).toBe(0);
    session.start();
    session.moveHero(-1, 0);
    expect(session.hero?.moveX).toBe(-1);
    session.stopHero();
    expect(session.hero?.moveX).toBe(0);

    session.setPaused(true);
    session.moveHero(1, 0);
    session.dash();
    expect(session.hero?.moveX).toBe(0);
    expect(rejected).not.toHaveBeenCalled();
    session.setPaused(false);

    session.dash();
    expect(session.hero?.dashTimer).toBeGreaterThan(0);
    session.nova();
    expect(rejected).toHaveBeenLastCalledWith({ error: "nova-not-charged" });
  });

  it("is silent on levels without a hero", () => {
    const session = new GameSession(new ContentRegistry(makeContent()), () => 1);
    const rejected = vi.fn();
    session.events.on("rejected", rejected);
    session.start();
    session.moveHero(1, 0);
    session.dash();
    session.nova();
    expect(session.hero).toBeUndefined();
    expect(rejected).not.toHaveBeenCalled();
  });
});
