import { describe, expect, it, vi } from "vitest";
import type { Store } from "../src/app/game-app";
import { GameApp } from "../src/app/game-app";
import type { FrameScheduler } from "../src/app/game-loop";
import { GameLoop } from "../src/app/game-loop";
import { GameSession } from "../src/app/session";
import type { Settings } from "../src/app/settings";
import { DEFAULT_SETTINGS, parseSettings, resolveLanguage } from "../src/app/settings";
import { ContentRegistry } from "../src/core/content-registry";
import type { CampaignDef, LevelDef, MapDef, PowerDef, TowerDef } from "../src/core/content-types";
import type { Progress } from "../src/core/progress";
import { EMPTY_PROGRESS } from "../src/core/progress";
import type { BestRecord, RecordStore } from "../src/core/records";
import { TICK_SECONDS } from "../src/core/tick";
import { JsonStore } from "../src/platform/json-store";
import { browserStorage, LocalRecordStore, RECORD_KEY } from "../src/platform/local-record-store";
import { computeLayout, pointToCell, toScreen } from "../src/render/layout";
import { makeContent, mutableWorld, singleWave, TEST_ENEMY, TEST_TOWER } from "./support/fixtures";

describe("GameLoop", () => {
  const setup = (control = { speed: 1, paused: false }) => {
    const tick = vi.fn();
    const render = vi.fn<(alpha: number) => void>();
    const loop = new GameLoop(tick, render, control, { request: vi.fn(), cancel: vi.fn() });
    return { loop, tick, render, control };
  };
  const ms = (seconds: number): number => seconds * 1000;

  it("advances in fixed ticks and hands the remainder to the renderer", () => {
    const { loop, tick, render } = setup();
    loop.advance(0);
    expect(tick).not.toHaveBeenCalled();

    loop.advance(ms(TICK_SECONDS * 3.5));
    expect(tick).toHaveBeenCalledTimes(3);
    expect(render.mock.lastCall?.[0]).toBeCloseTo(0.5, 5);
  });

  it("scales simulated time by speed", () => {
    const { loop, tick } = setup({ speed: 3, paused: false });
    loop.advance(0);
    loop.advance(ms(TICK_SECONDS * 2.01));
    expect(tick).toHaveBeenCalledTimes(6);
  });

  it("keeps rendering but stops ticking while paused", () => {
    const { loop, tick, render } = setup({ speed: 1, paused: true });
    loop.advance(0);
    loop.advance(ms(1));
    expect(tick).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("caps catch-up after a long stall and ignores clocks running backwards", () => {
    const { loop, tick } = setup();
    loop.advance(ms(100));
    loop.advance(ms(90));
    expect(tick).not.toHaveBeenCalled();
    loop.advance(ms(200));
    expect(tick).toHaveBeenCalledTimes(Math.floor(0.25 / TICK_SECONDS));
  });

  it("schedules itself until stopped", () => {
    let pending: ((time: number) => void) | undefined;
    const request = vi.fn((callback: (time: number) => void) => {
      pending = callback;
      return 7;
    });
    const cancel = vi.fn();
    const scheduler: FrameScheduler = { request, cancel };
    const loop = new GameLoop(vi.fn(), vi.fn(), { speed: 1, paused: false }, scheduler);

    loop.start();
    loop.start();
    expect(request).toHaveBeenCalledTimes(1);
    pending?.(16);
    expect(request).toHaveBeenCalledTimes(2);

    loop.stop();
    expect(loop.running).toBe(false);
    expect(cancel).toHaveBeenCalledWith(7);
    loop.stop();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

const METEOR: PowerDef = {
  id: "meteor",
  name: "Meteor",
  summary: "Test strike.",
  cooldown: 10,
  spec: { kind: "strike", damage: 100, radius: 1 },
};

const CHILL: PowerDef = {
  id: "chill",
  name: "Chill",
  summary: "Test freeze.",
  cooldown: 5,
  spec: { kind: "freeze", slow: { factor: 0.5, duration: 2 } },
};

const corridor: MapDef = { id: "m", name: "m", rows: ["S...E", "....."] };

describe("GameSession", () => {
  const create = (overrides: Parameters<typeof makeContent>[0] = {}) => {
    let seed = 0;
    const session = new GameSession(
      new ContentRegistry(makeContent({ map: corridor, powers: [METEOR, CHILL], ...overrides })),
      () => ++seed,
    );
    const errors: string[] = [];
    session.events.on("rejected", ({ error }) => errors.push(error));
    return { session, errors };
  };
  const untilWave = (session: GameSession) => {
    session.startWave();
    session.step();
  };

  it("ignores gameplay input until the game starts", () => {
    const { session } = create();
    session.selectBuild("gun");
    session.activateCell({ x: 1, y: 1 });
    session.startWave();
    session.step();
    session.togglePause();
    session.selectPower("chill");
    expect(session.simulation.world.towers).toHaveLength(0);
    expect(session.simulation.world.tick).toBe(0);
    expect(session.paused).toBe(false);

    session.start();
    session.step();
    expect(session.simulation.world.tick).toBe(1);
  });

  it("builds in build mode, toggles the tool and reports refused placements", () => {
    const { session, errors } = create();
    session.start();

    session.selectBuild("unknown");
    expect(session.selection).toEqual({ kind: "none" });
    session.selectBuild("gun");
    session.activateCell({ x: 1, y: 1 });
    expect(session.simulation.world.towers).toHaveLength(1);
    expect(session.selection).toEqual({ kind: "build", tower: "gun" });

    session.activateCell({ x: 0, y: 0 });
    expect(errors).toEqual(["not-buildable"]);

    session.selectBuild("gun");
    expect(session.selection).toEqual({ kind: "none" });
  });

  it("inspects, upgrades, retargets and sells the tower under the cursor", () => {
    const { session } = create();
    session.start();
    session.selectBuild("gun");
    session.activateCell({ x: 2, y: 1 });
    session.cancel();

    session.activateCell({ x: 2, y: 1 });
    expect(session.selectedTower?.x).toBe(2);

    session.upgradeSelected();
    session.setTargeting("closest");
    expect(session.selectedTower).toMatchObject({ level: 1, targeting: "closest" });

    session.sellSelected();
    expect(session.simulation.world.towers).toHaveLength(0);
    expect(session.selection).toEqual({ kind: "none" });

    session.activateCell({ x: 3, y: 1 });
    expect(session.selection).toEqual({ kind: "none" });
    session.upgradeSelected();
    session.sellSelected();
    session.setTargeting("last");
    expect(session.selectedTower).toBeUndefined();
  });

  it("freezes the simulation and board input while paused, and cycles speed", () => {
    const { session } = create();
    session.start();
    session.togglePause();
    expect(session.paused).toBe(true);
    session.step();
    session.selectBuild("gun");
    session.activateCell({ x: 1, y: 1 });
    session.startWave();
    expect(session.simulation.world.tick).toBe(0);
    expect(session.simulation.world.towers).toHaveLength(0);
    expect(session.simulation.world.phase).toBe("building");
    session.setPaused(false);
    expect([1, 2, 3].map(() => (session.cycleSpeed(), session.speed))).toEqual([2, 3, 1]);
  });

  it("aims targeted powers, casts on tap and refuses them when unavailable", () => {
    const { session, errors } = create();
    session.start();
    session.selectPower("meteor");
    expect(errors).toEqual(["no-wave-active"]);

    untilWave(session);
    session.selectPower("meteor");
    expect(session.selection).toEqual({ kind: "power", power: "meteor" });
    session.selectPower("meteor");
    expect(session.selection).toEqual({ kind: "none" });

    session.selectPower("meteor");
    session.activateCell({ x: 0, y: 0 });
    expect(session.selection).toEqual({ kind: "none" });
    expect(session.powerState("meteor")?.cooldown).toBe(10);
    expect(session.simulation.world.enemies[0]?.status).toBe("killed");

    session.selectPower("meteor");
    expect(errors.at(-1)).toBe("power-not-ready");
    session.selectPower("nope");
    expect(session.selection).toEqual({ kind: "none" });
  });

  it("keeps aiming when a strike is refused, and fires untargeted powers at once", () => {
    const { session, errors } = create();
    session.start();
    untilWave(session);
    session.selectPower("meteor");
    session.simulation.apply({ type: "castPower", power: "chill", x: 0, y: 0 });
    mutableWorld(session.simulation).powers[0]!.cooldown = 3;
    session.activateCell({ x: 1, y: 1 });
    expect(errors).toEqual(["power-not-ready"]);
    expect(session.selection).toEqual({ kind: "power", power: "meteor" });

    const fresh = create();
    fresh.session.start();
    untilWave(fresh.session);
    fresh.session.selectPower("chill");
    expect(fresh.session.powerState("chill")?.cooldown).toBe(5);
    expect(fresh.session.simulation.world.enemies[0]?.slowFactor).toBe(0.5);
  });

  it("reports the outcome once and restarts with a fresh seed", () => {
    const { session } = create();
    const finished = vi.fn();
    const loaded = vi.fn();
    session.events.on("finished", finished);
    session.events.on("loaded", loaded);
    session.setHover({ x: 1, y: 0 });
    expect(session.hover).toEqual({ x: 1, y: 0 });

    session.start();
    session.startWave();
    for (let i = 0; i < 1000 && !session.simulation.isOver; i++) session.step();

    expect(session.outcome).toEqual({ won: true, wave: 1, lives: 8 });
    expect(finished).toHaveBeenCalledExactlyOnceWith({ won: true, wave: 1, lives: 8 });
    session.togglePause();
    expect(session.paused).toBe(false);

    session.restart();
    expect(loaded).toHaveBeenCalledOnce();
    expect(session.outcome).toBeUndefined();
    expect(session.started).toBe(true);
    expect(session.simulation.seed).toBe(2);
  });

  it("loads different content and waits for start", () => {
    const { session } = create();
    session.start();
    const other = new ContentRegistry(makeContent({ map: { id: "o", name: "o", rows: ["S.E"] } }));
    session.load(other);
    expect(session.content).toBe(other);
    expect(session.started).toBe(false);
    expect(session.simulation.grid.width).toBe(3);
  });
});

class MemoryStore<T> implements Store<T> {
  readonly saved: T[] = [];
  constructor(private value: T) {}
  load(): T {
    return this.value;
  }
  save(value: T): void {
    this.value = value;
    this.saved.push(value);
  }
}

class MemoryRecords implements RecordStore {
  readonly saved: BestRecord[] = [];
  constructor(private readonly initial?: BestRecord) {}
  load(): BestRecord | undefined {
    return this.initial;
  }
  save(record: BestRecord): void {
    this.saved.push(record);
  }
}

describe("GameApp", () => {
  const level = (id: string): LevelDef => ({
    id,
    map: { id: `${id}-map`, name: id, rows: ["S....E", "......"] },
    waves: [singleWave()],
    towers: ["gun"],
    powers: [],
    startingGold: 100,
    startingLives: 10,
  });
  const campaign: CampaignDef = {
    towers: [TEST_TOWER],
    enemies: [TEST_ENEMY],
    powers: [],
    heroes: [],
    rules: { sellRefundRatio: 0.5, minDamageRatio: 0.2, earlyCallRatio: 0.5 },
    chapters: [
      { id: "one", theme: "frost", levels: [level("l1"), level("l2")] },
      { id: "two", theme: "ash", levels: [level("l3")] },
    ],
  };

  const create = (progress: Progress = EMPTY_PROGRESS, classicBest?: BestRecord) => {
    const stores = {
      progress: new MemoryStore(progress),
      settings: new MemoryStore<Settings>(DEFAULT_SETTINGS),
      classic: new MemoryRecords(classicBest),
    };
    let seed = 0;
    const app = new GameApp(campaign, makeContent(), stores, () => ++seed);
    const loaded: string[] = [];
    app.events.on("gameLoaded", ({ theme }) => loaded.push(theme));
    return { app, stores, loaded };
  };

  /** Plays the loaded level to the end, with a tower that kills everything when `defend`. */
  const playOut = (app: GameApp, defend: boolean) => {
    if (defend) app.session.simulation.apply({ type: "placeTower", tower: "gun", x: 2, y: 1 });
    app.session.startWave();
    for (let i = 0; i < 2000 && !app.session.simulation.isOver; i++) app.session.step();
  };

  it("starts at home and only opens unlocked levels", () => {
    const { app } = create();
    expect(app.screen).toEqual({ kind: "home" });
    expect(app.continueLevelId).toBe("l1");
    expect(app.theme).toBe("meadow");
    app.openBriefing("l2");
    app.openBriefing("missing");
    app.startLevel("l2");
    expect(app.screen).toEqual({ kind: "home" });
  });

  it("loads a level idle behind its briefing, then plays it", () => {
    const { app, loaded } = create();
    app.openMap();
    expect(app.screen).toEqual({ kind: "map" });
    app.startBriefedLevel();
    expect(app.screen).toEqual({ kind: "map" });

    app.continueCampaign();
    expect(app.screen).toEqual({ kind: "briefing", levelId: "l1" });
    expect(app.session.started).toBe(false);
    expect(app.session.content.map.id).toBe("l1-map");
    expect(loaded).toEqual(["frost"]);

    app.startBriefedLevel();
    expect(app.screen).toEqual({ kind: "game" });
    expect(app.session.started).toBe(true);
  });

  it("records stars for a win, unlocks the next level and offers it", () => {
    const { app, stores } = create();
    const results = vi.fn();
    app.events.on("result", results);
    app.startLevel("l1");
    playOut(app, true);

    const screen = app.screen;
    expect(screen.kind).toBe("result");
    expect(screen.kind === "result" && screen.result).toMatchObject({
      won: true,
      stars: 3,
      improved: true,
      nextLevelId: "l2",
    });
    expect(results).toHaveBeenCalledOnce();
    expect(stores.progress.saved.at(-1)?.levels["l1"]).toEqual({ stars: 3, bestLives: 10 });
    expect(app.isUnlocked("l2")).toBe(true);

    app.nextLevel();
    expect(app.screen).toEqual({ kind: "briefing", levelId: "l2" });
  });

  it("earns nothing for a loss and never lowers saved progress", () => {
    const saved: Progress = { levels: { l1: { stars: 3, bestLives: 10 } } };
    const { app, stores } = create(saved);
    app.startLevel("l1");
    mutableWorld(app.session.simulation).lives = 1;
    playOut(app, false);

    const screen = app.screen;
    expect(screen.kind === "result" && screen.result).toMatchObject({
      won: false,
      stars: 0,
      improved: false,
      nextLevelId: undefined,
    });
    expect(stores.progress.saved).toHaveLength(0);
    app.nextLevel();
    expect(app.screen.kind).toBe("result");

    app.retry();
    expect(app.screen).toEqual({ kind: "game" });
    expect(app.session.started).toBe(true);
    app.startLevel("l1");
    playOut(app, false);
    expect(app.progress).toBe(saved);
  });

  it("ends the campaign with no next level after the final win", () => {
    const progress: Progress = {
      levels: { l1: { stars: 1, bestLives: 2 }, l2: { stars: 1, bestLives: 2 } },
    };
    const { app } = create(progress);
    expect(app.continueLevelId).toBe("l3");
    app.startLevel("l3");
    expect(app.theme).toBe("ash");
    playOut(app, true);
    const screen = app.screen;
    expect(screen.kind === "result" && screen.result.nextLevelId).toBeUndefined();
    expect(app.continueLevelId).toBe("l3");
  });

  it("keeps the best classic result and quits classic to the home screen", () => {
    const { app, stores } = create(EMPTY_PROGRESS, { wave: 1, won: true, lives: 10 });
    app.startClassic();
    expect(app.mode).toEqual({ kind: "classic" });
    playOut(app, false);
    const screen = app.screen;
    expect(screen.kind === "result" && screen.result).toMatchObject({ stars: 0, improved: false });
    expect(stores.classic.saved).toHaveLength(0);

    app.quit();
    expect(app.screen).toEqual({ kind: "home" });

    const fresh = create();
    fresh.app.startClassic();
    playOut(fresh.app, false);
    expect(fresh.stores.classic.saved).toEqual([{ wave: 1, won: true, lives: 8 }]);
    expect(fresh.app.classicBest).toEqual({ wave: 1, won: true, lives: 8 });
  });

  it("stacks dialogs, pausing the game while any is open", () => {
    const { app } = create();
    app.openOverlay("pause");
    expect(app.overlay).toBeUndefined();

    app.startLevel("l1");
    app.openOverlay("pause");
    app.openOverlay("pause");
    app.openOverlay("settings");
    expect(app.overlay).toBe("settings");
    expect(app.session.paused).toBe(true);
    app.closeOverlay();
    expect(app.overlay).toBe("pause");
    expect(app.session.paused).toBe(true);
    app.closeOverlay();
    expect(app.session.paused).toBe(false);

    app.openOverlay("help");
    app.quit();
    expect(app.screen).toEqual({ kind: "map" });
    expect(app.overlay).toBeUndefined();
    expect(app.session.started).toBe(false);
  });

  it("follows the system back gesture one step at a time", () => {
    const { app } = create();
    expect(app.back()).toBe(false);
    app.openOverlay("settings");
    expect(app.back()).toBe(true);
    expect(app.overlay).toBeUndefined();

    app.openMap();
    app.back();
    expect(app.screen).toEqual({ kind: "home" });

    app.openBriefing("l1");
    app.back();
    expect(app.screen).toEqual({ kind: "map" });

    app.startLevel("l1");
    app.back();
    expect(app.overlay).toBe("pause");
    app.back();
    playOut(app, true);
    app.back();
    expect(app.screen).toEqual({ kind: "map" });
  });

  it("pauses a running game when the app is backgrounded, and only then", () => {
    const { app } = create();
    app.suspend();
    expect(app.overlay).toBeUndefined();
    app.startLevel("l1");
    app.suspend();
    expect(app.overlay).toBe("pause");
    expect(app.session.paused).toBe(true);
  });

  it("saves settings, announces them and resets progress", () => {
    const { app, stores } = create({ levels: { l1: { stars: 2, bestLives: 6 } } });
    const changed = vi.fn();
    app.events.on("settingsChanged", changed);
    app.updateSettings({ music: 0.1, language: "tr" });
    expect(app.settings).toMatchObject({ music: 0.1, language: "tr", sfx: DEFAULT_SETTINGS.sfx });
    expect(stores.settings.saved).toHaveLength(1);
    expect(changed).toHaveBeenCalledOnce();

    app.resetProgress();
    expect(app.progress).toEqual(EMPTY_PROGRESS);
    expect(app.isUnlocked("l2")).toBe(false);
    expect(app.levels).toHaveLength(3);
  });
});

describe("settings", () => {
  it("parses stored settings field by field", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ sfx: 0.2, music: 2, haptics: "yes", language: "tr" })).toEqual({
      sfx: 0.2,
      music: DEFAULT_SETTINGS.music,
      haptics: DEFAULT_SETTINGS.haptics,
      language: "tr",
    });
    expect(parseSettings({ sfx: Number.NaN, haptics: false, language: "de" })).toEqual({
      ...DEFAULT_SETTINGS,
      haptics: false,
    });
  });

  it("follows an explicit language, then the device, then English", () => {
    expect(resolveLanguage({ language: "en" }, ["tr-TR"])).toBe("en");
    expect(resolveLanguage({ language: undefined }, ["de-DE", "tr-TR"])).toBe("tr");
    expect(resolveLanguage({ language: undefined }, ["TR"])).toBe("tr");
    expect(resolveLanguage({ language: undefined }, ["fr"])).toBe("en");
  });
});

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    data,
  };
};

const failing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
};

describe("JsonStore", () => {
  const parse = (value: unknown): number => (typeof value === "number" ? value : -1);

  it("round-trips a value through its parser", () => {
    const storage = memory();
    const store = new JsonStore(storage, "k", parse);
    store.save(42);
    expect(storage.data.get("k")).toBe("42");
    expect(store.load()).toBe(42);
  });

  it("hands the parser nothing when data is missing, corrupt or unreadable", () => {
    expect(new JsonStore(memory(), "k", parse).load()).toBe(-1);
    expect(new JsonStore(memory({ k: "{not json" }), "k", parse).load()).toBe(-1);
    expect(new JsonStore(failing, "k", parse).load()).toBe(-1);
    expect(new JsonStore(undefined, "k", parse).load()).toBe(-1);
    expect(() => {
      new JsonStore(failing, "k", parse).save(1);
    }).not.toThrow();
  });
});

describe("LocalRecordStore", () => {
  it("round-trips a record", () => {
    const storage = memory();
    const store = new LocalRecordStore(storage);
    store.save({ wave: 4, won: false, lives: 2 });
    expect(storage.data.get(RECORD_KEY)).toBe('{"wave":4,"won":false,"lives":2}');
    expect(store.load()).toEqual({ wave: 4, won: false, lives: 2 });
  });

  it.each([["not json"], ['{"wave":"4"}'], [""]])("treats %j as no record", (raw) => {
    expect(new LocalRecordStore(memory({ [RECORD_KEY]: raw })).load()).toBeUndefined();
  });

  it("survives missing or failing storage", () => {
    expect(new LocalRecordStore(undefined).load()).toBeUndefined();
    expect(new LocalRecordStore(failing).load()).toBeUndefined();
    expect(() => {
      new LocalRecordStore(failing).save({ wave: 1, won: false, lives: 1 });
    }).not.toThrow();
  });

  it("resolves browser storage defensively", () => {
    const storage = memory() as unknown as Storage;
    expect(browserStorage({ localStorage: storage })).toBe(storage);
    const hostile = Object.defineProperty({}, "localStorage", {
      get: () => {
        throw new Error("SecurityError");
      },
    }) as { localStorage: Storage };
    expect(browserStorage(hostile)).toBeUndefined();
  });
});

describe("board layout", () => {
  it("fits whole-pixel cells and centres the board", () => {
    const layout = computeLayout(400, 300, 18, 11);
    expect(layout.cellSize).toBe(21);
    expect(layout.offsetX).toBe(11);
    expect(layout.offsetY).toBe(35);
    expect(computeLayout(10, 10, 18, 11).cellSize).toBe(8);
  });

  it("maps points to cells and back", () => {
    const layout = computeLayout(400, 300, 18, 11);
    expect(pointToCell(layout, 11, 35)).toEqual({ x: 0, y: 0 });
    expect(pointToCell(layout, 11 + 21 * 17 + 20, 35 + 21 * 10 + 20)).toEqual({ x: 17, y: 10 });
    expect(pointToCell(layout, 10, 35)).toBeUndefined();
    expect(pointToCell(layout, 11 + 21 * 18, 40)).toBeUndefined();
    expect(pointToCell(layout, 20, 34)).toBeUndefined();
    expect(pointToCell(layout, 20, 35 + 21 * 11)).toBeUndefined();
    expect(toScreen(layout, 1, 2)).toEqual({ x: 32, y: 77 });
  });

  it("rotates the board on tall screens when that makes cells clearly bigger", () => {
    expect(computeLayout(400, 300, 18, 11).rotated).toBe(false);
    expect(computeLayout(412, 440, 18, 11).rotated).toBe(false);

    const tall = computeLayout(412, 650, 18, 11);
    expect(tall).toMatchObject({ rotated: true, cellSize: 35, offsetX: 14, offsetY: 10 });

    // Spawn side at the top, exit side at the bottom.
    expect(toScreen(tall, 0, 0)).toEqual({ x: 14 + 11 * 35, y: 10 });
    expect(pointToCell(tall, 381.5, 27.5)).toEqual({ x: 0, y: 0 });
    expect(pointToCell(tall, 31.5, 622.5)).toEqual({ x: 17, y: 10 });
    expect(pointToCell(tall, 10, 27)).toBeUndefined();
    expect(pointToCell(tall, 200, 5)).toBeUndefined();
  });

  it("round-trips every cell centre through the screen in both orientations", () => {
    for (const layout of [computeLayout(900, 500, 18, 11), computeLayout(412, 650, 18, 11)]) {
      for (let y = 0; y < 11; y++) {
        for (let x = 0; x < 18; x++) {
          const p = toScreen(layout, x + 0.5, y + 0.5);
          expect(pointToCell(layout, p.x, p.y)).toEqual({ x, y });
        }
      }
    }
  });
});

export type { TowerDef };
