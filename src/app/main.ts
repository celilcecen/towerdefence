import "../styles.css";
import { GameAudio } from "../audio/game-audio";
import { webAudioBackend } from "../audio/web-audio";
import { CAMPAIGN, GAME_CONTENT } from "../content";
import { STORY_BEATS } from "../content/story";
import { parseProgress } from "../core/progress";
import { stringsFor } from "../i18n";
import { bindControls } from "../input/controls";
import { JsonStore } from "../platform/json-store";
import { browserStorage, LocalRecordStore } from "../platform/local-record-store";
import type { HapticKind, NativeShell } from "../platform/native";
import { createNativeShell } from "../platform/native";
import { Effects } from "../render/effects";
import { TurretAim } from "../render/motion";
import { CanvasRenderer } from "../render/renderer";
import { canvasSurface } from "../render/surface";
import { requireElement } from "../ui/dom";
import { CoachUi, DialogueUi } from "../ui/coach-ui";
import { SceneUi } from "../ui/scene-ui";
import { GameHud } from "../ui/hud";
import { ScreensUi } from "../ui/screens";
import { translateDom } from "../ui/translate";
import { Coach, parseSeen } from "./coach";
import type { AppStores } from "./game-app";
import { GameApp } from "./game-app";
import { GameLoop } from "./game-loop";
import { parseSettings, resolveLanguage } from "./settings";
import { APP_VERSION } from "./version";

export const PROGRESS_KEY = "gridlock.progress.v1";
export const SETTINGS_KEY = "gridlock.settings.v1";
export const COACH_KEY = "gridlock.coach.v1";

/** Composition root: the only place that knows about every concrete adapter. */
function main(): void {
  const canvas = requireElement(document, "#board", HTMLCanvasElement);
  const stage = requireElement(document, "#stage", HTMLElement);
  const appRoot = requireElement(document, "#app", HTMLElement);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clock = (): number => performance.now();
  const pixelRatio = (): number => window.devicePixelRatio || 1;

  const storage = browserStorage(window);
  const stores: AppStores = {
    progress: new JsonStore(storage, PROGRESS_KEY, parseProgress),
    settings: new JsonStore(storage, SETTINGS_KEY, parseSettings),
    classic: new LocalRecordStore(storage),
  };
  const app = new GameApp(
    CAMPAIGN,
    GAME_CONTENT,
    stores,
    () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1,
  );
  const { session } = app;

  let strings = stringsFor(resolveLanguage(app.settings, navigator.languages));
  translateDom(document, strings);

  const renderer = new CanvasRenderer(canvas, canvasSurface);
  const effects = new Effects(reducedMotion, clock);
  const aim = new TurretAim(clock);
  const audio = new GameAudio(webAudioBackend(), clock);
  audio.setSettings(app.settings);
  let native: NativeShell | undefined;
  const haptic = (kind: HapticKind): void => {
    if (app.settings.haptics) native?.haptic(kind);
  };

  const dialogue = new DialogueUi(document, pixelRatio(), strings);

  const attachVisuals = (): (() => void) => {
    const { events } = session.simulation;
    const detachers = [
      events.on("waveStarted", ({ wave }) => {
        const { mode } = app;
        if (mode.kind !== "campaign") return;
        const beat = STORY_BEATS[mode.levelId]?.find((b) => b.wave === wave);
        if (beat) dialogue.show(mode.levelId, beat);
      }),
      effects.attach(events),
      aim.attach(events),
      audio.attach(
        events,
        (id) => session.simulation.world.towers.find((t) => t.id === id)?.def.id,
      ),
      events.on("towerPlaced", () => {
        haptic("light");
      }),
      events.on("towerUpgraded", () => {
        haptic("medium");
      }),
      events.on("enemyLeaked", () => {
        haptic("heavy");
      }),
      events.on("powerCast", () => {
        haptic("heavy");
      }),
      events.on("gameOver", ({ won }) => {
        haptic(won ? "success" : "warning");
      }),
    ];
    return () => {
      for (const detach of detachers) detach();
    };
  };
  let detachVisuals = attachVisuals();

  const hud = new GameHud(document, app, pixelRatio(), strings);
  const screens = new ScreensUi(document, app, pixelRatio(), strings, {
    version: APP_VERSION,
    notify: (message) => {
      hud.showNotice(message);
    },
    onStar: (index) => {
      audio.play("star", index / 2);
      haptic("light");
    },
  });

  const scenes = new SceneUi(document, app, reducedMotion);
  const coach = new Coach(app, new JsonStore(storage, COACH_KEY, parseSeen));
  const coachUi = new CoachUi(document, coach, renderer, pixelRatio(), strings);
  requireElement(document, "#set-replay", HTMLButtonElement).addEventListener("click", () => {
    coach.reset();
    hud.showNotice(strings.coach.replayed);
  });

  const fit = (): void => {
    const { grid } = session.simulation;
    renderer.resize(stage.clientWidth, stage.clientHeight, pixelRatio(), grid.width, grid.height);
  };

  session.events.on("loaded", () => {
    detachVisuals();
    effects.clear();
    aim.clear();
    detachVisuals = attachVisuals();
    fit();
  });
  session.events.on("offGuide", () => {
    hud.showNotice(strings.coach.offGuide);
    audio.play("denied");
  });
  session.events.on("rejected", ({ error }) => {
    hud.showNotice(strings.errors[error]);
    audio.play("denied");
  });
  app.events.on("gameLoaded", ({ theme }) => {
    appRoot.dataset["theme"] = theme;
  });
  app.events.on("settingsChanged", ({ settings }) => {
    audio.setSettings(settings);
    const next = stringsFor(resolveLanguage(settings, navigator.languages));
    if (next === strings) return;
    strings = next;
    translateDom(document, strings);
    hud.setStrings(strings);
    screens.setStrings(strings);
    coachUi.setStrings(strings);
    dialogue.setStrings(strings);
  });

  new ResizeObserver(fit).observe(stage);
  fit();

  const loop = new GameLoop(
    () => {
      session.step();
    },
    (alpha) => {
      coach.update();
      const guide = coach.guide;
      session.setGuide(guide);
      if (app.screen.kind !== "game") dialogue.hide();
      renderer.draw({
        simulation: session.simulation,
        selection: session.selection,
        hover: session.hover,
        alpha,
        now: clock(),
        effects,
        aim,
        reducedMotion,
        theme: app.theme,
        guide: guide?.filter((cell) => session.simulation.grid.isBuildable(cell.x, cell.y)),
      });
      hud.render();
      screens.render();
      coachUi.render();
      scenes.render(clock(), pixelRatio());
      const inWave = app.screen.kind === "game" && session.simulation.world.phase === "wave";
      audio.setMusic(app.screen.kind === "home" ? "meadow" : app.theme, inWave ? 1 : 0);
    },
    session,
    {
      request: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => {
        cancelAnimationFrame(handle);
      },
    },
  );

  bindControls(canvas, renderer, app, window);

  // Browsers only allow sound after a user gesture; every gesture retries until it works.
  const unlock = (): void => {
    audio.unlock();
  };
  document.addEventListener("pointerdown", unlock, { capture: true });
  document.addEventListener("keydown", unlock, { capture: true });

  void createNativeShell(window).then((shell) => {
    native = shell;
    shell.onBack(() => app.back());
    shell.onPause(() => {
      app.suspend();
      audio.suspend();
    });
    shell.onResume(() => {
      audio.resume();
    });
    shell.ready();
  });

  loop.start();
}

main();
