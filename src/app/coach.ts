import type { Cell } from "../core/geometry";
import type { GameApp, Store } from "./game-app";
import type { GameSession } from "./session";

/** What the coach bubble points at. The UI resolves it to a rectangle on screen. */
export type Anchor =
  | { readonly kind: "none" }
  | { readonly kind: "landmarks" }
  | { readonly kind: "element"; readonly selector: string }
  | { readonly kind: "cells"; readonly cells: readonly Cell[] };

export interface CoachView {
  readonly kind: "tutorial" | "tip";
  /** Translation key under `coach.steps` or `coach.tips`. */
  readonly id: string;
  readonly anchor: Anchor;
  /** Waits for the player to tap the bubble; the game is paused meanwhile. */
  readonly tap: boolean;
  /** 1-based position in the tutorial; 0 for tips. */
  readonly step: number;
  readonly steps: number;
}

interface Step {
  readonly id: string;
  readonly anchor: (session: GameSession) => Anchor;
  /** Absent: the player taps to continue. */
  readonly done?: (session: GameSession) => boolean;
  /** When this stops holding, the tutorial steps back (the player undid what it asked for). */
  readonly requires?: (session: GameSession) => boolean;
  /** While shown, towers may only be built on these cells. */
  readonly guide?: readonly Cell[];
}

interface Tip {
  readonly id: string;
  readonly when: (session: GameSession) => boolean;
  readonly anchor: Anchor;
}

export const TUTORIAL_LEVEL = "c1-crossing";
export const TUTORIAL_DONE = "tutorial";

/** On The Crossing, a wall across the middle lane forces the first real detour. */
const FIRST_CELL: Cell = { x: 3, y: 5 };
const MORE_CELLS: readonly Cell[] = [
  { x: 3, y: 4 },
  { x: 3, y: 6 },
];
const BOLT_CARD: Anchor = { kind: "element", selector: '[data-tower="bolt"]' };

const towers = (s: GameSession): number => s.simulation.world.towers.length;
const holdingBolt = (s: GameSession): boolean =>
  s.selection.kind === "build" && s.selection.tower === "bolt";
const upgraded = (s: GameSession): boolean => s.simulation.world.towers.some((t) => t.level > 0);
const STICK: Anchor = { kind: "element", selector: "#stick" };
/** The hero has been steered away from where it started. */
const heroMoved = (s: GameSession): boolean => {
  const { hero } = s.simulation.world;
  if (!hero) return true;
  const home = s.simulation.grid.exits[0];
  return !home || Math.hypot(hero.x - home.x - 0.5, hero.y - home.y - 0.5) > 0.6;
};

export const TUTORIAL: readonly Step[] = [
  { id: "welcome", anchor: () => ({ kind: "landmarks" }) },
  { id: "pick", anchor: () => BOLT_CARD, done: (s) => holdingBolt(s) || towers(s) >= 1 },
  {
    id: "place",
    anchor: () => ({ kind: "cells", cells: [FIRST_CELL] }),
    guide: [FIRST_CELL],
    done: (s) => towers(s) >= 1,
    requires: holdingBolt,
  },
  { id: "walls", anchor: () => ({ kind: "cells", cells: [FIRST_CELL] }) },
  {
    id: "more",
    anchor: (s) => (holdingBolt(s) ? { kind: "cells", cells: MORE_CELLS } : BOLT_CARD),
    guide: MORE_CELLS,
    done: (s) => towers(s) >= 3,
  },
  {
    id: "hero",
    anchor: (s) => (s.hero ? STICK : { kind: "none" }),
    done: heroMoved,
  },
  {
    id: "start",
    anchor: () => ({ kind: "element", selector: "#next-wave" }),
    done: (s) => s.simulation.world.wavesStarted >= 1,
  },
  {
    id: "watch",
    anchor: () => ({ kind: "element", selector: ".stats" }),
    done: (s) => s.simulation.world.wavesCleared >= 1,
  },
  {
    id: "inspect",
    anchor: (s: GameSession): Anchor => {
      const tower = s.simulation.world.towers[0];
      return tower ? { kind: "cells", cells: [tower] } : { kind: "none" };
    },
    done: (s) => s.selection.kind === "tower" || upgraded(s),
  },
  {
    id: "upgrade",
    anchor: () => ({ kind: "element", selector: "#upgrade" }),
    done: upgraded,
    requires: (s) => s.selection.kind === "tower",
  },
  { id: "finish", anchor: () => ({ kind: "none" }) },
];

const living = (s: GameSession) => s.simulation.world.enemies.filter((e) => e.status === "alive");

/** One-time explanations, shown the first time each situation comes up in any level. */
export const TIPS: readonly Tip[] = [
  {
    id: "flyer",
    when: (s) => living(s).some((e) => e.def.flying === true),
    anchor: { kind: "landmarks" },
  },
  { id: "healer", when: (s) => living(s).some((e) => e.def.heal), anchor: { kind: "none" } },
  { id: "splitter", when: (s) => living(s).some((e) => e.def.split), anchor: { kind: "none" } },
  {
    id: "boss",
    when: (s) => living(s).some((e) => e.def.leakDamage >= 20),
    anchor: { kind: "landmarks" },
  },
  {
    id: "power",
    when: (s) => s.content.powers.length > 0 && s.simulation.world.phase === "wave",
    anchor: { kind: "element", selector: "#powers" },
  },
  {
    id: "early",
    when: (s) => s.simulation.world.phase === "wave" && s.simulation.canStartWave,
    anchor: { kind: "element", selector: "#next-wave" },
  },
  {
    id: "nova",
    when: (s) => (s.hero?.charge ?? 0) >= 1,
    anchor: { kind: "element", selector: "#nova" },
  },
  {
    id: "downed",
    when: (s) => s.hero?.status === "down",
    anchor: { kind: "none" },
  },
];

/**
 * Onboarding. A hands-on tutorial runs on the first campaign level until it
 * is finished or skipped, then short tips explain each new mechanic the first
 * time it appears. Steps advance from game state, not timers, so the player
 * always does the thing being explained. What has been seen is persisted.
 */
export class Coach {
  private index = 0;
  private tip: Tip | undefined;
  private readonly seen: Set<string>;
  /** Whether this coach put its dialog on the app's overlay stack. */
  private holding = false;

  constructor(
    private readonly app: GameApp,
    private readonly store: Store<readonly string[]>,
  ) {
    this.seen = new Set(store.load());
    app.events.on("gameLoaded", () => {
      this.index = 0;
      this.tip = undefined;
    });
  }

  get tutorialActive(): boolean {
    const { app } = this;
    return (
      app.screen.kind === "game" &&
      app.mode.kind === "campaign" &&
      app.mode.levelId === TUTORIAL_LEVEL &&
      app.session.started &&
      !app.session.outcome &&
      !this.seen.has(TUTORIAL_DONE)
    );
  }

  get view(): CoachView | undefined {
    const { session } = this.app;
    if (this.tip) {
      return {
        kind: "tip",
        id: this.tip.id,
        anchor: this.tip.anchor,
        tap: true,
        step: 0,
        steps: 0,
      };
    }
    const step = TUTORIAL[this.index];
    if (!this.tutorialActive || !step) return undefined;
    return {
      kind: "tutorial",
      id: step.id,
      anchor: step.anchor(session),
      tap: step.done === undefined,
      step: this.index + 1,
      steps: TUTORIAL.length,
    };
  }

  /** Cells the tutorial currently allows building on, if it restricts them. */
  get guide(): readonly Cell[] | undefined {
    return this.tutorialActive ? TUTORIAL[this.index]?.guide : undefined;
  }

  hasSeen(id: string): boolean {
    return this.seen.has(id);
  }

  /** Called every frame: advances on game state and raises tips. */
  update(): void {
    const { app } = this;
    // The dialog was dismissed from outside (the back gesture): treat it as a tap.
    if (this.holding && !app.hasOverlay("coach")) {
      this.holding = false;
      if (this.view?.tap) this.next();
    }
    if (this.tutorialActive) {
      this.advance();
    } else if (!this.tip && app.screen.kind === "game" && app.overlay === undefined) {
      const { session } = app;
      if (session.started && !session.outcome) {
        this.tip = TIPS.find((tip) => !this.seen.has(tip.id) && tip.when(session));
      }
    }
    this.syncDialog();
  }

  /** The bubble's button: dismiss a tip or continue a tap step. */
  next(): void {
    if (this.tip) {
      this.markSeen(this.tip.id);
      this.tip = undefined;
    } else if (this.tutorialActive) {
      const step = TUTORIAL[this.index];
      if (step?.done !== undefined) return;
      this.index += 1;
      if (this.index >= TUTORIAL.length) this.markSeen(TUTORIAL_DONE);
    }
    this.syncDialog();
  }

  skipTutorial(): void {
    this.markSeen(TUTORIAL_DONE);
    this.syncDialog();
  }

  /** From settings: show the tutorial and every tip again. */
  reset(): void {
    this.seen.clear();
    this.store.save([]);
    this.index = 0;
    this.tip = undefined;
  }

  private advance(): void {
    const { session } = this.app;
    // Bounded: a step can be crossed at most once per update.
    let guard = TUTORIAL.length;
    while (guard-- > 0) {
      const step = TUTORIAL[this.index];
      if (!step) break;
      if (step.done?.(session)) {
        this.index += 1;
        if (this.index >= TUTORIAL.length) this.markSeen(TUTORIAL_DONE);
        continue;
      }
      if (step.requires && !step.requires(session) && this.index > 0) {
        this.index -= 1;
        continue;
      }
      break;
    }
  }

  private syncDialog(): void {
    const { app } = this;
    const wants = this.view?.tap === true;
    if (wants && !this.holding && app.overlay === undefined && app.screen.kind === "game") {
      app.openOverlay("coach");
      this.holding = app.hasOverlay("coach");
    } else if (!wants && this.holding) {
      this.holding = false;
      if (app.overlay === "coach") app.closeOverlay();
    }
  }

  private markSeen(id: string): void {
    this.seen.add(id);
    this.store.save([...this.seen]);
  }
}

const ID = /^[a-z0-9-]{1,40}$/;

/** Saved onboarding state is untrusted: keep only well-formed ids. */
export function parseSeen(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && ID.test(id)).slice(0, 100);
}
