import { campaignLevels } from "./campaign";
import type { CampaignDef } from "./content-types";

export interface LevelProgress {
  /** 1 to 3; a level with no entry has never been won. */
  readonly stars: number;
  /** Most lives ever left at the end of a win. */
  readonly bestLives: number;
}

export interface Progress {
  readonly levels: Readonly<Record<string, LevelProgress>>;
}

export const EMPTY_PROGRESS: Progress = { levels: {} };

/** Share of starting lives to keep for each star. */
const THREE_STARS = 0.9;
const TWO_STARS = 0.5;
const MAX_STARS = 3;
const MAX_LIVES = 10_000;
const ID_PATTERN = /^[a-z0-9-]{1,40}$/;

/** A loss earns nothing; a win earns one star, more for keeping the crystal intact. */
export function starsFor(won: boolean, lives: number, startingLives: number): number {
  if (!won) return 0;
  if (lives >= Math.ceil(startingLives * THREE_STARS)) return 3;
  if (lives >= Math.ceil(startingLives * TWO_STARS)) return 2;
  return 1;
}

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/**
 * Saved progress is untrusted input: stale, corrupted or edited by hand.
 * Valid entries survive; anything malformed is dropped rather than coerced,
 * so one bad entry never costs the player the rest of their campaign.
 */
export function parseProgress(value: unknown): Progress {
  if (typeof value !== "object" || value === null) return EMPTY_PROGRESS;
  const raw = (value as Record<string, unknown>)["levels"];
  if (typeof raw !== "object" || raw === null) return EMPTY_PROGRESS;
  const levels: Record<string, LevelProgress> = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (!ID_PATTERN.test(id) || typeof entry !== "object" || entry === null) continue;
    const { stars, bestLives } = entry as Record<string, unknown>;
    if (isInt(stars, 1, MAX_STARS) && isInt(bestLives, 0, MAX_LIVES)) {
      levels[id] = { stars, bestLives };
    }
  }
  return { levels };
}

export interface RecordedResult {
  readonly progress: Progress;
  readonly stars: number;
  /** True when this run beat the saved stars or lives for the level. */
  readonly improved: boolean;
}

/** Merges one finished game into progress. Never lowers what was already earned. */
export function recordResult(
  progress: Progress,
  levelId: string,
  won: boolean,
  lives: number,
  startingLives: number,
): RecordedResult {
  const stars = starsFor(won, lives, startingLives);
  const previous = progress.levels[levelId];
  if (stars === 0) return { progress, stars, improved: false };
  const improved =
    !previous || stars > previous.stars || (stars === previous.stars && lives > previous.bestLives);
  if (!improved) return { progress, stars, improved };
  const entry: LevelProgress = {
    stars: Math.max(stars, previous?.stars ?? 0),
    bestLives: Math.max(lives, previous?.bestLives ?? 0),
  };
  return { progress: { levels: { ...progress.levels, [levelId]: entry } }, stars, improved };
}

/** The first level is always open; every other level opens once the one before it is won. */
export function isUnlocked(campaign: CampaignDef, progress: Progress, levelId: string): boolean {
  const levels = campaignLevels(campaign);
  const index = levels.findIndex((ref) => ref.level.id === levelId);
  if (index < 0) return false;
  const previous = levels[index - 1];
  return !previous || progress.levels[previous.level.id] !== undefined;
}

/** The level the player should play next: the first unwon, unlocked level, else the last. */
export function nextLevelId(campaign: CampaignDef, progress: Progress): string | undefined {
  const levels = campaignLevels(campaign);
  const open = levels.find((ref) => progress.levels[ref.level.id] === undefined);
  return (open ?? levels.at(-1))?.level.id;
}

export function totalStars(progress: Progress): number {
  return Object.values(progress.levels).reduce((sum, entry) => sum + entry.stars, 0);
}
