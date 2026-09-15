import type { Command } from "./commands";
import type { ContentRegistry } from "./content-registry";
import { Simulation } from "./simulation";

export interface ReplayEntry {
  readonly tick: number;
  readonly command: Command;
}

/**
 * Re-runs a game from its seed and command log. Commands scheduled for a tick
 * are applied before that tick is simulated, exactly as live input is.
 */
export function runReplay(
  content: ContentRegistry,
  seed: number,
  log: readonly ReplayEntry[],
  ticks: number,
): Simulation {
  const simulation = new Simulation(content, { seed });
  const ordered = [...log].sort((a, b) => a.tick - b.tick);
  let cursor = 0;

  for (let tick = 0; tick < ticks && !simulation.isOver; tick++) {
    while (cursor < ordered.length && (ordered[cursor]?.tick ?? Infinity) <= tick) {
      const entry = ordered[cursor];
      if (entry) simulation.apply(entry.command);
      cursor++;
    }
    simulation.step();
  }
  return simulation;
}
