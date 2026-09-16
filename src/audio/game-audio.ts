import type { EventBus } from "../core/events";
import type { GameEvents } from "../core/game-events";
import type { Cue, CueContext, CuePlay, UiCue } from "./cues";
import { CUE_EVENTS, cuesFor } from "./cues";
import { VoiceLimiter } from "./limiter";

/** Volumes, 0..1. */
export interface AudioSettings {
  readonly sfx: number;
  readonly music: number;
}

/**
 * The port to a sound engine. web-audio.ts implements it with the Web Audio API;
 * tests use a fake, so everything above this line runs without a browser.
 */
export interface AudioBackend {
  /** False until a user gesture unlocks playback, and while suspended. */
  isRunning(): boolean;
  resume(): void;
  suspend(): void;
  setVolumes(sfx: number, music: number): void;
  playCue(cue: Cue, size: number): void;
  /** Undefined stops the music. The same theme again only moves the intensity. */
  setMusic(theme: string | undefined, intensity: number): void;
}

const clamp01 = (value: number): number => (value > 0 ? Math.min(1, value) : 0);

/** Sound is cosmetic: a failing audio stack must never break the game. */
function attempt<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}

/**
 * Game sound, driven by simulation events and a few direct UI cues. Purely
 * cosmetic and never feeds back into the game. Every method is a silent no-op
 * until unlock() succeeds, and forever if the platform has no Web Audio.
 */
export class GameAudio {
  private backend: AudioBackend | undefined;
  private unavailable = false;
  private backgrounded = false;
  private settings: AudioSettings = { sfx: 1, music: 1 };
  private theme: string | undefined;
  private intensity = 0;
  private sent: { theme: string | undefined; intensity: number } | undefined;
  private readonly limiter: VoiceLimiter;

  constructor(
    private readonly openBackend: () => AudioBackend | undefined,
    clock: () => number,
  ) {
    this.limiter = new VoiceLimiter(clock);
  }

  /**
   * Call from every user gesture (pointerdown, keydown). The first call creates
   * the audio context; later calls resume it if the platform suspended it.
   */
  unlock(): void {
    if (!this.backend) {
      if (this.unavailable) return;
      this.backend = attempt(this.openBackend);
      if (!this.backend) {
        this.unavailable = true;
        return;
      }
      this.syncVolumes();
      this.syncMusic();
    }
    if (this.backgrounded) return;
    const backend = this.backend;
    attempt(() => {
      if (!backend.isRunning()) backend.resume();
    });
  }

  /**
   * Plays cues for simulation events. `towerKindOf` maps a tower id to its def id,
   * e.g. `(id) => simulation.world.towers.find((t) => t.id === id)?.def.id`.
   */
  attach(
    events: EventBus<GameEvents>,
    towerKindOf: (towerId: number) => string | undefined,
  ): () => void {
    const context: CueContext = { towerKindOf };
    const unsubscribers = CUE_EVENTS.map((type) =>
      events.on(type, (payload) => {
        // Skip the mapping (and the tower lookup) entirely while nothing can sound.
        if (!this.canPlay()) return;
        for (const play of cuesFor(type, payload, context)) this.emit(play);
      }),
    );
    return () => {
      unsubscribers.forEach((off) => {
        off();
      });
    };
  }

  /** UI feedback. For "star", `size` 0, 0.5 and 1 give the first, second and third star. */
  play(cue: UiCue, size = 0): void {
    if (this.canPlay()) this.emit({ cue, size });
  }

  setSettings(settings: AudioSettings): void {
    this.settings = { sfx: clamp01(settings.sfx), music: clamp01(settings.music) };
    this.syncVolumes();
    this.syncMusic();
  }

  /** `theme` is a chapter theme id; undefined stops the music. Cheap to call every frame. */
  setMusic(theme: string | undefined, intensity: number): void {
    this.theme = theme;
    this.intensity = clamp01(intensity);
    this.syncMusic();
  }

  /** The app went to the background: silence everything and stop the scheduler. */
  suspend(): void {
    this.backgrounded = true;
    this.limiter.reset();
    const backend = this.backend;
    if (backend)
      attempt(() => {
        backend.suspend();
      });
  }

  resume(): void {
    this.backgrounded = false;
    const backend = this.backend;
    if (!backend) return;
    attempt(() => {
      backend.resume();
    });
    this.syncMusic();
  }

  private canPlay(): boolean {
    const backend = this.backend;
    return (
      backend !== undefined &&
      !this.backgrounded &&
      this.settings.sfx > 0 &&
      attempt(() => backend.isRunning()) === true
    );
  }

  private emit({ cue, size }: CuePlay): void {
    const backend = this.backend;
    if (!backend || !this.limiter.admit(cue)) return;
    attempt(() => {
      backend.playCue(cue, size);
    });
  }

  private syncVolumes(): void {
    const backend = this.backend;
    if (!backend) return;
    const { sfx, music } = this.settings;
    attempt(() => {
      backend.setVolumes(sfx, music);
    });
  }

  private syncMusic(): void {
    const backend = this.backend;
    if (!backend || this.backgrounded) return;
    const theme = this.settings.music > 0 ? this.theme : undefined;
    const intensity = this.intensity;
    const sent = this.sent;
    if (
      sent &&
      sent.theme === theme &&
      (theme === undefined || Math.abs(sent.intensity - intensity) < 0.01)
    ) {
      return;
    }
    this.sent = { theme, intensity };
    attempt(() => {
      backend.setMusic(theme, intensity);
    });
  }
}
