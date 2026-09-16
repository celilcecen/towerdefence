import { describe, expect, it } from "vitest";
import { GAME_CONTENT } from "../src/content";
import { ContentRegistry } from "../src/core/content-registry";
import type { ReplayEntry } from "../src/core/replay";
import { runReplay } from "../src/core/replay";
import { Simulation } from "../src/core/simulation";
import { ProjectileSystem } from "../src/core/systems/projectiles";
import { TICK_RATE } from "../src/core/tick";
import {
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

describe("enemy movement and leaks", () => {
  it("walks the path at exactly its speed and costs lives at the exit", () => {
    const sim = makeSimulation();
    const leaks = recordEvents(sim.events, "enemyLeaked");
    sim.apply({ type: "startWave" });

    const ticks = runUntil(sim, () => leaks.length > 0);

    // Five cells at one cell per second, spawned on the first tick.
    expect(ticks).toBe(5 * TICK_RATE + 1);
    expect(sim.world.lives).toBe(10 - TEST_ENEMY.leakDamage);
  });

  it("interpolation anchors trail the current position while moving", () => {
    const sim = makeSimulation();
    sim.apply({ type: "startWave" });
    sim.step();
    sim.step();
    const [enemy] = sim.world.enemies;
    expect(enemy?.prevX).toBeLessThan(enemy?.x ?? 0);
  });

  it("clears the wave with a bonus and wins after the final wave", () => {
    const sim = makeSimulation();
    const cleared = recordEvents(sim.events, "waveCleared");
    const over = recordEvents(sim.events, "gameOver");
    sim.apply({ type: "startWave" });

    runUntil(sim, () => sim.isOver);

    expect(cleared).toEqual([{ wave: 1, bonus: 10 }]);
    expect(over).toEqual([{ won: true }]);
    expect(sim.world.phase).toBe("won");
    expect(sim.world.gold).toBe(110);
  });

  it("returns to building between waves", () => {
    const sim = makeSimulation({ waves: [singleWave(), singleWave()] });
    sim.apply({ type: "startWave" });
    runUntil(sim, () => sim.world.phase === "building");
    expect(sim.world.wavesStarted).toBe(1);
    expect(sim.apply({ type: "startWave" })).toEqual({ ok: true });
  });

  it("loses when lives run out and then stops changing", () => {
    const sim = makeSimulation({
      rules: {
        startingGold: 0,
        startingLives: 1,
        sellRefundRatio: 0.5,
        minDamageRatio: 0.2,
        earlyCallRatio: 0.5,
      },
    });
    const over = recordEvents(sim.events, "gameOver");
    sim.apply({ type: "startWave" });

    runUntil(sim, () => sim.isOver);
    const frozen = sim.hash();
    sim.step();

    expect(sim.world.phase).toBe("lost");
    expect(sim.world.lives).toBe(0);
    expect(over).toEqual([{ won: false }]);
    expect(sim.hash()).toBe(frozen);
  });
});

describe("spawning", () => {
  it("releases a group on its interval after its delay and scales hp", () => {
    const sim = makeSimulation({
      map: { id: "long", name: "long", rows: ["S" + ".".repeat(40) + "E"] },
      waves: [
        singleWave({
          hpMultiplier: 1.5,
          groups: [{ enemy: TEST_ENEMY.id, count: 3, interval: 1, delay: 0.5 }],
        }),
      ],
    });
    const spawnTicks: number[] = [];
    sim.events.on("enemySpawned", () => spawnTicks.push(sim.world.tick));
    sim.apply({ type: "startWave" });

    runUntil(sim, () => spawnTicks.length === 3);

    expect(spawnTicks).toEqual([15, 45, 75]);
    expect(sim.world.enemies.every((e) => e.maxHp === 45 && e.hp === 45)).toBe(true);
  });
});

describe("combat", () => {
  const corridor = { id: "c", name: "c", rows: ["S....E", "......"] };

  it("towers kill enemies for their bounty", () => {
    const sim = makeSimulation({ map: corridor });
    const kills = recordEvents(sim.events, "enemyKilled");
    sim.apply({ type: "placeTower", tower: "gun", x: 2, y: 1 });
    sim.apply({ type: "startWave" });

    runUntil(sim, () => sim.isOver);

    expect(kills).toHaveLength(1);
    expect(sim.world.lives).toBe(10);
    expect(sim.world.gold).toBe(100 - 10 + TEST_ENEMY.bounty + 10);
    expect(sim.world.projectiles).toHaveLength(0);
  });

  it("splash projectiles damage every enemy in the blast", () => {
    const cannon = {
      ...TEST_TOWER,
      id: "cannon",
      hotkey: "2",
      levels: [
        {
          cost: 10,
          range: 3,
          cooldown: 5,
          attack: { kind: "projectile", damage: 5, speed: 50, splashRadius: 2 },
        },
      ],
    } as const;
    const sim = makeSimulation({
      map: corridor,
      towers: [cannon],
      waves: [singleWave({ groups: [{ enemy: TEST_ENEMY.id, count: 2, interval: 0, delay: 0 }] })],
    });
    const hits = recordEvents(sim.events, "enemyHit");
    const explosions = recordEvents(sim.events, "explosion");
    sim.apply({ type: "placeTower", tower: "cannon", x: 2, y: 1 });
    sim.apply({ type: "startWave" });

    runUntil(sim, () => explosions.length === 1);

    expect(hits).toHaveLength(2);
  });

  it("beams hit instantly and pulses damage and slow everything in range", () => {
    const beam = {
      ...TEST_TOWER,
      id: "beam",
      hotkey: "b",
      levels: [{ cost: 10, range: 2, cooldown: 9, attack: { kind: "beam", damage: 7 } }],
    } as const;
    const pulse = {
      ...TEST_TOWER,
      id: "pulse",
      hotkey: "p",
      levels: [
        {
          cost: 10,
          range: 2,
          cooldown: 9,
          attack: { kind: "pulse", damage: 3, slow: { factor: 0.5, duration: 2 } },
        },
      ],
    } as const;
    const sim = makeSimulation({ map: corridor, towers: [beam, pulse] });
    const beams = recordEvents(sim.events, "beamFired");
    const pulses = recordEvents(sim.events, "pulseFired");
    sim.apply({ type: "placeTower", tower: "beam", x: 1, y: 1 });
    sim.apply({ type: "placeTower", tower: "pulse", x: 0, y: 1 });
    sim.apply({ type: "startWave" });
    sim.step();

    const [enemy] = sim.world.enemies;
    expect(beams).toHaveLength(1);
    expect(pulses[0]?.radius).toBe(2);
    expect(enemy?.hp).toBe(TEST_ENEMY.hp - 7 - 3);
    expect(enemy?.slowFactor).toBe(0.5);
  });

  it("a shot still lands where its target died, harmlessly", () => {
    const ctx = makeTickContext();
    const hits = recordEvents(ctx.events, "enemyHit");
    ctx.world.enemies.push(makeEnemy({ id: 7, status: "killed", x: 3.5, y: 0.5 }));
    ctx.world.projectiles.push({
      id: 8,
      towerId: 1,
      targetId: 7,
      damage: 10,
      speed: 30,
      splashRadius: 0,
      hitsAir: true,
      x: 0.5,
      y: 0.5,
      prevX: 0.5,
      prevY: 0.5,
      aimX: 3.5,
      aimY: 0.5,
      done: false,
    });

    const system = new ProjectileSystem();
    for (let i = 0; i < 3; i++) system.update(ctx);

    expect(ctx.world.projectiles).toHaveLength(0);
    expect(hits).toHaveLength(0);
  });

  it("leaves an in-flight shot where it is once the game has ended", () => {
    const slowShot = {
      ...TEST_TOWER,
      levels: [
        {
          cost: 10,
          range: 2,
          cooldown: 1,
          attack: { kind: "projectile", damage: 1, speed: 1, splashRadius: 0 },
        },
      ],
    } as const;
    const sim = makeSimulation({ map: corridor, towers: [slowShot] });
    sim.apply({ type: "placeTower", tower: "gun", x: 2, y: 1 });
    sim.apply({ type: "startWave" });
    runUntil(sim, () => sim.world.projectiles.length > 0);
    mutableWorld(sim).phase = "won";
    const frozen = sim.hash();
    sim.step();
    expect(sim.hash()).toBe(frozen);
  });

  it("runs injected systems instead of the defaults", () => {
    const calls: number[] = [];
    const sim = new Simulation(new ContentRegistry(GAME_CONTENT), {
      seed: 1,
      systems: [{ name: "probe", update: (ctx) => calls.push(ctx.world.tick) }],
    });
    sim.apply({ type: "startWave" });
    sim.step();
    sim.step();
    expect(calls).toEqual([0, 1]);
    expect(sim.world.enemies).toHaveLength(0);
  });
});

describe("determinism", () => {
  const content = new ContentRegistry(GAME_CONTENT);
  const log: ReplayEntry[] = [
    { tick: 0, command: { type: "placeTower", tower: "bolt", x: 3, y: 5 } },
    { tick: 0, command: { type: "placeTower", tower: "bolt", x: 5, y: 3 } },
    { tick: 0, command: { type: "placeTower", tower: "frost", x: 4, y: 4 } },
    { tick: 1, command: { type: "startWave" } },
    { tick: 400, command: { type: "startWave" } },
    { tick: 900, command: { type: "startWave" } },
  ];

  const trace = (seed: number): number[] => {
    const sim = new Simulation(content, { seed });
    const hashes: number[] = [];
    for (let tick = 0; tick < 1500; tick++) {
      for (const entry of log) if (entry.tick === tick) sim.apply(entry.command);
      sim.step();
      hashes.push(sim.hash());
    }
    return hashes;
  };

  it("produces identical state, tick for tick, from the same seed and commands", () => {
    expect(trace(42)).toEqual(trace(42));
  });

  it("diverges when only the seed changes", () => {
    expect(trace(42).at(-1)).not.toBe(trace(7).at(-1));
  });

  it("a replay reproduces the live game exactly", () => {
    const live = new Simulation(content, { seed: 42 });
    for (let tick = 0; tick < 1500; tick++) {
      for (const entry of log) if (entry.tick === tick) live.apply(entry.command);
      live.step();
    }
    // Entries arrive out of tick order; same-tick commands keep their relative order.
    const scrambled = [5, 3, 0, 1, 2, 4].map((i) => log[i]!);
    const replayed = runReplay(content, 42, scrambled, 1500);
    expect(replayed.hash()).toBe(live.hash());
  });
});
