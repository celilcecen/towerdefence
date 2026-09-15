import { describe, expect, it, vi } from "vitest";
import type { FrameScheduler } from "../src/app/game-loop";
import { GameLoop } from "../src/app/game-loop";
import { GameSession } from "../src/app/session";
import { ContentRegistry } from "../src/core/content-registry";
import type { BestRecord, RecordStore } from "../src/core/records";
import { TICK_SECONDS } from "../src/core/tick";
import { browserStorage, LocalRecordStore, RECORD_KEY } from "../src/platform/local-record-store";
import { computeLayout, pointToCell, toScreen } from "../src/render/layout";
import { makeContent, mutableWorld } from "./support/fixtures";

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

class MemoryStore implements RecordStore {
  saved: BestRecord[] = [];
  constructor(private readonly initial?: BestRecord) {}
  load(): BestRecord | undefined {
    return this.initial;
  }
  save(record: BestRecord): void {
    this.saved.push(record);
  }
}

describe("GameSession", () => {
  const corridor = { id: "m", name: "m", rows: ["S...E", "....."] };
  const create = (store: RecordStore = new MemoryStore()) => {
    let seed = 0;
    const session = new GameSession(
      new ContentRegistry(makeContent({ map: corridor })),
      store,
      () => ++seed,
    );
    const notices: string[] = [];
    session.events.on("notice", ({ message }) => notices.push(message));
    return { session, notices };
  };

  it("ignores gameplay input until the player presses play", () => {
    const { session } = create();
    session.selectBuild("gun");
    session.activateCell({ x: 1, y: 1 });
    session.startWave();
    session.step();
    session.togglePause();
    expect(session.simulation.world.towers).toHaveLength(0);
    expect(session.simulation.world.tick).toBe(0);
    expect(session.paused).toBe(false);

    session.play();
    session.step();
    expect(session.simulation.world.tick).toBe(1);
  });

  it("builds in build mode, toggles the tool and reports rejected placements", () => {
    const { session, notices } = create();
    session.play();

    session.selectBuild("unknown");
    expect(session.selection).toEqual({ kind: "none" });
    session.selectBuild("gun");
    session.activateCell({ x: 1, y: 1 });
    expect(session.simulation.world.towers).toHaveLength(1);
    expect(session.selection).toEqual({ kind: "build", tower: "gun" });

    session.activateCell({ x: 0, y: 0 });
    expect(notices).toEqual(["You can't build there."]);

    session.selectBuild("gun");
    expect(session.selection).toEqual({ kind: "none" });
  });

  it("inspects, upgrades, retargets and sells the tower under the cursor", () => {
    const { session } = create();
    session.play();
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

  it("controls pause and cycles speed", () => {
    const { session } = create();
    session.play();
    session.togglePause();
    expect(session.paused).toBe(true);
    expect([1, 2, 3].map(() => (session.cycleSpeed(), session.speed))).toEqual([2, 3, 1]);
  });

  it("records a new best on game over and restarts on play", () => {
    const store = new MemoryStore({ wave: 0, won: false, lives: 0 });
    const { session } = create(store);
    const restarted = vi.fn();
    session.events.on("restarted", restarted);
    session.setHover({ x: 1, y: 0 });
    expect(session.hover).toEqual({ x: 1, y: 0 });

    session.play();
    session.startWave();
    for (let i = 0; i < 1000 && !session.simulation.isOver; i++) session.step();

    expect(session.lastResult).toEqual({ wave: 1, won: true, lives: 8, newRecord: true });
    expect(store.saved).toEqual([{ wave: 1, won: true, lives: 8 }]);
    expect(session.best).toEqual({ wave: 1, won: true, lives: 8 });
    session.togglePause();
    expect(session.paused).toBe(false);

    session.play();
    expect(restarted).toHaveBeenCalledOnce();
    expect(session.lastResult).toBeUndefined();
    expect(session.simulation.seed).toBe(2);
  });

  it("does not overwrite a better record", () => {
    const store = new MemoryStore({ wave: 1, won: true, lives: 10 });
    const { session } = create(store);
    session.play();
    mutableWorld(session.simulation).lives = 1;
    session.startWave();
    for (let i = 0; i < 1000 && !session.simulation.isOver; i++) session.step();
    expect(session.lastResult?.newRecord).toBe(false);
    expect(store.saved).toHaveLength(0);
  });
});

describe("LocalRecordStore", () => {
  const memory = (initial: Record<string, string> = {}) => {
    const data = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v),
      data,
    };
  };

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
    const failing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
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
