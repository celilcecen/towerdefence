import type { Command, CommandResult } from "./commands";
import { COMMAND_HANDLERS } from "./commands";
import type { ContentRegistry } from "./content-registry";
import { EventBus } from "./events";
import { FlowField } from "./flow-field";
import type { GameEvents } from "./game-events";
import { Grid } from "./grid";
import { createHero, heroHome } from "./hero";
import type { SimulationInternals } from "./internals";
import type { PlacementCheck } from "./placement";
import { checkPlacement } from "./placement";
import { Rng } from "./rng";
import { hashWorld } from "./state-hash";
import type { WorldState, WorldView } from "./state";
import { EnemyAbilitySystem, PowerCooldownSystem } from "./systems/abilities";
import { HeroSystem } from "./systems/hero";
import { EnemyMovementSystem } from "./systems/movement";
import { ProjectileSystem } from "./systems/projectiles";
import { ResolutionSystem } from "./systems/resolution";
import { TowerSystem } from "./systems/towers";
import { WaveSpawnSystem } from "./systems/wave-spawn";
import type { System } from "./tick";
import { TICK_SECONDS } from "./tick";

export interface SimulationOptions {
  readonly seed: number;
  /** Injected for tests and experiments; defaults to the standard pipeline. */
  readonly systems?: readonly System[];
}

/** Order matters: spawn, move, use abilities, hero, shoot, fly, recharge, then settle the outcome. */
export function createDefaultSystems(): System[] {
  return [
    new WaveSpawnSystem(),
    new EnemyMovementSystem(),
    new EnemyAbilitySystem(),
    new HeroSystem(),
    new TowerSystem(),
    new ProjectileSystem(),
    new PowerCooldownSystem(),
    new ResolutionSystem(),
  ];
}

/**
 * The public face of the game rules. Adapters interact with it through three
 * verbs only: apply a command, advance one tick, and read the world.
 */
export class Simulation {
  readonly events = new EventBus<GameEvents>();
  readonly grid: Grid;
  readonly seed: number;
  private readonly internals: SimulationInternals;
  private readonly rng: Rng;
  private readonly systems: readonly System[];

  constructor(
    readonly content: ContentRegistry,
    options: SimulationOptions,
  ) {
    this.seed = options.seed;
    this.rng = new Rng(options.seed);
    this.systems = options.systems ?? createDefaultSystems();
    this.grid = Grid.parse(content.map.rows);

    const world: WorldState = {
      tick: 0,
      gold: content.rules.startingGold,
      lives: content.rules.startingLives,
      phase: "building",
      wavesStarted: 0,
      wavesCleared: 0,
      enemies: [],
      towers: [],
      projectiles: [],
      spawnQueue: [],
      powers: content.powers.map((power) => ({ id: power.id, cooldown: 0 })),
      hero: content.hero ? createHero(content.hero, heroHome(this.grid)) : undefined,
      nextId: 1,
    };

    this.internals = {
      world,
      grid: this.grid,
      content,
      events: this.events,
      flow: FlowField.compute(this.grid),
    };
  }

  get world(): WorldView {
    return this.internals.world;
  }

  get flow(): FlowField {
    return this.internals.flow;
  }

  get isOver(): boolean {
    const { phase } = this.internals.world;
    return phase === "won" || phase === "lost";
  }

  /** True when the next wave may be started now, including an early call mid-wave. */
  get canStartWave(): boolean {
    const { world } = this.internals;
    if (this.isOver || world.wavesStarted >= this.content.waves.length) return false;
    return world.phase === "building" || world.spawnQueue.length === 0;
  }

  apply(command: Command): CommandResult {
    // Correlated union: the handler map type guarantees each handler receives its own command.
    const handler = COMMAND_HANDLERS[command.type] as (
      sim: SimulationInternals,
      command: Command,
    ) => CommandResult;
    return handler(this.internals, command);
  }

  checkPlacement(x: number, y: number): PlacementCheck {
    return checkPlacement(this.internals, x, y);
  }

  /** Advances the game by exactly one fixed tick. A finished game no longer changes. */
  step(): void {
    if (this.isOver) return;
    const { world, grid, content, events, flow } = this.internals;
    const ctx = { world, grid, content, events, flow, rng: this.rng, dt: TICK_SECONDS };
    for (const system of this.systems) system.update(ctx);
    world.tick += 1;
  }

  hash(): number {
    return hashWorld(this.internals.world);
  }
}
