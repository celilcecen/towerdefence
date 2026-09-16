import type { Anchor, Coach, CoachView } from "../app/coach";
import type { Speaker, StoryBeat } from "../content/story";
import type { Strings } from "../i18n";
import { paintPortrait } from "../render/art/story";
import type { CanvasRenderer, ClientRect } from "../render/renderer";
import { h, requireElement, setAttr, setFlag, setText } from "./dom";

const RING_PADDING = 6;
const GAP = 14;
const MARGIN = 12;
const PORTRAIT = 56;
const DIALOGUE_PORTRAIT = 48;
const DIALOGUE_MS = 5200;

const union = (rects: readonly ClientRect[]): ClientRect | undefined => {
  if (rects.length === 0) return undefined;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
};

function paintInto(canvas: HTMLCanvasElement, who: Speaker, size: number, ratio: number): void {
  const side = Math.round(size * ratio);
  if (canvas.width !== side) {
    canvas.width = side;
    canvas.height = side;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, side, side);
  ctx.scale(ratio, ratio);
  paintPortrait(ctx, size, who);
}

/**
 * Draws the coach: pulsing rings around whatever the current step points at,
 * and a speech bubble placed beside it without covering it.
 */
export class CoachUi {
  private readonly layer: HTMLElement;
  private readonly rings: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly portrait: HTMLCanvasElement;
  private readonly speaker: HTMLElement;
  private readonly text: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly skip: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private painted: Speaker | undefined;
  private lastKey = "";

  constructor(
    root: Document,
    private readonly coach: Coach,
    private readonly renderer: CanvasRenderer,
    private readonly pixelRatio: number,
    private t: Strings,
  ) {
    this.layer = requireElement(root, "#coach", HTMLElement);
    this.rings = requireElement(root, "#coach-rings", HTMLElement);
    this.bubble = requireElement(root, "#coach-bubble", HTMLElement);
    this.portrait = requireElement(root, "#coach-portrait", HTMLCanvasElement);
    this.speaker = requireElement(root, "#coach-speaker", HTMLElement);
    this.text = requireElement(root, "#coach-text", HTMLElement);
    this.progress = requireElement(root, "#coach-progress", HTMLElement);
    this.skip = requireElement(root, "#coach-skip", HTMLButtonElement);
    this.next = requireElement(root, "#coach-next", HTMLButtonElement);
    this.next.addEventListener("click", () => {
      coach.next();
    });
    this.skip.addEventListener("click", () => {
      coach.skipTutorial();
    });
  }

  setStrings(t: Strings): void {
    this.t = t;
    this.lastKey = "";
  }

  render(): void {
    const view = this.coach.view;
    setFlag(this.layer, "hidden", !view);
    if (!view) {
      this.lastKey = "";
      return;
    }
    this.renderContent(view);
    this.place(view.anchor, view.tap);
  }

  private renderContent(view: CoachView): void {
    const { t } = this;
    const key = `${t.locale}|${view.kind}|${view.id}|${view.tap}`;
    if (key === this.lastKey) return;
    const moved = this.lastKey !== "";
    this.lastKey = key;

    const who: Speaker = view.kind === "tutorial" ? "scout" : "ilka";
    if (this.painted !== who) {
      this.painted = who;
      paintInto(this.portrait, who, PORTRAIT, this.pixelRatio);
    }
    const table = (view.kind === "tutorial" ? t.coach.steps : t.coach.tips) as Readonly<
      Record<string, string>
    >;
    setText(this.speaker, t.speakers[who]);
    setText(this.text, table[view.id] ?? "");
    setText(this.progress, view.step > 0 ? t.coach.stepOf(view.step, view.steps) : "");
    setFlag(this.skip, "hidden", view.kind !== "tutorial" || view.step === view.steps);
    setFlag(this.next, "hidden", !view.tap);
    const last = view.kind === "tutorial" && view.step === view.steps;
    setText(
      this.next,
      view.kind === "tip" ? t.coach.gotIt : last ? t.coach.letsGo : t.coach.next,
    );
    setFlag(this.layer, "data-dim", view.tap);
    if (view.tap && moved) this.next.focus({ preventScroll: true });
    // Restart the entrance animation for each new message.
    this.bubble.getAnimations().forEach((animation) => {
      animation.cancel();
      animation.play();
    });
  }

  private rectsFor(anchor: Anchor): ClientRect[] {
    switch (anchor.kind) {
      case "none":
        return [];
      case "landmarks": {
        const { spawns, exits } = this.renderer.landmarkClientRects();
        return [...spawns, ...exits];
      }
      case "element": {
        const element = document.querySelector(anchor.selector);
        if (!element) return [];
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0
          ? [{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }]
          : [];
      }
      case "cells":
        return anchor.cells.map((cell) => this.renderer.cellClientRect(cell.x, cell.y));
    }
  }

  private place(anchor: Anchor, tap: boolean): void {
    const rects = this.rectsFor(anchor);
    const rings = rects.map((rect) => {
      const ring = h("div", { className: "coach-ring" });
      ring.style.left = `${rect.left - RING_PADDING}px`;
      ring.style.top = `${rect.top - RING_PADDING}px`;
      ring.style.width = `${rect.width + RING_PADDING * 2}px`;
      ring.style.height = `${rect.height + RING_PADDING * 2}px`;
      return ring;
    });
    const ringKey = rects.map((r) => `${r.left | 0},${r.top | 0},${r.width | 0}`).join(";");
    if (this.rings.dataset["key"] !== ringKey) {
      this.rings.dataset["key"] = ringKey;
      this.rings.replaceChildren(...rings);
    }

    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    const width = this.bubble.offsetWidth;
    const height = this.bubble.offsetHeight;
    const target = union(rects);
    let left = (viewWidth - width) / 2;
    let top = (viewHeight - height) / 2;
    if (target && !(anchor.kind === "landmarks" && tap)) {
      left = target.left + target.width / 2 - width / 2;
      const below = target.top + target.height + GAP + RING_PADDING;
      const above = target.top - GAP - RING_PADDING - height;
      top = target.top + target.height / 2 < viewHeight / 2 ? below : above;
      if (top + height > viewHeight - MARGIN) top = Math.max(MARGIN, above);
      if (top < MARGIN) top = Math.min(viewHeight - height - MARGIN, below);
    }
    left = Math.min(Math.max(MARGIN, left), viewWidth - width - MARGIN);
    top = Math.min(Math.max(MARGIN, top), viewHeight - height - MARGIN);
    setAttr(this.bubble, "style", `left:${Math.round(left)}px;top:${Math.round(top)}px`);
  }
}

/** Story lines spoken as waves start: a portrait and a line that fade on their own. */
export class DialogueUi {
  private readonly box: HTMLElement;
  private readonly portrait: HTMLCanvasElement;
  private readonly speaker: HTMLElement;
  private readonly text: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    root: Document,
    private readonly pixelRatio: number,
    private t: Strings,
  ) {
    this.box = requireElement(root, "#dialogue", HTMLElement);
    this.portrait = requireElement(root, "#dialogue-portrait", HTMLCanvasElement);
    this.speaker = requireElement(root, "#dialogue-speaker", HTMLElement);
    this.text = requireElement(root, "#dialogue-text", HTMLElement);
  }

  setStrings(t: Strings): void {
    this.t = t;
  }

  show(levelId: string, beat: StoryBeat): void {
    const line = this.t.dialogue[levelId]?.[beat.line];
    if (!line) return;
    paintInto(this.portrait, beat.speaker, DIALOGUE_PORTRAIT, this.pixelRatio);
    setAttr(this.box, "data-speaker", beat.speaker);
    setText(this.speaker, this.t.speakers[beat.speaker]);
    setText(this.text, line);
    this.box.hidden = false;
    this.box.getAnimations().forEach((animation) => {
      animation.cancel();
      animation.play();
    });
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.hide();
    }, DIALOGUE_MS);
  }

  hide(): void {
    this.box.hidden = true;
  }
}
