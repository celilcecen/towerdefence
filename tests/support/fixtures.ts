import { ContentRegistry } from "../../src/core/content-registry";
import type { EnemyDef, GameContent, TowerDef, WaveDef } from "../../src/core/content-types";
import { EventBus } from "../../src/core/events";
import { FlowField } from "../../src/core/flow-field";
import type { GameEvents } from "../../src/core/game-events";
import { Grid } from "../../src/core/grid";
import { Rng } from "../../src/core/rng";
import { Simulation } from "../../src/core/simulation";
import type { EnemyState, WorldState } from "../../src/core/state";
import type { TickContext } from "../../src/core/tick";
import { TICK_SECONDS } from "../../src/core/tick";

export const TEST_TOWER: TowerDef = {
  id: "gun",
  name: "Gun",
  summary: "Test tower.",
  hotkey: "1",
  defaultTargeting: "first",
  levels: [
    {
      cost: 10,
      range: 2,
      cooldown: 1,
      attack: { kind: "projectile", damage: 10, speed: 100, splashRadius: 0 },
    },
    {
      cost: 20,
      range: 2,
      cooldown: 1,
      attack: { kind: "projectile", damage: 20, speed: 100, splashRadius: 0 },
    },
  ],
};

export const TEST_ENEMY: EnemyDef = {
  id: "dummy",
  name: "Dummy",
  hp: 30,
  speed: 1,
  armor: 0,
  bounty: 5,
  leakDamage: 2,
  radius: 0.3,
};

export const singleWave = (overrides: Partial<WaveDef> = {}): WaveDef => ({
  groups: [{ enemy: TEST_ENEMY.id, count: 1, interval: 0, delay: 0 }],
  hpMultiplier: 1,
  clearBonus: 10,
  ...overrides,
});

export function makeContent(overrides: Partial<GameContent> = {}): GameContent {
  return {
    towers: [TEST_TOWER],
    enemies: [TEST_ENEMY],
    waves: [singleWave()],
    powers: [],
    map: { id: "test", name: "Test", rows: ["S....E"] },
    rules: {
      startingGold: 100,
      startingLives: 10,
      sellRefundRatio: 0.5,
      minDamageRatio: 0.2,
      earlyCallRatio: 0.5,
    },
    ...overrides,
  };
}

export function makeSimulation(overrides: Partial<GameContent> = {}, seed = 1): Simulation {
  return new Simulation(new ContentRegistry(makeContent(overrides)), { seed });
}

/** Tests may arrange state directly; production code only gets the read-only view. */
export function mutableWorld(simulation: Simulation): WorldState {
  return simulation.world as WorldState;
}

export function runUntil(simulation: Simulation, done: () => boolean, maxTicks = 20_000): number {
  let ticks = 0;
  while (!done()) {
    if (ticks >= maxTicks) throw new Error(`Condition not met within ${maxTicks} ticks.`);
    simulation.step();
    ticks++;
  }
  return ticks;
}

export function makeEnemy(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 1,
    def: TEST_ENEMY,
    maxHp: TEST_ENEMY.hp,
    hp: TEST_ENEMY.hp,
    x: 0.5,
    y: 0.5,
    prevX: 0.5,
    prevY: 0.5,
    waypoint: { x: 0, y: 0 },
    remaining: 5,
    slowFactor: 1,
    slowTimer: 0,
    abilityTimer: 0,
    status: "alive",
    ...overrides,
  };
}

export function makeTickContext(overrides: Partial<GameContent> = {}): TickContext {
  const content = new ContentRegistry(makeContent(overrides));
  const grid = Grid.parse(content.map.rows);
  const world: WorldState = {
    tick: 0,
    gold: 0,
    lives: 10,
    phase: "wave",
    wavesStarted: 1,
    wavesCleared: 0,
    enemies: [],
    towers: [],
    projectiles: [],
    spawnQueue: [],
    powers: [],
    nextId: 100,
  };
  return {
    world,
    grid,
    content,
    flow: FlowField.compute(grid),
    rng: new Rng(1),
    events: new EventBus<GameEvents>(),
    dt: TICK_SECONDS,
  };
}

export function recordEvents<K extends keyof GameEvents>(
  bus: EventBus<GameEvents>,
  type: K,
): GameEvents[K][] {
  const seen: GameEvents[K][] = [];
  bus.on(type, (payload) => seen.push(payload));
  return seen;
}
