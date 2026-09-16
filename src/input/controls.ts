import type { GameApp } from "../app/game-app";
import type { CanvasRenderer } from "../render/renderer";
import { POWER_KEYS } from "../ui/hud";

/**
 * Pointer and keyboard bindings. Every gesture maps to a single app or
 * session method; no game rule is decided here. Returns a disposer.
 */
export function bindControls(
  canvas: HTMLCanvasElement,
  renderer: CanvasRenderer,
  app: GameApp,
  keyTarget: Window,
): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  const { session } = app;
  const playing = (): boolean => app.screen.kind === "game" && app.overlay === undefined;

  // Movement keys are held, not tapped: the pressed set becomes one direction vector.
  const MOVE_KEYS: Readonly<Record<string, readonly [number, number]>> = {
    w: [0, -1],
    arrowup: [0, -1],
    s: [0, 1],
    arrowdown: [0, 1],
    a: [-1, 0],
    arrowleft: [-1, 0],
    d: [1, 0],
    arrowright: [1, 0],
  };
  const held = new Set<string>();
  const steer = (): void => {
    let dx = 0;
    let dy = 0;
    for (const key of held) {
      const [x, y] = MOVE_KEYS[key] ?? [0, 0];
      dx += x;
      dy += y;
    }
    const length = Math.hypot(dx, dy) || 1;
    const world = renderer.worldDirection(dx / length, dy / length);
    if (dx === 0 && dy === 0) session.stopHero();
    else session.moveHero(world.x, world.y);
  };
  const letGo = (): void => {
    held.clear();
    session.stopHero();
  };

  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "mouse" && playing())
        session.setHover(renderer.cellAt(event.clientX, event.clientY));
    },
    { signal },
  );

  canvas.addEventListener(
    "pointerleave",
    (event) => {
      if (event.pointerType === "mouse") session.setHover(undefined);
    },
    { signal },
  );

  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || !playing()) return;
      const cell = renderer.cellAt(event.clientX, event.clientY);
      session.setHover(cell);
      if (cell) session.activateCell(cell);
    },
    { signal },
  );

  canvas.addEventListener(
    "contextmenu",
    (event) => {
      event.preventDefault();
      session.cancel();
    },
    { signal },
  );

  keyTarget.addEventListener(
    "keydown",
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement) return;
      // Let a focused button handle its own activation keys.
      if (target instanceof HTMLButtonElement && (event.key === " " || event.key === "Enter"))
        return;

      const key = event.key.toLowerCase();
      if (key === "escape") {
        if (playing() && session.selection.kind !== "none") session.cancel();
        else app.back();
        return;
      }
      if (!playing()) return;

      if (key in MOVE_KEYS) {
        event.preventDefault();
        if (!held.has(key)) {
          held.add(key);
          steer();
        }
        return;
      }
      if (key === "shift") {
        if (!event.repeat) session.dash();
        return;
      }
      if (key === "r") {
        session.nova();
        return;
      }

      const tower = session.content.towers.find((t) => t.hotkey === event.key);
      if (tower) {
        session.selectBuild(tower.id);
        return;
      }
      const power = session.content.powers[POWER_KEYS.indexOf(key)];
      if (power) {
        session.selectPower(power.id);
        return;
      }
      switch (key) {
        case " ":
          event.preventDefault();
          session.startWave();
          break;
        case "u":
          session.upgradeSelected();
          break;
        case "x":
          session.sellSelected();
          break;
        case "p":
          app.openOverlay("pause");
          break;
        case "f":
          session.cycleSpeed();
          break;
      }
    },
    { signal },
  );

  keyTarget.addEventListener(
    "keyup",
    (event) => {
      const key = event.key.toLowerCase();
      if (held.delete(key)) steer();
    },
    { signal },
  );
  keyTarget.addEventListener("blur", letGo, { signal });

  return () => {
    controller.abort();
  };
}
