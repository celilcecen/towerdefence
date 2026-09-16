import { noise, tone } from "./synth";
import type { MusicNote, ThemeScore } from "./themes";
import { midiToHz, notesAt, stepSeconds, themeScore } from "./themes";

export interface MusicTimers {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(callback: () => void, ms: number): unknown;
}

interface Session {
  readonly score: ThemeScore;
  readonly output: GainNode;
  readonly base: GainNode;
  readonly drive: GainNode;
  /** AudioContext time of step 0. */
  readonly start: number;
  step: number;
}

/** Scheduler wake-up interval and how far ahead of the audio clock it books notes. */
const TICK_MS = 25;
const LOOKAHEAD = 0.1;
/** Seconds of cross-fade when a theme starts or stops. */
const FADE = 0.6;
/** Time constant of the intensity ramp, in seconds. */
const INTENSITY_SMOOTHING = 0.9;
/** Seconds the drive layer keeps being scheduled while it fades out. */
const DRIVE_TAIL = 4;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function playNote(
  ctx: BaseAudioContext,
  out: AudioNode,
  noiseBuffer: AudioBuffer,
  score: ThemeScore,
  note: MusicNote,
  at: number,
  step: number,
): void {
  const freq = midiToHz(note.midi);
  const v = note.velocity;
  switch (note.instrument) {
    case "pad": {
      const length = note.steps * step;
      for (const detune of [-7, 7]) {
        tone(ctx, out, at, {
          type: score.padWave,
          freq,
          detune,
          attack: 0.5,
          hold: Math.max(0, length - 0.5),
          decay: 0.9,
          peak: score.padLevel * v,
          filter: { type: "lowpass", freq: score.padCutoff, q: 0.6 },
        });
      }
      return;
    }
    case "pluck":
      tone(ctx, out, at, {
        type: "triangle",
        freq,
        decay: 0.4,
        peak: 0.07 * v,
        filter: { type: "lowpass", freq: 3200, to: 500 },
      });
      return;
    case "bell":
      tone(ctx, out, at, { type: "sine", freq, decay: 1.4, peak: 0.045 * v });
      tone(ctx, out, at, { type: "sine", freq: freq * 2.76, decay: 0.35, peak: 0.012 * v });
      return;
    case "bass": {
      const length = note.steps * step;
      tone(ctx, out, at, {
        type: score.bassWave,
        freq,
        attack: 0.01,
        hold: length * 0.4,
        decay: length * 0.7 + 0.05,
        peak: 0.13 * v,
        filter: { type: "lowpass", freq: score.bassCutoff, q: 1.2 },
      });
      return;
    }
    case "kick":
      tone(ctx, out, at, {
        type: "sine",
        freq: 130,
        to: 42,
        glide: 0.1,
        decay: 0.26,
        peak: 0.2 * v,
      });
      return;
    case "snare":
      noise(ctx, out, noiseBuffer, at, {
        filter: { type: "bandpass", freq: 1900, q: 0.8 },
        decay: 0.14,
        peak: 0.13 * v,
      });
      tone(ctx, out, at, { type: "triangle", freq: 200, to: 140, decay: 0.07, peak: 0.06 * v });
      return;
    case "hat":
      noise(ctx, out, noiseBuffer, at, {
        filter: { type: "highpass", freq: 7500 },
        decay: 0.035,
        peak: 0.05 * v,
      });
      return;
    case "tom":
      tone(ctx, out, at, { type: "sine", freq: 118, to: 70, decay: 0.34, peak: 0.16 * v });
      noise(ctx, out, noiseBuffer, at, {
        filter: { type: "lowpass", freq: 600 },
        decay: 0.06,
        peak: 0.05 * v,
      });
      return;
  }
}

/**
 * Generative background music driven by a lookahead scheduler: a short timer
 * books notes on the AudioContext clock slightly ahead, so timing stays tight
 * even when the main thread is busy. One theme plays at a time; intensity
 * smoothly fades the percussion and bass layer in and out.
 */
export class MusicPlayer {
  private session: Session | undefined;
  private timer: unknown;
  private intensity = 0;
  private driveUntil = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly output: AudioNode,
    private readonly noiseBuffer: AudioBuffer,
    /** Undefined means nothing runs on its own; the caller pumps schedule(). */
    private readonly timers?: MusicTimers,
  ) {}

  get theme(): string | undefined {
    return this.session?.score.id;
  }

  /** Starts a theme, or only moves the intensity if the theme is already playing. */
  play(themeId: string, intensity: number): void {
    const score = themeScore(themeId);
    if (this.session?.score.id !== score.id) {
      this.fadeOut();
      this.session = this.open(score);
    }
    this.setIntensity(intensity);
    this.startTimer();
  }

  /** 0 while building, 1 during a wave. Changes glide over a few seconds. */
  setIntensity(intensity: number): void {
    this.intensity = clamp01(intensity);
    const now = this.ctx.currentTime;
    this.driveUntil = this.intensity > 0 ? Infinity : Math.min(this.driveUntil, now + DRIVE_TAIL);
    const session = this.session;
    if (!session) return;
    session.drive.gain.setTargetAtTime(this.intensity, now, INTENSITY_SMOOTHING);
    session.base.gain.setTargetAtTime(1 - 0.2 * this.intensity, now, INTENSITY_SMOOTHING);
  }

  stop(): void {
    this.stopTimer();
    this.fadeOut();
    this.session = undefined;
  }

  /** Stops booking notes (the context is being suspended) without forgetting the theme. */
  pause(): void {
    this.stopTimer();
  }

  resume(): void {
    if (this.session) this.startTimer();
  }

  /** Books every step that starts before `until`, in AudioContext seconds. */
  schedule(until: number): void {
    const session = this.session;
    if (!session) return;
    const step = stepSeconds(session.score);
    // After a stall (a throttled background tab) skip the missed steps instead of
    // playing them all at once.
    const behind = Math.floor((this.ctx.currentTime - session.start) / step) - session.step;
    if (behind > 1) session.step += behind;

    for (let at = session.start + session.step * step; at < until; at += step) {
      for (const note of notesAt(session.score, session.step)) {
        if (note.layer === "drive" && at > this.driveUntil) continue;
        const bus = note.layer === "drive" ? session.drive : session.base;
        playNote(this.ctx, bus, this.noiseBuffer, session.score, note, at, step);
      }
      session.step++;
    }
  }

  private open(score: ThemeScore): Session {
    const now = this.ctx.currentTime;
    const output = this.ctx.createGain();
    output.gain.setValueAtTime(0, now);
    output.gain.linearRampToValueAtTime(1, now + FADE);
    const base = this.ctx.createGain();
    const drive = this.ctx.createGain();
    drive.gain.value = 0;
    base.connect(output);
    drive.connect(output);
    output.connect(this.output);
    return { score, output, base, drive, start: now + 0.05, step: 0 };
  }

  private fadeOut(): void {
    const session = this.session;
    if (!session) return;
    const now = this.ctx.currentTime;
    const gain = session.output.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + FADE);
    this.timers?.setTimeout(
      () => {
        session.output.disconnect();
      },
      FADE * 1000 + 200,
    );
  }

  private startTimer(): void {
    if (this.timer !== undefined || !this.timers) return;
    this.timer = this.timers.setInterval(() => {
      this.schedule(this.ctx.currentTime + LOOKAHEAD);
    }, TICK_MS);
    this.schedule(this.ctx.currentTime + LOOKAHEAD);
  }

  private stopTimer(): void {
    if (this.timer === undefined) return;
    this.timers?.clearInterval(this.timer);
    this.timer = undefined;
  }
}
