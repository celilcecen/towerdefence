import { beforeAll, describe, expect, it } from "vitest";
import { CAMPAIGN } from "../src/content";
import { campaignLevels, levelContent } from "../src/core/campaign";
import { ContentRegistry } from "../src/core/content-registry";
import type { Bot, GameOutcome } from "./support/bots";
import { idleBot, playGame } from "./support/bots";
import { GreedyBot } from "./support/greedy-bot";

/**
 * Campaign guardrails. Map-agnostic bots play every level on several seeds.
 * "maze" stands in for a competent player who never uses powers or calls
 * waves early; "hug" has the same towers and upgrade policy but never
 * lengthens the route. Doing nothing must lose, the maze bot must usually win
 * while feeling more pressure chapter by chapter, and firepower without a
 * maze must do worse. `npm run balance` plays six seeds and prints the table.
 */
const FULL = process.env["npm_lifecycle_event"] === "balance";
const SEEDS = FULL ? [11, 23, 37, 41, 59, 67] : [11, 37];

const strategies: Record<string, () => Bot> = {
  idle: idleBot,
  hug: () => new GreedyBot("hug", "hug"),
  maze: () => new GreedyBot("maze", "maze"),
};

interface ChapterTarget {
  /** Share of seeds the maze bot must win on every level of the chapter. */
  readonly winRate: number;
  /** Band the maze bot's average lives left, across the chapter, should sit in. */
  readonly lives: readonly [number, number];
}

const TARGETS: Readonly<Record<string, ChapterTarget>> = {
  greenreach: { winRate: 5 / 6, lives: [14, 20] },
  frostmarch: { winRate: 5 / 6, lives: [9, 18] },
  ashlands: { winRate: 4 / 6, lives: [6, 16] },
  rift: { winRate: 4 / 6, lives: [3, 14] },
};
/** A single level may sit this far outside its chapter's band. */
const LEVEL_SLACK = 3;
/** How much better the maze must score than hugging the route (wins x 100 + mean lives). */
const MAZE_MARGIN = 2;
/** On the tutorial, hugging may do as well; the maze may not be worse by more than this. */
const TUTORIAL_TOLERANCE = 3;
/** A chapter may be this much easier than the one before it. */
const TREND_TOLERANCE = 1.5;

interface LevelResult {
  readonly id: string;
  readonly chapter: string;
  readonly index: number;
  readonly waves: number;
  readonly startingLives: number;
  readonly outcomes: ReadonlyMap<string, readonly GameOutcome[]>;
}

const results: LevelResult[] = [];
const mean = (values: readonly number[]): number =>
  values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
const games = (level: LevelResult, bot: string): readonly GameOutcome[] =>
  level.outcomes.get(bot) ?? [];
const wins = (level: LevelResult, bot: string): number =>
  games(level, bot).filter((g) => g.won).length;
const lives = (level: LevelResult, bot: string): number =>
  mean(games(level, bot).map((g) => g.lives));
const score = (level: LevelResult, bot: string): number =>
  wins(level, bot) * 100 + lives(level, bot);
const target = (level: LevelResult): ChapterTarget => {
  const found = TARGETS[level.chapter];
  if (!found) throw new Error(`No balance target for chapter "${level.chapter}".`);
  return found;
};
const chapters = (): string[] => [...new Set(results.map((r) => r.chapter))];
const chapterLives = (chapter: string): number =>
  mean(results.filter((r) => r.chapter === chapter).map((r) => lives(r, "maze")));

describe("campaign balance", () => {
  beforeAll(() => {
    for (const { chapter, level, index } of campaignLevels(CAMPAIGN)) {
      const content = new ContentRegistry(levelContent(CAMPAIGN, level));
      const outcomes = new Map<string, GameOutcome[]>();
      for (const [name, makeBot] of Object.entries(strategies)) {
        outcomes.set(
          name,
          SEEDS.map((seed) => playGame(content, seed, makeBot())),
        );
      }
      results.push({
        id: level.id,
        chapter: chapter.id,
        index,
        waves: level.waves.length,
        startingLives: level.startingLives,
        outcomes,
      });
    }
    if (FULL) {
      // Written straight to stdout: Vitest swallows console output from passing suites.
      const lines = results.map((level) => {
        const cells = [...level.outcomes].map(([name, played]) => {
          const wave = mean(played.map((g) => g.wave)).toFixed(1);
          return `${name} ${wins(level, name)}/${played.length} w${wave} ♥${lives(level, name).toFixed(1)}`;
        });
        const losses = games(level, "maze")
          .filter((g) => !g.won)
          .map((g) => g.wave);
        const lost = losses.length > 0 ? `maze lost at wave ${losses.join(",")}` : "";
        return `${level.id.padEnd(12)} ${cells.map((c) => c.padEnd(22)).join("")}${lost}`;
      });
      const trend = chapters()
        .map((c) => `${c} ♥${chapterLives(c).toFixed(1)}`)
        .join("  ");
      process.stdout.write(
        `\nCampaign balance (${SEEDS.length} seeds, ${results[0]?.waves ?? 0}+ waves per level)\n` +
          `${lines.join("\n")}\nmaze lives by chapter: ${trend}\n\n`,
      );
    }
  }, 600_000);

  it("punishes doing nothing on every level", () => {
    for (const level of results) expect.soft(wins(level, "idle"), level.id).toBe(0);
  });

  it("lets the maze bot win most seeds, with a lower bar in the later chapters", () => {
    for (const level of results) {
      expect
        .soft(wins(level, "maze") / SEEDS.length, level.id)
        .toBeGreaterThanOrEqual(target(level).winRate);
    }
  });

  it("keeps each chapter's pressure inside its band", () => {
    for (const chapter of chapters()) {
      const [low, high] = TARGETS[chapter]?.lives ?? [0, 0];
      const average = chapterLives(chapter);
      expect.soft(average, chapter).toBeGreaterThanOrEqual(low);
      expect.soft(average, chapter).toBeLessThanOrEqual(high);
    }
    for (const level of results) {
      const [low, high] = target(level).lives;
      expect.soft(lives(level, "maze"), level.id).toBeGreaterThanOrEqual(low - LEVEL_SLACK);
      expect.soft(lives(level, "maze"), level.id).toBeLessThanOrEqual(high + LEVEL_SLACK);
    }
  });

  it("gets harder across the campaign and makes the finale cost lives", () => {
    const perChapter = chapters().map(chapterLives);
    perChapter.slice(1).forEach((average, i) => {
      expect.soft(average, chapters()[i + 1]).toBeLessThanOrEqual(perChapter[i]! + TREND_TOLERANCE);
    });
    expect.soft(perChapter.at(-1)!).toBeLessThan(perChapter[0]!);
    const finale = results.at(-1)!;
    expect.soft(lives(finale, "maze"), finale.id).toBeLessThan(finale.startingLives);
  });

  it("rewards mazing over lining the route", () => {
    for (const level of results) {
      if (level.index === 0) {
        expect
          .soft(score(level, "maze"), level.id)
          .toBeGreaterThanOrEqual(score(level, "hug") - TUTORIAL_TOLERANCE);
      } else {
        expect
          .soft(score(level, "maze"), level.id)
          .toBeGreaterThanOrEqual(score(level, "hug") + MAZE_MARGIN);
      }
    }
  });

  it("never walls the maze bot in the first third of a level", () => {
    for (const level of results) {
      for (const game of games(level, "maze")) {
        if (!game.won) expect.soft(game.wave, level.id).toBeGreaterThan(level.waves / 3);
      }
    }
  });
});
