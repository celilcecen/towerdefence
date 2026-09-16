import type { GameApp } from "../app/game-app";
import type { Strings } from "../i18n";
import { requireElement, setAttr, setFlag, setText } from "./dom";

/** Pixels the knob may travel from the stick's centre; full speed at the rim. */
const STICK_TRAVEL = 40;
/** Below this share of the travel the stick reads as centred. */
const DEAD_ZONE = 0.14;

/** Turns a direction on screen into a direction on the board (the board may be rotated). */
export interface DirectionMapper {
  worldDirection(dx: number, dy: number): { readonly x: number; readonly y: number };
}

/**
 * Touch controls for the hero: a fixed virtual stick bottom-left and the
 * Dash and Nova buttons bottom-right. Every gesture ends in one session
 * call; nothing here knows a game rule. Hidden on levels without a hero.
 */
export class HeroControls {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly dashButton: HTMLButtonElement;
  private readonly novaButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private pointerId: number | undefined;
  private centerX = 0;
  private centerY = 0;
  private lastCool = "";
  private lastCharge = "";

  constructor(
    doc: ParentNode,
    private readonly app: GameApp,
    private readonly mapper: DirectionMapper,
    private t: Strings,
  ) {
    this.root = requireElement(doc, "#hero-controls", HTMLElement);
    this.stage = requireElement(doc, "#stage", HTMLElement);
    this.stick = requireElement(doc, "#stick", HTMLElement);
    this.knob = requireElement(doc, "#stick-knob", HTMLElement);
    this.dashButton = requireElement(doc, "#dash", HTMLButtonElement);
    this.novaButton = requireElement(doc, "#nova", HTMLButtonElement);
    this.status = requireElement(doc, "#hero-status", HTMLElement);

    const { session } = app;
    this.stick.addEventListener("pointerdown", (event) => {
      if (this.pointerId !== undefined) return;
      event.preventDefault();
      this.pointerId = event.pointerId;
      try {
        this.stick.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointers cannot be captured; the stick still follows their moves.
      }
      const rect = this.stick.getBoundingClientRect();
      this.centerX = rect.left + rect.width / 2;
      this.centerY = rect.top + rect.height / 2;
      setFlag(this.stick, "data-active", true);
      this.steer(event.clientX, event.clientY);
    });
    this.stick.addEventListener("pointermove", (event) => {
      if (event.pointerId === this.pointerId) this.steer(event.clientX, event.clientY);
    });
    for (const type of ["pointerup", "pointercancel"] as const) {
      this.stick.addEventListener(type, (event) => {
        if (event.pointerId === this.pointerId) this.release();
      });
    }
    this.dashButton.addEventListener("click", () => {
      session.dash();
    });
    this.novaButton.addEventListener("click", () => {
      session.nova();
    });
  }

  setStrings(t: Strings): void {
    this.t = t;
  }

  /** Cheap to call every frame: only changed values touch the DOM. */
  render(): void {
    const { app } = this;
    const { session } = app;
    const hero = session.hero;
    const visible = app.screen.kind === "game" && session.started && hero !== undefined;
    setFlag(this.root, "hidden", !visible);
    setAttr(this.stage, "data-hero", String(visible));
    if (!hero || !visible) {
      if (this.pointerId !== undefined) this.release();
      return;
    }
    const live = !session.paused && hero.status === "alive" && !session.simulation.isOver;

    const cool = (hero.dashCooldown / hero.def.dash.cooldown).toFixed(3);
    if (cool !== this.lastCool) {
      this.lastCool = cool;
      this.dashButton.style.setProperty("--cool", cool);
    }
    setFlag(this.dashButton, "data-ready", live && hero.dashCooldown <= 0);
    setFlag(this.dashButton, "disabled", !live || hero.dashCooldown > 0);

    const charge = hero.charge.toFixed(3);
    if (charge !== this.lastCharge) {
      this.lastCharge = charge;
      this.novaButton.style.setProperty("--charge", charge);
    }
    const charged = hero.charge >= 1;
    setFlag(this.novaButton, "data-ready", live && charged);
    setFlag(this.novaButton, "disabled", !live || !charged);
    setAttr(this.novaButton, "title", charged ? this.t.hud.nova : this.t.hud.novaCharging);

    const down = hero.status === "down";
    setFlag(this.status, "hidden", !down);
    if (down) setText(this.status, this.t.hud.heroDown(Math.ceil(hero.respawnTimer)));
    setFlag(this.stick, "data-down", down);
  }

  private steer(clientX: number, clientY: number): void {
    let dx = (clientX - this.centerX) / STICK_TRAVEL;
    let dy = (clientY - this.centerY) / STICK_TRAVEL;
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    this.knob.style.transform = `translate(${dx * STICK_TRAVEL}px, ${dy * STICK_TRAVEL}px)`;
    if (length < DEAD_ZONE) {
      this.app.session.stopHero();
      return;
    }
    const world = this.mapper.worldDirection(dx, dy);
    this.app.session.moveHero(world.x, world.y);
  }

  private release(): void {
    if (this.pointerId !== undefined) {
      try {
        this.stick.releasePointerCapture(this.pointerId);
      } catch {
        // The pointer may already be gone; nothing to release.
      }
    }
    this.pointerId = undefined;
    this.knob.style.transform = "";
    setFlag(this.stick, "data-active", false);
    this.app.session.stopHero();
  }
}
