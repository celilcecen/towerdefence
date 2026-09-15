import { TICK_SECONDS } from "../core/tick";

export interface FrameScheduler {
  request(callback: (timeMs: number) => void): number;
  cancel(handle: number): void;
}

export interface LoopControl {
  readonly speed: number;
  readonly paused: boolean;
}

/**
 * Longest real-time gap simulated in one frame. After a stall (a background
 * tab, a GC pause) the game skips ahead at most this far, which also bounds
 * the ticks per frame and prevents a spiral of death on slow devices.
 */
const MAX_FRAME_SECONDS = 0.25;

/**
 * Fixed-timestep loop with an accumulator. The simulation always advances in
 * identical ticks regardless of frame rate, which keeps it deterministic;
 * the renderer receives an interpolation factor so motion stays smooth on
 * 60, 120 or 144 Hz displays.
 */
export class GameLoop {
  private accumulator = 0;
  private lastSeconds: number | undefined;
  private handle: number | undefined;

  constructor(
    private readonly tick: () => void,
    private readonly render: (alpha: number) => void,
    private readonly control: LoopControl,
    private readonly scheduler: FrameScheduler,
  ) {}

  get running(): boolean {
    return this.handle !== undefined;
  }

  start(): void {
    if (this.running) return;
    this.lastSeconds = undefined;
    this.schedule();
  }

  stop(): void {
    if (this.handle !== undefined) this.scheduler.cancel(this.handle);
    this.handle = undefined;
  }

  /** Processes one animation frame. Public so it can be driven by tests. */
  advance(timeMs: number): void {
    const now = timeMs / 1000;
    const elapsed =
      this.lastSeconds === undefined
        ? 0
        : Math.min(Math.max(0, now - this.lastSeconds), MAX_FRAME_SECONDS);
    this.lastSeconds = now;

    if (this.control.paused) {
      this.render(this.accumulator / TICK_SECONDS);
      return;
    }

    this.accumulator += elapsed * this.control.speed;
    while (this.accumulator >= TICK_SECONDS) {
      this.tick();
      this.accumulator -= TICK_SECONDS;
    }

    this.render(this.accumulator / TICK_SECONDS);
  }

  private schedule(): void {
    this.handle = this.scheduler.request((time) => {
      this.advance(time);
      if (this.running) this.schedule();
    });
  }
}
