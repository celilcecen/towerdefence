import type { ContentRegistry } from "./content-registry";
import type { EventBus } from "./events";
import type { FlowField } from "./flow-field";
import type { GameEvents } from "./game-events";
import type { Grid } from "./grid";
import type { WorldState } from "./state";

/** Mutable simulation state shared by command handlers. Never exposed to adapters. */
export interface SimulationInternals {
  readonly world: WorldState;
  readonly grid: Grid;
  readonly content: ContentRegistry;
  readonly events: EventBus<GameEvents>;
  flow: FlowField;
}
