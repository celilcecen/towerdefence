import type { Cue } from "./cues";
import type { AudioBackend } from "./game-audio";
import type { MusicTimers } from "./music";
import { MusicPlayer } from "./music";
import type { MasterChain } from "./synth";
import { createMasterChain, renderCue } from "./synth";

/** Music sits under the effects even with both sliders at full. */
const MUSIC_LEVEL = 0.55;
/** Seconds for volume changes to settle, so sliders never click. */
const VOLUME_SMOOTHING = 0.05;

const browserTimers: MusicTimers = {
  setInterval: (callback, ms) => window.setInterval(callback, ms),
  clearInterval: (handle) => {
    window.clearInterval(handle as number);
  },
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
};

/** A new AudioContext, or undefined where Web Audio does not exist (including old WebKit). */
export function browserAudioContext(): AudioContext | undefined {
  const scope = globalThis as { AudioContext?: typeof AudioContext };
  const legacy = globalThis as { webkitAudioContext?: typeof AudioContext };
  const Context = scope.AudioContext ?? legacy.webkitAudioContext;
  return Context ? new Context({ latencyHint: "interactive" }) : undefined;
}

class WebAudioBackend implements AudioBackend {
  private readonly chain: MasterChain;
  private readonly music: MusicPlayer;

  constructor(private readonly ctx: AudioContext) {
    this.chain = createMasterChain(ctx);
    this.music = new MusicPlayer(ctx, this.chain.music, this.chain.noise, browserTimers);
    // Older iOS only unlocks a context that plays a buffer inside the gesture.
    const silence = ctx.createBufferSource();
    silence.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    silence.connect(ctx.destination);
    silence.start();
  }

  isRunning(): boolean {
    return this.ctx.state === "running";
  }

  resume(): void {
    this.ctx.resume().catch(() => undefined);
    this.music.resume();
  }

  suspend(): void {
    this.music.pause();
    this.ctx.suspend().catch(() => undefined);
  }

  setVolumes(sfx: number, music: number): void {
    const now = this.ctx.currentTime;
    this.chain.sfx.gain.setTargetAtTime(sfx, now, VOLUME_SMOOTHING);
    this.chain.music.gain.setTargetAtTime(music * MUSIC_LEVEL, now, VOLUME_SMOOTHING);
  }

  playCue(cue: Cue, size: number): void {
    renderCue(this.ctx, this.chain.sfx, this.chain.noise, cue, size);
  }

  setMusic(theme: string | undefined, intensity: number): void {
    if (theme === undefined) this.music.stop();
    else this.music.play(theme, intensity);
  }
}

/**
 * Opens the Web Audio backend for GameAudio. Must first run inside a user
 * gesture (GameAudio.unlock does that) or iOS keeps the context silent.
 */
export function webAudioBackend(
  createContext: () => AudioContext | undefined = browserAudioContext,
): () => AudioBackend | undefined {
  return () => {
    const ctx = createContext();
    return ctx ? new WebAudioBackend(ctx) : undefined;
  };
}
