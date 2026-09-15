export interface BestRecord {
  /** Highest wave reached. */
  readonly wave: number;
  readonly won: boolean;
  /** Lives remaining at the end of that run. */
  readonly lives: number;
}

/** Port: where records are kept is an adapter decision (localStorage in the browser). */
export interface RecordStore {
  load(): BestRecord | undefined;
  save(record: BestRecord): void;
}

const MAX_COUNT = 10_000;

const isBoundedInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT;

/**
 * Stored data is untrusted: it can be stale, corrupted or edited by hand.
 * Anything that is not exactly a valid record is rejected, never coerced.
 */
export function parseRecord(value: unknown): BestRecord | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { wave, won, lives } = value as Record<string, unknown>;
  if (!isBoundedInt(wave) || !isBoundedInt(lives) || typeof won !== "boolean") return undefined;
  return { wave, won, lives };
}

/** A win beats any loss; then further is better; then more lives left. */
export function isBetter(candidate: BestRecord, current: BestRecord | undefined): boolean {
  if (!current) return true;
  if (candidate.won !== current.won) return candidate.won;
  if (candidate.wave !== current.wave) return candidate.wave > current.wave;
  return candidate.lives > current.lives;
}
