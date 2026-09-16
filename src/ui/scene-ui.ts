import type { GameApp } from "../app/game-app";
import { findLevel } from "../core/campaign";
import { paintChapterScene, paintEnding, paintTitleBackdrop } from "../render/art/story";
import { requireElement } from "./dom";

type ScenePainter = (ctx: CanvasRenderingContext2D, width: number, height: number, now: number) => void;

/** Illustrations animate at a gentle rate; they are backdrops, not gameplay. */
const FRAME_MS = 1000 / 30;

/**
 * Paints the story illustrations: the animated title backdrop, the chapter
 * scene above each briefing, and the ending. Only the visible one is drawn,
 * and with reduced motion each is painted once as a still.
 */
export class SceneUi {
  private readonly home: HTMLCanvasElement;
  private readonly briefing: HTMLCanvasElement;
  private readonly ending: HTMLCanvasElement;
  private lastPaint = Number.NEGATIVE_INFINITY;
  private lastKey = "";

  constructor(
    root: Document,
    private readonly app: GameApp,
    private readonly reducedMotion: boolean,
  ) {
    this.home = requireElement(root, "#home-backdrop", HTMLCanvasElement);
    this.briefing = requireElement(root, "#brief-scene", HTMLCanvasElement);
    this.ending = requireElement(root, "#result-ending", HTMLCanvasElement);
  }

  render(now: number, pixelRatio: number): void {
    const target = this.target();
    if (!target) {
      this.lastKey = "";
      return;
    }
    const { canvas, paint, key } = target;
    const fresh = key !== this.lastKey;
    if (!fresh && (this.reducedMotion || now - this.lastPaint < FRAME_MS)) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const width = Math.round(rect.width * pixelRatio);
    const height = Math.round(rect.height * pixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    this.lastKey = key;
    this.lastPaint = now;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    paint(ctx, rect.width, rect.height, this.reducedMotion ? 0 : now);
  }

  private target():
    { readonly canvas: HTMLCanvasElement; readonly paint: ScenePainter; readonly key: string } | undefined {
    const { app } = this;
    const screen = app.screen;
    switch (screen.kind) {
      case "home":
        return { canvas: this.home, paint: paintTitleBackdrop, key: "home" };
      case "briefing": {
        const theme = findLevel(app.campaign, screen.levelId)?.chapter.theme ?? "meadow";
        return {
          canvas: this.briefing,
          paint: (ctx, width, height, now) => {
            paintChapterScene(ctx, width, height, theme, now);
          },
          key: `briefing:${theme}`,
        };
      }
      case "result": {
        const { result } = screen;
        const finale = result.mode.kind === "campaign" && result.won && !result.nextLevelId;
        return finale ? { canvas: this.ending, paint: paintEnding, key: "ending" } : undefined;
      }
      case "map":
      case "game":
        return undefined;
    }
  }
}
