/**
 * Background music as data. A score is a short chord loop plus step patterns;
 * notesAt turns one sixteenth-note step into the notes to play. It is pure and
 * deterministic, so the loop repeats seamlessly and can be tested without audio.
 */

export const STEPS_PER_BAR = 16;

export type Instrument = "pad" | "pluck" | "bell" | "bass" | "kick" | "snare" | "hat" | "tom";

/** "base" always sounds; "drive" (percussion and bass) fades in with intensity. */
export type Layer = "base" | "drive";

export type GrooveVoice = "kick" | "snare" | "hat" | "tom" | "bass";

/**
 * One bar per voice, one character per sixteenth: "x" accent, "o" soft, "." rest.
 * Bass also takes "5" (fifth), "8" (octave) and "b" (flat second) above the root.
 */
export type Groove = Readonly<Partial<Record<GrooveVoice, string>>>;

export interface MusicNote {
  readonly instrument: Instrument;
  readonly layer: Layer;
  readonly midi: number;
  /** Length in sixteenth-note steps. */
  readonly steps: number;
  /** 0..1. */
  readonly velocity: number;
}

export interface ThemeScore {
  readonly id: string;
  readonly bpm: number;
  /** One chord per bar, as MIDI notes, lowest first. */
  readonly chords: readonly (readonly number[])[];
  readonly padWave: OscillatorType;
  /** Hz. */
  readonly padCutoff: number;
  readonly padLevel: number;
  readonly lead: "pluck" | "bell";
  /** Semitones added to the chord tone the arpeggio picks. */
  readonly leadOctave: number;
  /** Share of arpeggio notes that actually play; below 1 the melody breathes. */
  readonly leadDensity: number;
  /** One bar: a digit picks that chord tone, "." rests. */
  readonly arp: string;
  readonly bassWave: OscillatorType;
  /** Hz. */
  readonly bassCutoff: number;
  readonly base: Groove;
  readonly drive: Groove;
}

const GROOVE_VOICES: readonly GrooveVoice[] = ["kick", "snare", "hat", "tom", "bass"];

/** Cycles of the chord loop before the melody's variations repeat. */
const VARIATION_CYCLES = 3;

const BASS_INTERVALS: Readonly<Record<string, number>> = { "5": 7, "8": 12, b: 1 };

export const THEMES: readonly [ThemeScore, ...ThemeScore[]] = [
  {
    // Warm and hopeful: major seventh chords, a gentle pluck, a soft backbeat.
    id: "meadow",
    bpm: 96,
    chords: [
      [60, 64, 67, 74],
      [57, 64, 67, 72],
      [53, 60, 64, 69],
      [55, 62, 67, 71],
    ],
    padWave: "triangle",
    padCutoff: 1600,
    padLevel: 0.035,
    lead: "pluck",
    leadOctave: 12,
    leadDensity: 0.85,
    arp: "0.1.2.3.2.1.0.2.",
    bassWave: "triangle",
    bassCutoff: 700,
    base: { bass: "x.......o......." },
    drive: {
      kick: "x.......x.....o.",
      snare: "....x.......x...",
      hat: "..o...o...o...oo",
      bass: "......o.....5...",
    },
  },
  {
    // Sparse and glassy: high sine bells over a thin minor pad, very little rhythm.
    id: "frost",
    bpm: 72,
    chords: [
      [62, 65, 69, 76],
      [58, 65, 69, 74],
      [55, 62, 65, 69],
      [57, 64, 67, 74],
    ],
    padWave: "sine",
    padCutoff: 2600,
    padLevel: 0.03,
    lead: "bell",
    leadOctave: 12,
    leadDensity: 0.6,
    arp: "0...3.....2...1.",
    bassWave: "sine",
    bassCutoff: 500,
    base: { bass: "o..............." },
    drive: {
      kick: "x.........x.....",
      hat: "..o...o...o...x.",
      bass: "........o.....o.",
    },
  },
  {
    // Tense: a dark low pad, a phrygian bass ostinato and toms that never stop.
    id: "ash",
    bpm: 104,
    chords: [
      [52, 55, 59, 64],
      [53, 57, 60, 64],
      [52, 55, 59, 64],
      [50, 54, 57, 62],
    ],
    padWave: "sawtooth",
    padCutoff: 650,
    padLevel: 0.03,
    lead: "pluck",
    leadOctave: 0,
    leadDensity: 0.7,
    arp: "0..0..1.....2...",
    bassWave: "sawtooth",
    bassCutoff: 380,
    base: { tom: "x.....o.....o...", bass: "x..............." },
    drive: {
      kick: "x..x..x...x..x..",
      snare: "....x.......x.o.",
      hat: "..o...o...o...o.",
      bass: "..xb..x...xb..x.",
    },
  },
  {
    // Dark and pulsing: eighth-note bass pulses that double to sixteenths in a wave.
    id: "rift",
    bpm: 112,
    chords: [
      [49, 56, 61, 64],
      [45, 52, 57, 61],
      [42, 49, 54, 57],
      [44, 51, 56, 59],
    ],
    padWave: "sawtooth",
    padCutoff: 900,
    padLevel: 0.028,
    lead: "bell",
    leadOctave: 24,
    leadDensity: 0.5,
    arp: "0.......2...1...",
    bassWave: "sawtooth",
    bassCutoff: 520,
    base: { bass: "o.o.o.o.o.o.o.o." },
    drive: {
      kick: "x...x...x...x...",
      snare: "....o.......o...",
      hat: "..x...x...x...x.",
      bass: ".o.o.o.8.o.o.o.o",
    },
  },
];

export const THEME_IDS: readonly string[] = THEMES.map((theme) => theme.id);

/** The score for a chapter theme id; unknown ids (and the menu) get meadow. */
export function themeScore(id: string | undefined): ThemeScore {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Seconds per sixteenth-note step. */
export function stepSeconds(score: Pick<ThemeScore, "bpm">): number {
  return 60 / score.bpm / 4;
}

/** A stable pseudo-random number in [0, 1) for a position in the loop. */
export function hash01(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x2545f491, 0x9e3779b1);
  h = Math.imul(h ^ b ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ c ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function grooveNotes(
  groove: Groove,
  layer: Layer,
  step: number,
  root: number,
  out: MusicNote[],
): void {
  for (const voice of GROOVE_VOICES) {
    const char = groove[voice]?.[step] ?? ".";
    if (char === ".") continue;
    if (voice === "bass") {
      const interval = BASS_INTERVALS[char];
      out.push({
        instrument: "bass",
        layer,
        midi: root - 12 + (interval ?? 0),
        steps: 2,
        velocity: interval === undefined ? (char === "x" ? 1 : 0.6) : 0.8,
      });
    } else {
      out.push({ instrument: voice, layer, midi: 0, steps: 1, velocity: char === "x" ? 1 : 0.55 });
    }
  }
}

/** Every note that starts on an absolute sixteenth-note step of the loop. */
export function notesAt(score: ThemeScore, step: number): MusicNote[] {
  const bar = Math.floor(step / STEPS_PER_BAR);
  const inBar = step - bar * STEPS_PER_BAR;
  const loopBar = bar % score.chords.length;
  const chord = score.chords[loopBar] ?? [];
  const root = chord[0] ?? 48;
  const notes: MusicNote[] = [];

  if (inBar === 0) {
    for (const midi of chord) {
      notes.push({ instrument: "pad", layer: "base", midi, steps: STEPS_PER_BAR, velocity: 1 });
    }
  }

  const pick = Number.parseInt(score.arp[inBar] ?? ".", 10);
  if (!Number.isNaN(pick)) {
    const cycle = Math.floor(bar / score.chords.length) % VARIATION_CYCLES;
    if (hash01(loopBar, inBar, cycle) < score.leadDensity) {
      const tone = chord[pick % chord.length] ?? root;
      notes.push({
        instrument: score.lead,
        layer: "base",
        midi: tone + score.leadOctave,
        steps: 2,
        velocity: inBar % 4 === 0 ? 1 : 0.7,
      });
    }
  }

  grooveNotes(score.base, "base", inBar, root, notes);
  grooveNotes(score.drive, "drive", inBar, root, notes);
  return notes;
}
