import "../styles.css";
import { GAME_CONTENT } from "../content";
import { ContentRegistry } from "../core/content-registry";
import { bindControls } from "../input/controls";
import { browserStorage, LocalRecordStore } from "../platform/local-record-store";
import { Effects } from "../render/effects";
import { CanvasRenderer } from "../render/renderer";
import { requireElement } from "../ui/dom";
import { GameUi } from "../ui/game-ui";
import { GameLoop } from "./game-loop";
import { GameSession } from "./session";

/** Composition root: the only place that knows about every concrete adapter. */
function main(): void {
  const canvas = requireElement(document, "#board", HTMLCanvasElement);
  const stage = requireElement(document, "#stage", HTMLElement);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const content = new ContentRegistry(GAME_CONTENT);
  const session = new GameSession(
    content,
    new LocalRecordStore(browserStorage(window)),
    () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1,
  );

  const renderer = new CanvasRenderer(canvas);
  const effects = new Effects(reducedMotion, () => performance.now());
  let detachEffects = effects.attach(session.simulation.events);
  session.events.on("restarted", ({ simulation }) => {
    detachEffects();
    effects.clear();
    detachEffects = effects.attach(simulation.events);
  });

  const ui = new GameUi(document, session);

  const fit = (): void => {
    const { grid } = session.simulation;
    renderer.resize(
      stage.clientWidth,
      stage.clientHeight,
      window.devicePixelRatio || 1,
      grid.width,
      grid.height,
    );
  };
  new ResizeObserver(fit).observe(stage);
  fit();

  const loop = new GameLoop(
    () => {
      session.step();
    },
    (alpha) => {
      renderer.draw({
        simulation: session.simulation,
        selection: session.selection,
        hover: session.hover,
        alpha,
        now: performance.now(),
        effects,
        animatePath: !reducedMotion,
      });
      ui.render();
    },
    session,
    {
      request: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => {
        cancelAnimationFrame(handle);
      },
    },
  );

  bindControls(canvas, renderer, session, window);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && session.started && !session.paused && !session.simulation.isOver) {
      session.togglePause();
    }
  });

  loop.start();
}

main();
