import { beforeAll, describe, expect, it } from "vitest";
import { GAME_CONTENT } from "../src/content";
import { ContentRegistry } from "../src/core/content-registry";
import type { Bot, GameOutcome } from "./support/bots";
import { idleBot, MAZE_PLAN, PlanBot, playGame, WALL_PLAN } from "./support/bots";

/**
 * Balance guardrails. Headless bots play the real campaign on several seeds;
 * if a content change makes the game unwinnable, trivially easy, or makes
 * maze-building pointless, CI fails. `npm run balance` prints the table.
 */
const SEEDS = [11, 23, 37, 41, 59, 67, 73, 89];
const content = new ContentRegistry(GAME_CONTENT);

const strategies: Record<string, () => Bot> = {
  idle: idleBot,
  wall: () => new PlanBot("wall", WALL_PLAN),
  maze: () => new PlanBot("maze", MAZE_PLAN),
};

const outcomes = new Map<string, GameOutcome[]>();
const results = (name: string): GameOutcome[] => outcomes.get(name) ?? [];
const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

describe("balance guardrails", () => {
  beforeAll(() => {
    for (const [name, makeBot] of Object.entries(strategies)) {
      outcomes.set(
        name,
        SEEDS.map((seed) => playGame(content, seed, makeBot())),
      );
    }
    if (process.env["npm_lifecycle_event"] === "balance") {
      // Written straight to stdout: Vitest swallows console output from passing suites.
      const lines = [...outcomes].map(([name, games]) => {
        const wins = games.filter((g) => g.won).length;
        const wave = mean(games.map((g) => g.wave)).toFixed(1);
        const lives = mean(games.map((g) => g.lives)).toFixed(1);
        return `${name.padEnd(6)} wins ${wins}/${games.length}   avg wave ${wave.padStart(4)}   avg lives left ${lives.padStart(4)}`;
      });
      process.stdout.write(`\nBalance report (${SEEDS.length} seeds)\n${lines.join("\n")}\n\n`);
    }
  }, 120_000);

  it("punishes doing nothing within the first two waves", () => {
    expect(results("idle").every((g) => !g.won && g.wave <= 2)).toBe(true);
  });

  it("does not let raw firepower without a maze win the campaign", () => {
    expect(results("wall").some((g) => g.won)).toBe(false);
  });

  it("is winnable with a planned maze on most seeds", () => {
    const wins = results("maze").filter((g) => g.won).length;
    expect(wins / SEEDS.length).toBeGreaterThanOrEqual(0.75);
  });

  it("still pressures the reference maze in the late game", () => {
    const livesLeft = mean(results("maze").map((g) => g.lives));
    expect(livesLeft).toBeLessThan(GAME_CONTENT.rules.startingLives);
  });

  it("rewards mazing over the same towers in a line", () => {
    expect(mean(results("maze").map((g) => g.wave))).toBeGreaterThan(
      mean(results("wall").map((g) => g.wave)),
    );
  });
});
