import type { ContentRegistry } from "../../src/core/content-registry";
import { Simulation } from "../../src/core/simulation";
import { nextLevel } from "../../src/core/state";

export interface Placement {
  readonly tower: string;
  readonly x: number;
  readonly y: number;
}

export interface Bot {
  readonly name: string;
  act(simulation: Simulation): void;
}

export interface GameOutcome {
  readonly won: boolean;
  readonly wave: number;
  readonly lives: number;
}

/**
 * Plays like a methodical human: builds a fixed plan in order, saving up for
 * each step, then spends surplus gold on the cheapest available upgrade.
 * Bots drive the game through the same command interface as the UI.
 */
export class PlanBot implements Bot {
  private cursor = 0;

  constructor(
    readonly name: string,
    private readonly plan: readonly Placement[],
  ) {}

  act(simulation: Simulation): void {
    const { world, content } = simulation;
    while (this.cursor < this.plan.length) {
      const step = this.plan[this.cursor]!;
      if (world.gold < content.tower(step.tower).levels[0].cost) return;
      const result = simulation.apply({ type: "placeTower", ...step });
      if (!result.ok && result.error === "occupied-by-enemy") return;
      this.cursor++;
    }

    let best: { id: number; cost: number } | undefined;
    for (const tower of world.towers) {
      const upgrade = nextLevel(tower);
      if (upgrade && (!best || upgrade.cost < best.cost))
        best = { id: tower.id, cost: upgrade.cost };
    }
    if (best && world.gold >= best.cost)
      simulation.apply({ type: "upgradeTower", towerId: best.id });
  }
}

export const idleBot = (): Bot => ({ name: "idle", act: () => undefined });

/** Plays a whole game, starting each wave as soon as the board is quiet. */
export function playGame(
  content: ContentRegistry,
  seed: number,
  bot: Bot,
  maxTicks = 300_000,
): GameOutcome {
  const simulation = new Simulation(content, { seed });
  for (let tick = 0; tick < maxTicks && !simulation.isOver; tick++) {
    bot.act(simulation);
    if (simulation.world.phase === "building") simulation.apply({ type: "startWave" });
    simulation.step();
  }
  if (!simulation.isOver) throw new Error(`${bot.name} did not finish within ${maxTicks} ticks.`);
  const { phase, wavesStarted, lives } = simulation.world;
  return { won: phase === "won", wave: wavesStarted, lives };
}

const column = (x: number, rows: readonly number[], towerFor: (y: number) => string): Placement[] =>
  rows.map((y) => ({ tower: towerFor(y), x, y }));

/** Serpentine maze on "The Crossing": four walls with alternating gaps. */
export const MAZE_PLAN: readonly Placement[] = [
  ...column(3, [4, 5, 6, 3, 7, 2, 8, 1, 9, 0], (y) => (y === 5 ? "cannon" : "bolt")),
  ...column(7, [4, 5, 6, 3, 7, 2, 8, 9, 1, 10], (y) =>
    y === 5 ? "spire" : y === 9 ? "frost" : "bolt",
  ),
  ...column(11, [4, 5, 6, 3, 7, 2, 8, 1, 9, 0], (y) =>
    y === 5 ? "cannon" : y === 1 ? "frost" : "bolt",
  ),
  ...column(15, [4, 5, 6, 3, 7, 2, 8, 9, 1, 10], (y) =>
    y === 5 ? "spire" : y === 9 ? "cannon" : "bolt",
  ),
];

/** The same towers, lined up along the straight route instead of shaping it. */
export const WALL_PLAN: readonly Placement[] = [3, 7, 2, 8]
  .flatMap((y) => Array.from({ length: 16 }, (_, i) => ({ x: i + 1, y })))
  .slice(0, MAZE_PLAN.length)
  .map((cell, i) => ({ ...cell, tower: MAZE_PLAN[i]!.tower }));
