import type { Cue } from "./cues";

/**
 * How loud the room may get. 0 is ambient chatter (hits, shots) and yields
 * first; 3 is a moment the player must hear and ignores the voice budget.
 */
export type CuePriority = 0 | 1 | 2 | 3;

export interface CuePolicy {
  readonly priority: CuePriority;
  /** At most this many plays of the cue inside any window. */
  readonly maxPerWindow: number;
  /** Milliseconds of wall-clock time. */
  readonly windowMs: number;
  /** Roughly how long one play keeps a voice busy, in milliseconds. */
  readonly durationMs: number;
}

export interface LimiterOptions {
  /** Voices sounding at once before low-priority cues are dropped. */
  readonly maxVoices: number;
  readonly policies: Readonly<Record<Cue, CuePolicy>>;
}

/** Share of the voice budget each priority may fill; the rest is headroom for louder moments. */
const BUDGET_SHARE: Readonly<Record<CuePriority, number>> = { 0: 0.6, 1: 0.85, 2: 1, 3: Infinity };

const policy = (
  priority: CuePriority,
  maxPerWindow: number,
  windowMs: number,
  durationMs: number,
): CuePolicy => ({ priority, maxPerWindow, windowMs, durationMs });

export const CUE_POLICIES: Readonly<Record<Cue, CuePolicy>> = {
  "shot-bolt": policy(0, 3, 110, 90),
  "shot-cannon": policy(1, 2, 140, 180),
  "shot-mortar": policy(1, 2, 200, 260),
  "shot-hero": policy(0, 3, 100, 70),
  beam: policy(1, 2, 160, 260),
  frost: policy(1, 2, 180, 380),
  arc: policy(1, 2, 150, 200),
  boom: policy(1, 3, 160, 420),
  hit: policy(0, 2, 90, 50),
  pop: policy(0, 3, 120, 120),
  "boss-arrive": policy(3, 1, 1500, 1400),
  "boss-down": policy(3, 1, 1000, 1300),
  leak: policy(3, 2, 250, 320),
  split: policy(1, 2, 200, 200),
  heal: policy(1, 1, 400, 320),
  build: policy(2, 3, 150, 200),
  upgrade: policy(2, 2, 200, 420),
  sell: policy(2, 2, 200, 260),
  "wave-start": policy(3, 1, 400, 700),
  coins: policy(2, 1, 300, 360),
  "wave-clear": policy(2, 1, 400, 800),
  victory: policy(3, 1, 2000, 2200),
  defeat: policy(3, 1, 2000, 2000),
  meteor: policy(3, 2, 300, 1000),
  freeze: policy(3, 1, 300, 900),
  dash: policy(2, 2, 200, 180),
  nova: policy(3, 1, 400, 900),
  "hero-down": policy(3, 1, 1000, 800),
  "hero-up": policy(2, 1, 1000, 500),
  tap: policy(2, 4, 100, 60),
  denied: policy(2, 1, 180, 220),
  star: policy(2, 3, 120, 600),
};

/**
 * Decides whether a cue may sound right now. 40 bolts firing at triple speed
 * collapse into a few shots a second, frequent cues give way when the mix is
 * busy, and priority-3 cues always get through their own per-cue window.
 */
export class VoiceLimiter {
  private voices: number[] = [];
  private readonly recent = new Map<Cue, number[]>();

  constructor(
    private readonly clock: () => number,
    private readonly options: LimiterOptions = { maxVoices: 16, policies: CUE_POLICIES },
  ) {}

  /** True when the cue should play; the play is then counted against the budgets. */
  admit(cue: Cue): boolean {
    const now = this.clock();
    const { priority, maxPerWindow, windowMs, durationMs } = this.options.policies[cue];

    const plays = (this.recent.get(cue) ?? []).filter((at) => now - at < windowMs);
    this.recent.set(cue, plays);
    if (plays.length >= maxPerWindow) return false;

    this.voices = this.voices.filter((end) => end > now);
    if (this.voices.length >= this.options.maxVoices * BUDGET_SHARE[priority]) return false;

    plays.push(now);
    this.voices.push(now + durationMs);
    return true;
  }

  /** Voices still sounding at the clock's current time. */
  activeVoices(): number {
    const now = this.clock();
    return this.voices.filter((end) => end > now).length;
  }

  reset(): void {
    this.voices = [];
    this.recent.clear();
  }
}
