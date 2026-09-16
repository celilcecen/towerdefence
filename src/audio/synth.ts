import type { Cue } from "./cues";

/**
 * Every sound is synthesized from oscillators, a shared noise buffer, filters
 * and gain envelopes: no audio files, no worklets. Levels are mixed so frequent
 * cues sit quietly under the moments the player must notice.
 */

export interface FilterSpec {
  readonly type: BiquadFilterType;
  /** Hz. */
  readonly freq: number;
  /** Hz the filter sweeps to over the sound's length. */
  readonly to?: number;
  readonly q?: number;
}

interface EnvelopeSpec {
  /** Seconds after the cue starts. */
  readonly delay?: number;
  readonly attack?: number;
  /** Seconds held at peak before the decay. */
  readonly hold?: number;
  readonly decay: number;
  readonly peak: number;
  readonly filter?: FilterSpec;
}

export interface ToneSpec extends EnvelopeSpec {
  readonly type: OscillatorType;
  /** Hz. */
  readonly freq: number;
  /** Hz the pitch glides to. */
  readonly to?: number;
  /** Seconds of glide; defaults to the whole sound. */
  readonly glide?: number;
  /** Cents. */
  readonly detune?: number;
}

export type NoiseSpec = EnvelopeSpec;

export interface MasterChain {
  readonly sfx: GainNode;
  readonly music: GainNode;
  readonly noise: AudioBuffer;
}

const SILENCE = 0.0001;
const NOISE_SECONDS = 1;

/** One second of white noise, looped into every noise voice. */
export function createNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Linear up to 0.8, then a soft knee that never quite reaches full scale. */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    const magnitude = Math.abs(x);
    const shaped = magnitude <= 0.8 ? magnitude : 0.8 + 0.2 * Math.tanh((magnitude - 0.8) / 0.2);
    curve[i] = Math.sign(x) * shaped;
  }
  return curve;
}

/** sfx and music buses into a compressor and a soft clipper, then the speakers. */
export function createMasterChain(
  ctx: BaseAudioContext,
  destination: AudioNode = ctx.destination,
): MasterChain {
  const sfx = ctx.createGain();
  const music = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 10;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.2;
  const clipper = ctx.createWaveShaper();
  clipper.curve = softClipCurve();
  sfx.connect(compressor);
  music.connect(compressor);
  compressor.connect(clipper);
  clipper.connect(destination);
  return { sfx, music, noise: createNoiseBuffer(ctx) };
}

function envelope(
  ctx: BaseAudioContext,
  out: AudioNode,
  start: number,
  spec: EnvelopeSpec,
): { input: AudioNode; nodes: AudioNode[]; end: number } {
  const attack = spec.attack ?? 0.003;
  const hold = spec.hold ?? 0;
  const end = start + attack + hold + spec.decay;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(Math.max(SILENCE * 2, spec.peak), start + attack);
  gain.gain.setValueAtTime(Math.max(SILENCE * 2, spec.peak), start + attack + hold);
  gain.gain.exponentialRampToValueAtTime(SILENCE, end);
  gain.connect(out);
  const nodes: AudioNode[] = [gain];
  if (!spec.filter) return { input: gain, nodes, end };

  const filter = ctx.createBiquadFilter();
  filter.type = spec.filter.type;
  filter.frequency.setValueAtTime(spec.filter.freq, start);
  if (spec.filter.to !== undefined)
    filter.frequency.exponentialRampToValueAtTime(spec.filter.to, end);
  filter.Q.value = spec.filter.q ?? 0.7;
  filter.connect(gain);
  nodes.push(filter);
  return { input: filter, nodes, end };
}

function release(source: AudioScheduledSourceNode, nodes: readonly AudioNode[]): void {
  source.onended = () => {
    source.disconnect();
    for (const node of nodes) node.disconnect();
  };
}

/** An enveloped oscillator starting at `at`, pitch scaled by `ratio`. */
export function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  spec: ToneSpec,
  ratio = 1,
): void {
  const start = at + (spec.delay ?? 0);
  const { input, nodes, end } = envelope(ctx, out, start, spec);
  const osc = ctx.createOscillator();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.freq * ratio, start);
  if (spec.to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      spec.to * ratio,
      start + (spec.glide ?? end - start),
    );
  }
  osc.detune.value = spec.detune ?? 0;
  osc.connect(input);
  release(osc, nodes);
  osc.start(start);
  osc.stop(end + 0.02);
}

/** An enveloped burst of filtered noise; filter frequencies are scaled by `ratio`. */
export function noise(
  ctx: BaseAudioContext,
  out: AudioNode,
  buffer: AudioBuffer,
  at: number,
  spec: NoiseSpec,
  ratio = 1,
): void {
  const start = at + (spec.delay ?? 0);
  const filter = spec.filter && {
    ...spec.filter,
    freq: spec.filter.freq * ratio,
    ...(spec.filter.to === undefined ? {} : { to: spec.filter.to * ratio }),
  };
  const { input, nodes, end } = envelope(ctx, out, start, filter ? { ...spec, filter } : spec);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(input);
  release(source, nodes);
  source.start(start, Math.random() * NOISE_SECONDS);
  source.stop(end + 0.02);
}

interface Voice {
  tone(spec: ToneSpec): void;
  noise(spec: NoiseSpec): void;
  random(): number;
}

type CueSynth = (voice: Voice, size: number) => void;

const NOTE = {
  C4: 261.63,
  Eb4: 311.13,
  E4: 329.63,
  G4: 392,
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  B5: 987.77,
  C6: 1046.5,
  E6: 1318.51,
  G6: 1567.98,
  B6: 1975.53,
} as const;

const chime = (voice: Voice, freqs: readonly number[], spacing: number, peak: number): void => {
  freqs.forEach((freq, i) => {
    voice.tone({ type: "triangle", freq, delay: i * spacing, decay: 0.32, peak });
    voice.tone({ type: "sine", freq: freq * 2, delay: i * spacing, decay: 0.14, peak: peak * 0.3 });
  });
};

const boom = (voice: Voice, size: number, delay = 0): void => {
  const length = 0.28 + size * 0.32;
  voice.noise({
    delay,
    filter: { type: "lowpass", freq: 2200 - size * 700, to: 110, q: 0.8 },
    decay: length,
    peak: 0.3 + size * 0.15,
  });
  voice.tone({
    type: "sine",
    freq: 112 - size * 32,
    to: 32,
    delay,
    decay: length,
    peak: 0.42 + size * 0.18,
  });
  voice.noise({ delay, filter: { type: "highpass", freq: 2600 }, decay: 0.04, peak: 0.1 });
};

const CUE_SYNTHS: Readonly<Record<Cue, CueSynth>> = {
  "shot-bolt": (v) => {
    v.tone({ type: "square", freq: 1500, to: 520, decay: 0.07, peak: 0.035 });
    v.tone({ type: "triangle", freq: 920, to: 300, decay: 0.06, peak: 0.07 });
    v.noise({ filter: { type: "highpass", freq: 5000 }, decay: 0.025, peak: 0.04 });
  },
  "shot-cannon": (v) => {
    v.tone({ type: "sine", freq: 170, to: 48, decay: 0.16, peak: 0.36 });
    v.noise({ filter: { type: "lowpass", freq: 1500, to: 220 }, decay: 0.12, peak: 0.22 });
    v.tone({
      type: "square",
      freq: 95,
      to: 42,
      decay: 0.05,
      peak: 0.06,
      filter: { type: "lowpass", freq: 700 },
    });
  },
  "shot-mortar": (v) => {
    v.tone({ type: "sine", freq: 95, to: 160, glide: 0.04, decay: 0.2, peak: 0.34 });
    v.tone({ type: "triangle", freq: 250, to: 120, decay: 0.09, peak: 0.1 });
    v.noise({
      filter: { type: "bandpass", freq: 500, to: 1900, q: 1.2 },
      attack: 0.02,
      decay: 0.24,
      peak: 0.12,
    });
  },
  beam: (v) => {
    for (const detune of [-9, 9]) {
      v.tone({
        type: "sawtooth",
        freq: 2400,
        to: 260,
        detune,
        decay: 0.24,
        peak: 0.08,
        filter: { type: "bandpass", freq: 3200, to: 500, q: 2.5 },
      });
    }
    v.tone({ type: "sine", freq: 700, to: 210, decay: 0.2, peak: 0.1 });
    v.noise({ filter: { type: "highpass", freq: 3000 }, decay: 0.07, peak: 0.05 });
  },
  frost: (v) => {
    [NOTE.G6, 2349.32, 3135.96].forEach((freq, i) => {
      v.tone({ type: "sine", freq, delay: i * 0.025, decay: 0.32, peak: 0.05 });
    });
    v.noise({
      filter: { type: "highpass", freq: 6000, to: 9000 },
      attack: 0.02,
      decay: 0.3,
      peak: 0.05,
    });
    v.tone({ type: "triangle", freq: 420, to: 260, decay: 0.12, peak: 0.07 });
  },
  arc: (v, size) => {
    const crackles = 4 + Math.round(size * 3);
    for (let i = 0; i < crackles; i++) {
      v.noise({
        filter: { type: "bandpass", freq: 2500 + v.random() * 3000, q: 5 },
        delay: i * 0.028 + v.random() * 0.01,
        decay: 0.03,
        peak: 0.2,
      });
    }
    v.tone({
      type: "sawtooth",
      freq: 120,
      hold: 0.02,
      decay: 0.14,
      peak: 0.07,
      filter: { type: "highpass", freq: 800 },
    });
    v.tone({ type: "square", freq: 1800, to: 900, decay: 0.1, peak: 0.02 });
  },
  boom: (v, size) => {
    boom(v, size);
  },
  hit: (v) => {
    v.tone({ type: "triangle", freq: 340, to: 190, decay: 0.03, peak: 0.035 });
    v.noise({ filter: { type: "bandpass", freq: 2200, q: 1.5 }, decay: 0.02, peak: 0.03 });
  },
  pop: (v, size) => {
    v.tone({
      type: "sine",
      freq: 820 - size * 380,
      to: 240 - size * 110,
      decay: 0.08 + size * 0.05,
      peak: 0.12 + size * 0.05,
    });
    v.noise({
      filter: { type: "bandpass", freq: 1800 - size * 700, q: 2 },
      decay: 0.05,
      peak: 0.07,
    });
  },
  "boss-arrive": (v) => {
    [55, 82.41, 110].forEach((freq, i) => {
      v.tone({
        type: "sawtooth",
        freq,
        detune: (i - 1) * 8,
        attack: 0.25,
        hold: 0.45,
        decay: 0.7,
        peak: 0.12,
        filter: { type: "lowpass", freq: 260, to: 1000, q: 2 },
      });
    });
    v.tone({ type: "sine", freq: 41.2, attack: 0.2, hold: 0.5, decay: 0.7, peak: 0.24 });
    v.noise({
      filter: { type: "lowpass", freq: 320 },
      attack: 0.3,
      hold: 0.3,
      decay: 0.6,
      peak: 0.12,
    });
  },
  "boss-down": (v) => {
    boom(v, 1);
    v.noise({ filter: { type: "lowpass", freq: 1600, to: 80 }, delay: 0.1, decay: 0.8, peak: 0.3 });
    v.tone({
      type: "sawtooth",
      freq: 440,
      to: 55,
      decay: 0.7,
      peak: 0.08,
      filter: { type: "lowpass", freq: 1800, to: 200 },
    });
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((freq, i) => {
      v.tone({ type: "triangle", freq, delay: 0.2 + i * 0.06, hold: 0.25, decay: 0.6, peak: 0.09 });
    });
  },
  leak: (v, size) => {
    v.tone({
      type: "square",
      freq: 660,
      hold: 0.04,
      decay: 0.09,
      peak: 0.13,
      filter: { type: "lowpass", freq: 2200 },
    });
    v.tone({
      type: "square",
      freq: 440,
      delay: 0.13,
      hold: 0.04,
      decay: 0.15,
      peak: 0.15,
      filter: { type: "lowpass", freq: 1800 },
    });
    v.tone({ type: "sine", freq: 120, to: 50, decay: 0.22, peak: 0.32 + size * 0.15 });
  },
  split: (v) => {
    [300, 430, 600].forEach((freq, i) => {
      v.tone({ type: "sine", freq, to: freq * 1.5, delay: i * 0.04, decay: 0.06, peak: 0.11 });
    });
    v.noise({ filter: { type: "lowpass", freq: 900 }, decay: 0.06, peak: 0.09 });
  },
  heal: (v) => {
    v.tone({ type: "sine", freq: 520, to: 880, attack: 0.05, decay: 0.26, peak: 0.07 });
    v.tone({
      type: "triangle",
      freq: 780,
      to: 1320,
      attack: 0.05,
      delay: 0.03,
      decay: 0.24,
      peak: 0.035,
    });
  },
  build: (v) => {
    v.noise({ filter: { type: "bandpass", freq: 900, q: 1.4 }, decay: 0.07, peak: 0.26 });
    v.tone({
      type: "square",
      freq: 200,
      to: 90,
      decay: 0.08,
      peak: 0.08,
      filter: { type: "lowpass", freq: 900 },
    });
    v.tone({ type: "sine", freq: 150, to: 70, decay: 0.12, peak: 0.28 });
    v.noise({
      filter: { type: "bandpass", freq: 1300, q: 2 },
      delay: 0.075,
      decay: 0.05,
      peak: 0.16,
    });
    v.tone({ type: "triangle", freq: 330, delay: 0.075, decay: 0.08, peak: 0.09 });
  },
  upgrade: (v, size) => {
    const notes = size > 0.5 ? [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6] : [NOTE.C5, NOTE.E5, NOTE.G5];
    chime(v, notes, 0.055, 0.13);
    v.noise({
      filter: { type: "highpass", freq: 7000 },
      attack: 0.05,
      delay: 0.1,
      decay: 0.2,
      peak: 0.04,
    });
  },
  sell: (v) => {
    v.tone({
      type: "square",
      freq: NOTE.E6,
      decay: 0.08,
      peak: 0.05,
      filter: { type: "lowpass", freq: 5000 },
    });
    v.tone({
      type: "square",
      freq: NOTE.B5,
      delay: 0.07,
      decay: 0.18,
      peak: 0.06,
      filter: { type: "lowpass", freq: 4000 },
    });
    v.tone({ type: "sine", freq: NOTE.B6, delay: 0.07, decay: 0.15, peak: 0.04 });
  },
  "wave-start": (v) => {
    [196, 293.66, 392].forEach((freq, i) => {
      v.tone({
        type: "sawtooth",
        freq,
        detune: i * 5 - 5,
        attack: 0.06,
        hold: 0.22,
        decay: 0.35,
        peak: 0.1,
        filter: { type: "lowpass", freq: 500, to: 2600, q: 1.5 },
      });
    });
    v.tone({ type: "sine", freq: 130, to: 45, decay: 0.3, peak: 0.42 });
    v.noise({ filter: { type: "lowpass", freq: 1200, to: 200 }, decay: 0.22, peak: 0.18 });
  },
  coins: (v) => {
    for (let i = 0; i < 4; i++) {
      v.tone({
        type: "square",
        freq: i % 2 === 0 ? NOTE.B5 : NOTE.E6,
        delay: 0.12 + i * 0.065,
        decay: 0.1,
        peak: 0.045,
        filter: { type: "lowpass", freq: 5000 },
      });
    }
  },
  "wave-clear": (v) => {
    chime(v, [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 0.07, 0.15);
    v.tone({ type: "sine", freq: NOTE.C4, attack: 0.02, hold: 0.2, decay: 0.4, peak: 0.12 });
  },
  victory: (v) => {
    // Starts late so the final wave-clear chime can finish first.
    const start = 0.35;
    [NOTE.G4, NOTE.C5, NOTE.E5].forEach((freq, i) => {
      v.tone({ type: "triangle", freq, delay: start + i * 0.11, decay: 0.16, peak: 0.16 });
    });
    [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5].forEach((freq, i) => {
      v.tone({
        type: "sawtooth",
        freq,
        detune: (i % 2) * 6 - 3,
        delay: start + 0.33,
        attack: 0.04,
        hold: 0.45,
        decay: 0.9,
        peak: 0.065,
        filter: { type: "lowpass", freq: 2400, to: 700 },
      });
    });
    [NOTE.G5, NOTE.C6, NOTE.E6].forEach((freq, i) => {
      v.tone({ type: "sine", freq, delay: start + 0.33 + i * 0.08, decay: 0.8, peak: 0.06 });
    });
    v.tone({ type: "sine", freq: 65.41, delay: start + 0.33, decay: 0.5, peak: 0.35 });
  },
  defeat: (v) => {
    [NOTE.G4, NOTE.Eb4, NOTE.C4].forEach((freq, i) => {
      v.tone({ type: "triangle", freq, delay: i * 0.2, hold: 0.08, decay: 0.3, peak: 0.16 });
    });
    for (const freq of [65.41, 130.81]) {
      v.tone({
        type: "sawtooth",
        freq,
        delay: 0.6,
        attack: 0.05,
        hold: 0.3,
        decay: 1,
        peak: 0.1,
        filter: { type: "lowpass", freq: 900, to: 120 },
      });
    }
    v.tone({ type: "sine", freq: 55, to: 40, delay: 0.6, decay: 1, peak: 0.3 });
  },
  meteor: (v) => {
    v.noise({
      filter: { type: "bandpass", freq: 4000, to: 350, q: 1.4 },
      attack: 0.3,
      decay: 0.2,
      peak: 0.3,
    });
    v.tone({ type: "sawtooth", freq: 900, to: 120, attack: 0.3, decay: 0.2, peak: 0.03 });
    boom(v, 1, 0.45);
  },
  freeze: (v) => {
    v.noise({
      filter: { type: "highpass", freq: 9000, to: 2500 },
      attack: 0.08,
      decay: 0.6,
      peak: 0.14,
    });
    [NOTE.E6, NOTE.G6, NOTE.B6, 2637.02, 3135.96, 3951.07].forEach((freq, i) => {
      v.tone({ type: "sine", freq, delay: i * 0.035, decay: 0.45, peak: 0.06 });
    });
    v.tone({ type: "sine", freq: 82.41, attack: 0.02, hold: 0.15, decay: 0.5, peak: 0.3 });
  },
  "shot-hero": (v) => {
    v.tone({ type: "triangle", freq: 1900, to: 1200, decay: 0.05, peak: 0.05 });
    v.tone({ type: "sine", freq: 2800, to: 1500, decay: 0.035, peak: 0.03 });
    v.noise({ filter: { type: "highpass", freq: 7000 }, decay: 0.02, peak: 0.025 });
  },
  dash: (v) => {
    v.noise({
      filter: { type: "bandpass", freq: 600, to: 3200, q: 0.9 },
      attack: 0.01,
      decay: 0.16,
      peak: 0.16,
    });
    v.tone({ type: "sine", freq: 320, to: 760, decay: 0.12, peak: 0.05 });
  },
  nova: (v, size) => {
    v.tone({ type: "sine", freq: 180, to: 1400, attack: 0.05, decay: 0.28, peak: 0.12 });
    [NOTE.C5, NOTE.G5, NOTE.C6, NOTE.E6].forEach((freq, i) => {
      v.tone({ type: "triangle", freq, delay: 0.12 + i * 0.03, decay: 0.5, peak: 0.07 });
    });
    boom(v, 0.6 + size * 0.4, 0.1);
  },
  "hero-down": (v) => {
    v.tone({ type: "sawtooth", freq: 420, to: 70, decay: 0.55, peak: 0.08 });
    v.tone({ type: "sine", freq: 210, to: 45, decay: 0.6, peak: 0.22 });
    v.noise({ filter: { type: "lowpass", freq: 1200, to: 200 }, decay: 0.4, peak: 0.16 });
  },
  "hero-up": (v) => {
    chime(v, [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 0.06, 0.1);
    v.noise({ filter: { type: "highpass", freq: 6000 }, attack: 0.05, decay: 0.3, peak: 0.05 });
  },
  tap: (v) => {
    v.tone({ type: "sine", freq: 1100, to: 700, decay: 0.04, peak: 0.16 });
    v.tone({ type: "triangle", freq: 2200, decay: 0.015, peak: 0.04 });
  },
  denied: (v) => {
    for (const delay of [0, 0.1]) {
      v.tone({
        type: "square",
        freq: 140,
        delay,
        hold: 0.03,
        decay: 0.05,
        peak: 0.06,
        filter: { type: "lowpass", freq: 900 },
      });
    }
  },
  star: (v, size) => {
    const freq = NOTE.C6 * 2 ** ((Math.round(size * 2) * 3.5) / 12);
    v.tone({ type: "sine", freq, decay: 0.5, peak: 0.14 });
    v.tone({ type: "sine", freq: freq * 2.76, decay: 0.18, peak: 0.03 });
    v.noise({ filter: { type: "highpass", freq: 8000 }, decay: 0.15, peak: 0.04 });
  },
};

/** Musical cues barely move in pitch; percussive ones vary so repeats don't sound robotic. */
const TUNED: ReadonlySet<Cue> = new Set<Cue>([
  "upgrade",
  "sell",
  "coins",
  "wave-start",
  "wave-clear",
  "victory",
  "defeat",
  "freeze",
  "boss-down",
  "star",
  "tap",
  "denied",
  "hero-up",
]);

/** Schedules one play of a cue on the sfx bus. `size` is 0..1, as chosen by cues.ts. */
export function renderCue(
  ctx: BaseAudioContext,
  out: AudioNode,
  noiseBuffer: AudioBuffer,
  cue: Cue,
  size: number,
  at = ctx.currentTime,
  random: () => number = Math.random,
): void {
  const cents = (random() - 0.5) * (TUNED.has(cue) ? 12 : 140);
  const ratio = 2 ** (cents / 1200);
  const voice: Voice = {
    tone: (spec) => {
      tone(ctx, out, at, spec, ratio);
    },
    noise: (spec) => {
      noise(ctx, out, noiseBuffer, at, spec, ratio);
    },
    random,
  };
  CUE_SYNTHS[cue](voice, Math.min(1, Math.max(0, size)));
}
