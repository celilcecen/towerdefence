import { describe, expect, it, vi } from "vitest";
import type { Cue } from "../src/audio/cues";
import {
  BOSS_ENEMIES,
  CUE_EVENTS,
  CUES,
  EVENT_CUES,
  GAME_CUES,
  shotCue,
  UI_CUES,
} from "../src/audio/cues";
import type { AudioBackend } from "../src/audio/game-audio";
import { GameAudio } from "../src/audio/game-audio";
import type { CuePolicy } from "../src/audio/limiter";
import { CUE_POLICIES, VoiceLimiter } from "../src/audio/limiter";
import type { ThemeScore } from "../src/audio/themes";
import {
  hash01,
  midiToHz,
  notesAt,
  STEPS_PER_BAR,
  stepSeconds,
  THEME_IDS,
  THEMES,
  themeScore,
} from "../src/audio/themes";
import { ENEMIES } from "../src/content/enemies";
import { POWERS } from "../src/content/powers";
import { TOWERS } from "../src/content/towers";
import type { EnemyDef, PowerDef, TowerDef } from "../src/core/content-types";
import { EventBus } from "../src/core/events";
import type { GameEvents } from "../src/core/game-events";
import type { ProjectileState, TowerState } from "../src/core/state";
import { makeEnemy, TEST_ENEMY, TEST_TOWER } from "./support/fixtures";

const context = { towerKindOf: (id: number) => (id === 7 ? "mortar" : undefined) };

const find = <T extends { id: string }>(list: readonly T[], id: string): T =>
  list.find((item) => item.id === id)!;

const tower = (def: TowerDef = TEST_TOWER, level = 0): TowerState => ({
  id: 1,
  def,
  x: 0,
  y: 0,
  level,
  cooldown: 0,
  targeting: "first",
  invested: 10,
});

const projectile = (towerId: number, splashRadius: number): ProjectileState => ({
  id: 1,
  towerId,
  targetId: 1,
  damage: 1,
  speed: 1,
  splashRadius,
  hitsAir: true,
  x: 0,
  y: 0,
  prevX: 0,
  prevY: 0,
  aimX: 1,
  aimY: 1,
  done: false,
});

const enemyOf = (def: EnemyDef) => makeEnemy({ def });

describe("audio cues", () => {
  it("lists every game and UI cue exactly once", () => {
    expect(new Set(CUES).size).toBe(CUES.length);
    expect(CUES).toEqual([...GAME_CUES, ...UI_CUES]);
  });

  it("listens to every simulation event", () => {
    expect([...CUE_EVENTS].sort()).toEqual(Object.keys(EVENT_CUES).sort());
    expect(CUE_EVENTS).toContain("projectileFired");
  });

  it("picks shot sounds by tower kind, then by splash for unknown towers", () => {
    expect(shotCue("bolt", 0)).toBe("shot-bolt");
    expect(shotCue("cannon", 0)).toBe("shot-cannon");
    expect(shotCue("mortar", 0)).toBe("shot-mortar");
    expect(shotCue(undefined, 0)).toBe("shot-bolt");
    expect(shotCue("gun", 0.9)).toBe("shot-cannon");
    expect(shotCue(undefined, 1.5)).toBe("shot-mortar");
  });

  it("maps projectile shots through the tower lookup", () => {
    expect(EVENT_CUES.projectileFired({ projectile: projectile(7, 0) }, context)).toEqual([
      { cue: "shot-mortar", size: 0 },
    ]);
    expect(EVENT_CUES.projectileFired({ projectile: projectile(3, 0) }, context)).toEqual([
      { cue: "shot-bolt", size: 0 },
    ]);
  });

  it("maps tower, attack and wave events", () => {
    const t = tower();
    const cue = (plays: readonly { cue: Cue }[]) => plays.map((play) => play.cue);
    expect(cue(EVENT_CUES.towerPlaced({ tower: t }, context))).toEqual(["build"]);
    expect(EVENT_CUES.towerUpgraded({ tower: tower(TEST_TOWER, 2) }, context)).toEqual([
      { cue: "upgrade", size: 1 },
    ]);
    expect(cue(EVENT_CUES.towerSold({ tower: t, refund: 5 }, context))).toEqual(["sell"]);
    expect(cue(EVENT_CUES.beamFired({ tower: t, target: makeEnemy() }, context))).toEqual(["beam"]);
    expect(cue(EVENT_CUES.pulseFired({ tower: t, radius: 2 }, context))).toEqual(["frost"]);
    expect(
      EVENT_CUES.chainFired({ tower: t, targets: [makeEnemy(), makeEnemy()] }, context),
    ).toEqual([{ cue: "arc", size: 0.2 }]);
    expect(cue(EVENT_CUES.waveStarted({ wave: 1, early: false, bonus: 0 }, context))).toEqual([
      "wave-start",
    ]);
    expect(cue(EVENT_CUES.waveStarted({ wave: 2, early: true, bonus: 9 }, context))).toEqual([
      "wave-start",
      "coins",
    ]);
    expect(cue(EVENT_CUES.waveCleared({ wave: 1, bonus: 0 }, context))).toEqual(["wave-clear"]);
    expect(cue(EVENT_CUES.gameOver({ won: true }, context))).toEqual(["victory"]);
    expect(cue(EVENT_CUES.gameOver({ won: false }, context))).toEqual(["defeat"]);
  });

  it("scales explosions with their radius", () => {
    const small = EVENT_CUES.explosion({ x: 0, y: 0, radius: 0.5 }, context);
    const cannon = EVENT_CUES.explosion({ x: 0, y: 0, radius: 1.3 }, context);
    const huge = EVENT_CUES.explosion({ x: 0, y: 0, radius: 4 }, context);
    expect(small).toEqual([{ cue: "boom", size: 0 }]);
    expect(cannon[0]?.size).toBeCloseTo(0.5);
    expect(huge).toEqual([{ cue: "boom", size: 1 }]);
  });

  it("maps enemy events, with the boss treatment for the tyrant", () => {
    const tyrant = find(ENEMIES, "tyrant");
    expect(BOSS_ENEMIES.has(tyrant.id)).toBe(true);
    expect(EVENT_CUES.enemySpawned({ enemy: enemyOf(tyrant) }, context)).toEqual([
      { cue: "boss-arrive", size: 1 },
    ]);
    expect(EVENT_CUES.enemySpawned({ enemy: makeEnemy() }, context)).toEqual([]);
    expect(EVENT_CUES.enemyKilled({ enemy: enemyOf(tyrant), bounty: 1 }, context)).toEqual([
      { cue: "boss-down", size: 1 },
    ]);
    const brute = EVENT_CUES.enemyKilled(
      { enemy: enemyOf(find(ENEMIES, "brute")), bounty: 1 },
      context,
    );
    const broodling = EVENT_CUES.enemyKilled(
      { enemy: enemyOf(find(ENEMIES, "broodling")), bounty: 1 },
      context,
    );
    expect(brute[0]?.cue).toBe("pop");
    expect(broodling).toEqual([{ cue: "pop", size: 0 }]);
    expect(brute[0]?.size).toBeGreaterThan(0.5);
    expect(EVENT_CUES.enemyHit({ enemy: makeEnemy(), damage: 1 }, context)).toEqual([
      { cue: "hit", size: 0 },
    ]);
    expect(EVENT_CUES.enemyLeaked({ enemy: makeEnemy(), livesLost: 1 }, context)).toEqual([
      { cue: "leak", size: 0 },
    ]);
    expect(EVENT_CUES.enemyLeaked({ enemy: makeEnemy(), livesLost: 20 }, context)).toEqual([
      { cue: "leak", size: 1 },
    ]);
    expect(EVENT_CUES.enemySplit({ enemy: makeEnemy(), count: 3 }, context)).toEqual([
      { cue: "split", size: 0.5 },
    ]);
    expect(
      EVENT_CUES.enemyHealed({ healer: makeEnemy(), targets: [makeEnemy()] }, context),
    ).toEqual([{ cue: "heal", size: 0 }]);
  });

  it("maps powers by what they do, not by id", () => {
    const cast = (power: PowerDef) =>
      EVENT_CUES.powerCast({ power, x: 0, y: 0, targets: 3 }, context)[0]?.cue;
    expect(cast(find(POWERS, "meteor"))).toBe("meteor");
    expect(cast(find(POWERS, "frostbind"))).toBe("freeze");
  });

  it("knows every shipped tower kind", () => {
    for (const def of TOWERS) {
      const attack = def.levels[0].attack;
      if (attack.kind !== "projectile") continue;
      expect(shotCue(def.id, attack.splashRadius)).toBe(shotCue(undefined, attack.splashRadius));
    }
  });
});

describe("voice limiter", () => {
  const policies = (overrides: Partial<Record<Cue, CuePolicy>>) => ({
    ...CUE_POLICIES,
    ...overrides,
  });

  it("has a sane policy for every cue", () => {
    for (const cue of CUES) {
      const policy = CUE_POLICIES[cue];
      expect(policy.maxPerWindow).toBeGreaterThan(0);
      expect(policy.windowMs).toBeGreaterThan(0);
      expect(policy.durationMs).toBeGreaterThan(0);
    }
    for (const cue of ["leak", "wave-start", "victory", "defeat", "boss-down"] as const) {
      expect(CUE_POLICIES[cue].priority).toBe(3);
    }
  });

  it("caps plays of one cue inside its window", () => {
    let now = 0;
    const limiter = new VoiceLimiter(() => now);
    const admitted = Array.from({ length: 40 }, () => limiter.admit("shot-bolt"));
    expect(admitted.filter(Boolean)).toHaveLength(CUE_POLICIES["shot-bolt"].maxPerWindow);
    now += CUE_POLICIES["shot-bolt"].windowMs;
    expect(limiter.admit("shot-bolt")).toBe(true);
  });

  it("drops low priority cues first when the voice budget fills", () => {
    let now = 0;
    const open = { priority: 0, maxPerWindow: 100, windowMs: 1, durationMs: 1000 } as const;
    const limiter = new VoiceLimiter(() => now, {
      maxVoices: 10,
      policies: policies({
        hit: open,
        beam: { ...open, priority: 1 },
        build: { ...open, priority: 2 },
        leak: { ...open, priority: 3 },
      }),
    });
    for (let i = 0; i < 6; i++) expect(limiter.admit("hit")).toBe(true);
    expect(limiter.admit("hit")).toBe(false);
    expect(limiter.admit("beam")).toBe(true);
    expect(limiter.admit("beam")).toBe(true);
    expect(limiter.admit("beam")).toBe(true);
    expect(limiter.admit("beam")).toBe(false);
    expect(limiter.admit("build")).toBe(true);
    expect(limiter.admit("build")).toBe(false);
    expect(limiter.activeVoices()).toBe(10);
    for (let i = 0; i < 5; i++) expect(limiter.admit("leak")).toBe(true);

    now = 1000;
    expect(limiter.activeVoices()).toBe(0);
    expect(limiter.admit("hit")).toBe(true);
  });

  it("forgets everything on reset", () => {
    const limiter = new VoiceLimiter(() => 0);
    expect(limiter.admit("victory")).toBe(true);
    expect(limiter.admit("victory")).toBe(false);
    limiter.reset();
    expect(limiter.activeVoices()).toBe(0);
    expect(limiter.admit("victory")).toBe(true);
  });
});

describe("music themes", () => {
  it("defines every chapter theme with one-bar patterns", () => {
    expect(THEME_IDS).toEqual(["meadow", "frost", "ash", "rift"]);
    for (const score of THEMES) {
      expect(score.arp).toHaveLength(STEPS_PER_BAR);
      expect(score.chords.length).toBeGreaterThan(0);
      for (const groove of [score.base, score.drive]) {
        for (const pattern of Object.values(groove)) {
          expect(pattern).toMatch(/^[xo58b.]{16}$/);
        }
      }
    }
  });

  it("falls back to meadow for the menu and unknown ids", () => {
    expect(themeScore("rift").id).toBe("rift");
    expect(themeScore(undefined).id).toBe("meadow");
    expect(themeScore("nope").id).toBe("meadow");
  });

  it("converts pitch and tempo", () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(81)).toBeCloseTo(880);
    expect(stepSeconds({ bpm: 120 })).toBe(0.125);
  });

  it("hashes positions deterministically into [0, 1)", () => {
    const values = Array.from({ length: 200 }, (_, i) => hash01(i % 4, i, i % 3));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(150);
    expect(hash01(1, 2, 3)).toBe(hash01(1, 2, 3));
  });

  it("starts each bar with the chord pad and loops seamlessly", () => {
    for (const score of THEMES) {
      const pads = notesAt(score, 0).filter((note) => note.instrument === "pad");
      expect(pads.map((note) => note.midi)).toEqual(score.chords[0]);
      const period = score.chords.length * STEPS_PER_BAR * 3;
      for (let step = 0; step < period; step += 5) {
        expect(notesAt(score, step + period)).toEqual(notesAt(score, step));
      }
    }
  });

  it("splits notes into an always-on base layer and a drive layer", () => {
    const ash = themeScore("ash");
    const all = Array.from({ length: STEPS_PER_BAR * 4 }, (_, step) => notesAt(ash, step)).flat();
    const drive = all.filter((note) => note.layer === "drive");
    expect(drive.some((note) => note.instrument === "kick")).toBe(true);
    expect(drive.every((note) => note.instrument !== "pad")).toBe(true);
    expect(all.some((note) => note.layer === "base" && note.instrument === "tom")).toBe(true);
    // The phrygian ostinato: a flat second above the bass root.
    const root = (ash.chords[0]?.[0] ?? 0) - 12;
    expect(notesAt(ash, 3)).toContainEqual(
      expect.objectContaining({ instrument: "bass", midi: root + 1, layer: "drive" }),
    );
    expect(notesAt(themeScore("rift"), 7)).toContainEqual(
      expect.objectContaining({ instrument: "bass", midi: 49 - 12 + 12 }),
    );
    expect(notesAt(themeScore("meadow"), 12)).toContainEqual(
      expect.objectContaining({ instrument: "bass", midi: 60 - 12 + 7, velocity: 0.8 }),
    );
  });

  it("thins the melody by density and tolerates degenerate scores", () => {
    const silent: ThemeScore = { ...themeScore("meadow"), leadDensity: 0 };
    expect(notesAt(silent, 0).some((note) => note.instrument === "pluck")).toBe(false);
    const empty: ThemeScore = {
      ...silent,
      chords: [],
      arp: "0",
      leadDensity: 1,
      base: {},
      drive: {},
    };
    expect(notesAt(empty, 0)).toEqual([
      { instrument: "pluck", layer: "base", midi: 60, steps: 2, velocity: 1 },
    ]);
    expect(notesAt(empty, 1)).toEqual([]);
  });
});

class FakeBackend implements AudioBackend {
  running = false;
  readonly cues: [Cue, number][] = [];
  readonly music: [string | undefined, number][] = [];
  volumes: [number, number] | undefined;
  suspended = 0;
  resumed = 0;

  isRunning(): boolean {
    return this.running;
  }
  resume(): void {
    this.resumed++;
    this.running = true;
  }
  suspend(): void {
    this.suspended++;
    this.running = false;
  }
  setVolumes(sfx: number, music: number): void {
    this.volumes = [sfx, music];
  }
  playCue(cue: Cue, size: number): void {
    this.cues.push([cue, size]);
  }
  setMusic(theme: string | undefined, intensity: number): void {
    this.music.push([theme, intensity]);
  }
}

describe("game audio adapter", () => {
  const setup = () => {
    let now = 0;
    const backend = new FakeBackend();
    const open = vi.fn(() => backend);
    const audio = new GameAudio(open, () => now);
    return { audio, backend, open, advance: (ms: number) => (now += ms) };
  };

  it("stays silent until unlocked, then opens the backend once", () => {
    const { audio, backend, open } = setup();
    audio.play("tap");
    audio.setMusic("frost", 0);
    expect(open).not.toHaveBeenCalled();

    audio.unlock();
    audio.unlock();
    expect(open).toHaveBeenCalledTimes(1);
    expect(backend.resumed).toBe(1);
    expect(backend.volumes).toEqual([1, 1]);
    expect(backend.music).toEqual([["frost", 0]]);
    audio.play("tap");
    expect(backend.cues).toEqual([["tap", 0]]);
  });

  it("does not play while the context is still locked", () => {
    const { audio, backend } = setup();
    audio.unlock();
    backend.running = false;
    audio.play("star", 1);
    expect(backend.cues).toEqual([]);
  });

  it("becomes a permanent no-op without Web Audio", () => {
    const missing = vi.fn(() => undefined);
    const audio = new GameAudio(missing, () => 0);
    audio.unlock();
    audio.unlock();
    expect(missing).toHaveBeenCalledTimes(1);
    expect(() => {
      audio.play("tap");
      audio.setSettings({ sfx: 0.5, music: 0.5 });
      audio.setMusic("ash", 1);
      audio.suspend();
      audio.resume();
    }).not.toThrow();

    const throwing = new GameAudio(
      () => {
        throw new Error("NotAllowedError");
      },
      () => 0,
    );
    expect(() => {
      throwing.unlock();
    }).not.toThrow();
  });

  it("never lets a failing backend throw into the game", () => {
    const { audio, backend } = setup();
    audio.unlock();
    const boom = () => {
      throw new Error("audio stack died");
    };
    backend.playCue = boom;
    backend.setMusic = boom;
    backend.setVolumes = boom;
    backend.suspend = boom;
    expect(() => {
      audio.play("tap");
      audio.setMusic("rift", 1);
      audio.setSettings({ sfx: 1, music: 0.2 });
      audio.suspend();
    }).not.toThrow();
    backend.resume = boom;
    backend.isRunning = boom;
    expect(() => {
      audio.resume();
      audio.unlock();
      audio.play("tap");
    }).not.toThrow();
    expect(backend.cues).toEqual([]);
  });

  it("turns simulation events into rate-limited cues until detached", () => {
    const { audio, backend, advance } = setup();
    const events = new EventBus<GameEvents>();
    const kinds = vi.fn((id: number) => (id === 1 ? "cannon" : undefined));
    const detach = audio.attach(events, kinds);
    audio.unlock();

    events.emit("projectileFired", { projectile: projectile(1, 0.9) });
    events.emit("waveStarted", { wave: 1, early: true, bonus: 5 });
    for (let i = 0; i < 30; i++) events.emit("enemyHit", { enemy: makeEnemy(), damage: 1 });
    expect(backend.cues.map(([cue]) => cue)).toEqual([
      "shot-cannon",
      "wave-start",
      "coins",
      "hit",
      "hit",
    ]);
    expect(kinds).toHaveBeenCalledWith(1);

    advance(1000);
    detach();
    events.emit("enemyKilled", { enemy: makeEnemy({ def: TEST_ENEMY }), bounty: 1 });
    expect(backend.cues).toHaveLength(5);
  });

  it("skips cue work entirely when effects are muted or the app is backgrounded", () => {
    const { audio, backend } = setup();
    const events = new EventBus<GameEvents>();
    const kinds = vi.fn(() => "bolt");
    audio.attach(events, kinds);
    audio.unlock();

    audio.setSettings({ sfx: 0, music: 1 });
    events.emit("projectileFired", { projectile: projectile(1, 0) });
    expect(kinds).not.toHaveBeenCalled();

    audio.setSettings({ sfx: 1, music: 1 });
    audio.suspend();
    audio.play("tap");
    audio.unlock();
    expect(backend.cues).toEqual([]);
    expect(backend.suspended).toBe(1);
    expect(backend.resumed).toBe(1);
  });

  it("clamps settings and forwards music only when it changes", () => {
    const { audio, backend } = setup();
    audio.unlock();
    audio.setSettings({ sfx: 3, music: -1 });
    expect(backend.volumes).toEqual([1, 0]);

    audio.setMusic("meadow", 0.5);
    expect(backend.music).toEqual([[undefined, 0]]);

    audio.setSettings({ sfx: 1, music: 0.4 });
    audio.setMusic("meadow", 0.5);
    audio.setMusic("meadow", 0.505);
    audio.setMusic("meadow", 2);
    audio.setMusic(undefined, 1);
    audio.setMusic(undefined, 0);
    expect(backend.music).toEqual([
      [undefined, 0],
      ["meadow", 0.5],
      ["meadow", 1],
      [undefined, 1],
    ]);
  });

  it("pauses music in the background and restores it on resume", () => {
    const { audio, backend } = setup();
    audio.unlock();
    audio.setMusic("ash", 1);
    audio.suspend();
    audio.setMusic("rift", 0);
    expect(backend.music).toEqual([
      [undefined, 0],
      ["ash", 1],
    ]);
    audio.resume();
    expect(backend.running).toBe(true);
    expect(backend.music.at(-1)).toEqual(["rift", 0]);

    const locked = setup();
    locked.audio.suspend();
    locked.audio.resume();
    locked.audio.unlock();
    expect(locked.backend.resumed).toBe(1);
  });
});
