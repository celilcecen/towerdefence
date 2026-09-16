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
        case "s":
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

  return () => {
    controller.abort();
  };
}
