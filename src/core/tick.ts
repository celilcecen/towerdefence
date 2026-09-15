import type { ContentRegistry } from "./content-registry";
import type { EventBus } from "./events";
import type { FlowField } from "./flow-field";
import type { GameEvents } from "./game-events";
import type { Grid } from "./grid";
import type { Rng } from "./rng";
import type { WorldState } from "./state";

/** Simulation frequency. Rendering is decoupled and interpolates between ticks. */
export const TICK_RATE = 30;
export const TICK_SECONDS = 1 / TICK_RATE;

export interface TickContext {
  readonly world: WorldState;
  readonly grid: Grid;
  readonly flow: FlowField;
  readonly content: ContentRegistry;
  readonly rng: Rng;
  readonly events: EventBus<GameEvents>;
  readonly dt: number;
}

/** One responsibility per system; the simulation runs them in a fixed order. */
export interface System {
  readonly name: string;
  update(ctx: TickContext): void;
}
