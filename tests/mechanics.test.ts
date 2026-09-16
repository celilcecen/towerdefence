import { describe, expect, it } from "vitest";
import { fireAttack } from "../src/core/combat/attacks";
import type { EnemyDef, PowerDef, TowerDef, TowerLevel } from "../src/core/content-types";
import type { TowerState } from "../src/core/state";
import { EnemyAbilitySystem } from "../src/core/systems/abilities";
import { ProjectileSystem } from "../src/core/systems/projectiles";
import { ResolutionSystem } from "../src/core/systems/resolution";
import { TowerSystem } from "../src/core/systems/towers";
import { TICK_RATE } from "../src/core/tick";
import { validateContent } from "../src/core/validate-content";
import {
  makeContent,
  makeEnemy,
  makeSimulation,
  makeTickContext,
  mutableWorld,
  recordEvents,
  runUntil,
  singleWave,
  TEST_ENEMY,
  TEST_TOWER,
} from "./support/fixtures";

const WISP: EnemyDef = { ...TEST_ENEMY, id: "wisp", flying: true };

const tower = (def: TowerDef, x = 0, y = 0): TowerState => ({
  id: 50,
  def,
  x,
  y,
  level: 0,
  cooldown: 0,
  targeting: "first",
  invested: 10,
});

describe("flying enemies", () => {
  it("fly straight to the nearest exit, ignoring the maze", () => {
    const sim = makeSimulation({
      enemies: [TEST_ENEMY, WISP],
      map: { id: "m", name: "m", rows: ["S#...", ".#.#.", "...#E"] },
      waves: [singleWave({ groups: [{ enemy: "wisp", count: 1, interval: 0, delay: 0 }] })],
    });
    const leaks = recordEvents(sim.events, "enemyLeaked");
    sim.apply({ type: "startWave" });
    sim.step();
    const [wisp] = sim.world.enemies;
    expect(wisp?.waypoint).toEqual({ x: 4, y: 2 });

    const ticks = runUntil(sim, () => {
      const enemy = sim.world.enemies[0];
      if (enemy) expect(enemy.y - 0.5).toBeCloseTo((enemy.x - 0.5) / 2, 6);
      return leaks.length > 0;
    });
    expect(ticks + 1).toBe(Math.ceil(Math.hypot(4, 2) * TICK_RATE));
    expect(sim.world.lives).toBe(10 - WISP.leakDamage);
  });

  it("neither block a cell from building nor get trapped by it", () => {
    const sim = makeSimulation({
      enemies: [TEST_ENEMY, WISP],
      map: { id: "m", name: "m", rows: ["S....E", "......"] },
    });
    mutableWorld(sim).enemies.push(
      makeEnemy({ def: WISP, x: 2.5, y: 0.5, waypoint: { x: 5, y: 0 } }),
    );
    expect(sim.apply({ type: "placeTower", tower: "gun", x: 2, y: 0 })).toEqual({ ok: true });
  });

  it("are invisible to ground-only towers and their splash", () => {
    const mortar: TowerDef = {
      ...TEST_TOWER,
      id: "mortar",
      groundOnly: true,
      levels: [
        {
          cost: 10,
          range: 5,
          cooldown: 1,
          attack: { kind: "projectile", damage: 10, speed: 100, splashRadius: 2 },
        },
      ],
    };
    const ctx = makeTickContext({ towers: [mortar], enemies: [TEST_ENEMY, WISP] });
    const hits = recordEvents(ctx.events, "enemyHit");
    ctx.world.towers.push(tower(mortar));
    ctx.world.enemies.push(makeEnemy({ id: 1, def: WISP, x: 1.5, y: 0.5 }));

    new TowerSystem().update(ctx);
    expect(ctx.world.projectiles).toHaveLength(0);

    ctx.world.enemies.push(makeEnemy({ id: 2, x: 2.5, y: 0.5 }));
    new TowerSystem().update(ctx);
    expect(ctx.world.projectiles[0]?.hitsAir).toBe(false);

    new ProjectileSystem().update(ctx);
    expect(hits.map((h) => h.enemy.id)).toEqual([2]);
  });
});

describe("chain attacks", () => {
  const level = (jumps: number, jumpRange = 1.2): TowerLevel => ({
    cost: 10,
    range: 3,
    cooldown: 1,
    attack: { kind: "chain", damage: 20, jumps, jumpRange, falloff: 0.5 },
  });
  const arc = (groundOnly = false): TowerDef => ({
    ...TEST_TOWER,
    id: "arc",
    ...(groundOnly ? { groundOnly } : {}),
    levels: [level(2)],
  });

  it("jump to the nearest untouched enemy with falling damage, up to the jump limit", () => {
    const ctx = makeTickContext();
    const fired = recordEvents(ctx.events, "chainFired");
    const enemies = [1.5, 2.5, 3.5, 4.5].map((x, i) => makeEnemy({ id: i + 1, x, hp: 100 }));
    ctx.world.enemies.push(...enemies);

    fireAttack(ctx, tower(arc()), level(2), enemies[0]!, [enemies[0]!]);

    expect(fired[0]?.targets.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(enemies.map((e) => e.hp)).toEqual([80, 90, 95, 100]);
  });

  it("prefer the closest enemy and stop at a gap wider than a jump", () => {
    const ctx = makeTickContext();
    const fired = recordEvents(ctx.events, "chainFired");
    const first = makeEnemy({ id: 1, x: 1.5, hp: 100 });
    const near = makeEnemy({ id: 2, x: 1.5, y: 1.3, hp: 100 });
    const far = makeEnemy({ id: 3, x: 4.5, hp: 100 });
    ctx.world.enemies.push(first, far, near);

    fireAttack(ctx, tower(arc()), level(5), first, [first]);
    expect(fired[0]?.targets.map((e) => e.id)).toEqual([1, 2]);
  });

  it("skip flyers when the tower is ground-only", () => {
    const ctx = makeTickContext({ enemies: [TEST_ENEMY, WISP] });
    const fired = recordEvents(ctx.events, "chainFired");
    const first = makeEnemy({ id: 1, x: 1.5 });
    ctx.world.enemies.push(first, makeEnemy({ id: 2, def: WISP, x: 2.5 }));
    fireAttack(ctx, tower(arc(true)), level(2), first, [first]);
    expect(fired[0]?.targets.map((e) => e.id)).toEqual([1]);
  });
});

describe("splitters", () => {
  it("release scaled children at the parent's spot, heading the same way", () => {
    const broodling: EnemyDef = { ...TEST_ENEMY, id: "broodling", hp: 10 };
    const brood: EnemyDef = {
      ...TEST_ENEMY,
      id: "brood",
      hp: 40,
      split: { enemy: "broodling", count: 3 },
    };
    const ctx = makeTickContext({ enemies: [TEST_ENEMY, brood, broodling] });
    const splits = recordEvents(ctx.events, "enemySplit");
    const spawned = recordEvents(ctx.events, "enemySpawned");
    ctx.world.enemies.push(
      makeEnemy({
        def: brood,
        maxHp: 80,
        hp: 0,
        status: "killed",
        x: 2.5,
        y: 0.5,
        waypoint: { x: 3, y: 0 },
      }),
    );

    new ResolutionSystem().update(ctx);

    expect(ctx.world.gold).toBe(brood.bounty);
    expect(splits).toEqual([expect.objectContaining({ count: 3 })]);
    expect(spawned).toHaveLength(3);
    expect(ctx.world.enemies.map((e) => [e.def.id, e.maxHp, e.waypoint.x])).toEqual([
      ["broodling", 20, 3],
      ["broodling", 20, 3],
      ["broodling", 20, 3],
    ]);
    expect(ctx.world.phase).toBe("wave");
  });
});

describe("healers", () => {
  const mender: EnemyDef = {
    ...TEST_ENEMY,
    id: "mender",
    heal: { amount: 5, radius: 1.5, interval: 1 },
  };

  it("heal wounded allies in range on their interval, never themselves", () => {
    const ctx = makeTickContext({ enemies: [TEST_ENEMY, mender] });
    const healed = recordEvents(ctx.events, "enemyHealed");
    const healer = makeEnemy({ id: 1, def: mender, hp: 10, x: 1.5, abilityTimer: 0.01 });
    const near = makeEnemy({ id: 2, hp: 20, x: 2.5 });
    const capped = makeEnemy({ id: 3, hp: 28, x: 1.5, y: 1.5 });
    const far = makeEnemy({ id: 4, hp: 20, x: 4.5 });
    const whole = makeEnemy({ id: 5, x: 2 });
    const dead = makeEnemy({ id: 6, hp: 1, x: 2, status: "killed" });
    ctx.world.enemies.push(healer, near, capped, far, whole, dead);

    const system = new EnemyAbilitySystem();
    system.update(ctx);
    expect(ctx.world.enemies.map((e) => e.hp)).toEqual([10, 25, 30, 20, 30, 1]);
    expect(healed[0]?.targets.map((e) => e.id)).toEqual([2, 3]);

    system.update(ctx);
    expect(healed).toHaveLength(1);
    expect(healer.abilityTimer).toBeGreaterThan(0.9);
  });

  it("start their timer from the full interval when they spawn, and stay quiet with no one hurt", () => {
    const sim = makeSimulation({
      enemies: [TEST_ENEMY, mender],
      waves: [singleWave({ groups: [{ enemy: "mender", count: 1, interval: 0, delay: 0 }] })],
    });
    const healed = recordEvents(sim.events, "enemyHealed");
    sim.apply({ type: "startWave" });
    sim.step();
    expect(sim.world.enemies[0]?.abilityTimer).toBeCloseTo(1 - 1 / TICK_RATE, 6);
    runUntil(sim, () => sim.world.tick > TICK_RATE * 2);
    expect(healed).toHaveLength(0);
  });
});

describe("powers", () => {
  const meteor: PowerDef = {
    id: "meteor",
    name: "Meteor",
    summary: "",
    cooldown: 10,
    spec: { kind: "strike", damage: 15, radius: 1 },
  };
  const chill: PowerDef = {
    id: "chill",
    name: "Chill",
    summary: "",
    cooldown: 5,
    spec: { kind: "freeze", slow: { factor: 0.5, duration: 2 } },
  };
  const create = () =>
    makeSimulation({
      powers: [meteor, chill],
      map: { id: "long", name: "long", rows: ["S" + ".".repeat(12) + "E"] },
      waves: [
        singleWave({ groups: [{ enemy: "dummy", count: 2, interval: 1, delay: 0 }] }),
        singleWave(),
      ],
    });

  it("can only be cast during a wave, when known and ready", () => {
    const sim = create();
    const cast = recordEvents(sim.events, "powerCast");
    expect(sim.apply({ type: "castPower", power: "meteor", x: 0.5, y: 0.5 })).toEqual({
      ok: false,
      error: "no-wave-active",
    });
    expect(sim.apply({ type: "castPower", power: "nope", x: 0, y: 0 })).toEqual({
      ok: false,
      error: "unknown-power",
    });

    sim.apply({ type: "startWave" });
    sim.step();
    expect(sim.apply({ type: "castPower", power: "meteor", x: 0.5, y: 0.5 })).toEqual({ ok: true });
    expect(sim.world.enemies[0]?.hp).toBe(TEST_ENEMY.hp - 15);
    expect(cast[0]).toMatchObject({ targets: 1, x: 0.5, y: 0.5 });
    expect(sim.apply({ type: "castPower", power: "meteor", x: 0.5, y: 0.5 })).toEqual({
      ok: false,
      error: "power-not-ready",
    });
  });

  it("rejects strikes aimed off the board", () => {
    for (const [x, y] of [
      [Number.NaN, 1],
      [-1, 0],
      [0, 99],
    ] as const) {
      const sim = create();
      sim.apply({ type: "startWave" });
      expect(sim.apply({ type: "castPower", power: "meteor", x, y })).toEqual({
        ok: false,
        error: "out-of-bounds",
      });
    }
  });

  it("recharge only while a wave runs", () => {
    const sim = create();
    sim.apply({ type: "startWave" });
    sim.step();
    sim.apply({ type: "castPower", power: "chill", x: 0, y: 0 });
    expect(sim.world.enemies[0]?.slowFactor).toBe(0.5);
    expect(sim.world.powers[1]?.cooldown).toBe(5);

    runUntil(sim, () => sim.world.phase === "building");
    const resting = sim.world.powers[1]?.cooldown ?? 0;
    expect(resting).toBeLessThan(5);
    sim.step();
    expect(sim.world.powers[1]?.cooldown).toBe(resting);
  });

  it("a strike ignores enemies outside its radius and the dead", () => {
    const sim = create();
    sim.apply({ type: "startWave" });
    sim.step();
    mutableWorld(sim).enemies.push(makeEnemy({ id: 90, x: 9.5, y: 0.5 }));
    mutableWorld(sim).enemies.push(makeEnemy({ id: 91, x: 0.5, y: 0.5, status: "killed" }));
    sim.apply({ type: "castPower", power: "meteor", x: 0.5, y: 0.5 });
    sim.apply({ type: "castPower", power: "chill", x: 0, y: 0 });
    expect(sim.world.enemies.map((e) => e.hp)).toEqual([TEST_ENEMY.hp - 15, TEST_ENEMY.hp, 30]);
  });
});

describe("calling waves early", () => {
  const create = () =>
    makeSimulation({
      map: { id: "long", name: "long", rows: ["S" + ".".repeat(20) + "E"] },
      waves: [
        singleWave({ clearBonus: 10 }),
        singleWave({ clearBonus: 20 }),
        singleWave({ clearBonus: 30 }),
      ],
    });

  it("waits until the running wave has released everyone, then pays a bonus up front", () => {
    const sim = create();
    const started = recordEvents(sim.events, "waveStarted");
    const cleared = recordEvents(sim.events, "waveCleared");
    sim.apply({ type: "startWave" });
    expect(sim.canStartWave).toBe(false);
    expect(sim.apply({ type: "startWave" })).toEqual({ ok: false, error: "wave-in-progress" });

    sim.step();
    expect(sim.canStartWave).toBe(true);
    expect(sim.apply({ type: "startWave" })).toEqual({ ok: true });
    expect(sim.world.gold).toBe(100 + 10);
    expect(started.map((e) => [e.wave, e.early, e.bonus])).toEqual([
      [1, false, 0],
      [2, true, 10],
    ]);

    runUntil(sim, () => sim.world.phase === "building");
    expect(cleared).toEqual([
      { wave: 1, bonus: 10 },
      { wave: 2, bonus: 20 },
    ]);
    expect(sim.world.wavesCleared).toBe(2);
  });

  it("refuses once every wave has started, and wins when all are cleared", () => {
    const sim = create();
    for (let i = 0; i < 3; i++) {
      sim.apply({ type: "startWave" });
      sim.step();
    }
    expect(sim.canStartWave).toBe(false);
    expect(sim.apply({ type: "startWave" })).toEqual({ ok: false, error: "no-more-waves" });
    runUntil(sim, () => sim.isOver);
    expect(sim.world.phase).toBe("won");
    expect(sim.canStartWave).toBe(false);
  });

  it("is part of the state fingerprint", () => {
    const sim = create();
    const before = sim.hash();
    mutableWorld(sim).wavesCleared = 1;
    expect(sim.hash()).not.toBe(before);
  });
});

describe("validation of new content", () => {
  it("reports invalid chains, splits, heals, powers and early-call ratios", () => {
    const problems = validateContent(
      makeContent({
        towers: [
          {
            ...TEST_TOWER,
            levels: [
              {
                cost: 1,
                range: 1,
                cooldown: 1,
                attack: { kind: "chain", damage: 1, jumps: 1.5, jumpRange: 0, falloff: 2 },
              },
            ],
          },
        ],
        enemies: [
          {
            ...TEST_ENEMY,
            split: { enemy: "ghost", count: 0 },
            heal: { amount: 0, radius: -1, interval: 0 },
          },
          { ...TEST_ENEMY, id: "a", split: { enemy: "b", count: 1 } },
          { ...TEST_ENEMY, id: "b", split: { enemy: "a", count: 1 } },
          { ...TEST_ENEMY, id: "c", split: { enemy: "a", count: 1 } },
        ],
        powers: [
          {
            id: "p",
            name: "p",
            summary: "",
            cooldown: 0,
            spec: { kind: "strike", damage: 0, radius: 0 },
          },
          {
            id: "p",
            name: "p",
            summary: "",
            cooldown: 1,
            spec: { kind: "freeze", slow: { factor: 0, duration: 0 } },
          },
        ],
        rules: {
          startingGold: 1,
          startingLives: 1,
          sellRefundRatio: 0.5,
          minDamageRatio: 0.2,
          earlyCallRatio: -0.1,
        },
      }),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        'Tower "gun" level 1: jumps must be a non-negative integer.',
        'Tower "gun" level 1: jumpRange must be positive.',
        'Tower "gun" level 1: falloff must be in (0, 1].',
        'Enemy "dummy": splits into unknown enemy "ghost".',
        'Enemy "dummy": split count must be a positive integer.',
        'Enemy "dummy": heal amount must be positive.',
        'Enemy "dummy": heal radius must be positive.',
        'Enemy "dummy": heal interval must be positive.',
        'Enemy "a": split chain loops back to itself.',
        'Enemy "b": split chain loops back to itself.',
        'Duplicate power id "p".',
        'Power "p": cooldown must be positive.',
        'Power "p": damage must be positive.',
        'Power "p": radius must be positive.',
        'Power "p": slow factor must be in (0, 1].',
        'Power "p": slow duration must be positive.',
        "earlyCallRatio must be in [0, 1].",
      ]),
    );
    expect(problems).not.toContain('Enemy "c": split chain loops back to itself.');
  });
});
