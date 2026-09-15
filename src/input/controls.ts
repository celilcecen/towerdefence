import type { GameSession } from "../app/session";
import type { CanvasRenderer } from "../render/renderer";

/**
 * Pointer and keyboard bindings. Every gesture maps to a single session
 * method; no game rule is decided here. Returns a disposer.
 */
export function bindControls(
  canvas: HTMLCanvasElement,
  renderer: CanvasRenderer,
  session: GameSession,
  keyTarget: Window,
): () => void {
  const controller = new AbortController();
  const { signal } = controller;

  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "mouse")
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
      if (event.button !== 0) return;
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

  const hotkeys = new Map(session.simulation.content.towers.map((t) => [t.hotkey, t.id]));

  keyTarget.addEventListener(
    "keydown",
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Let a focused button handle its own activation keys.
      if (event.target instanceof HTMLButtonElement && (event.key === " " || event.key === "Enter"))
        return;

      const tower = hotkeys.get(event.key);
      if (tower) {
        session.selectBuild(tower);
        return;
      }
      switch (event.key.toLowerCase()) {
        case "escape":
          session.cancel();
          break;
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
          session.togglePause();
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
