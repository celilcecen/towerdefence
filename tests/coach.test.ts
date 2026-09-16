import { describe, expect, it, vi } from "vitest";
import { Coach, parseSeen, TIPS, TUTORIAL, TUTORIAL_DONE } from "../src/app/coach";
import type { Store } from "../src/app/game-app";
import { GameApp } from "../src/app/game-app";
import type { Settings } from "../src/app/settings";
import { DEFAULT_SETTINGS } from "../src/app/settings";
import { CAMPAIGN, GAME_CONTENT } from "../src/content";
import { STORY_BEATS } from "../src/content/story";
import type { Progress } from "../src/core/progress";
import { EMPTY_PROGRESS } from "../src/core/progress";
import { en } from "../src/i18n/en";
import { tr } from "../src/i18n/tr";

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

const create = (seen: readonly string[] = []) => {
  let seed = 0;
  const app = new GameApp(
    CAMPAIGN,
    GAME_CONTENT,
    {
      progress: new MemoryStore<Progress>(EMPTY_PROGRESS),
      settings: new MemoryStore<Settings>(DEFAULT_SETTINGS),
      classic: { load: () => undefined, save: () => undefined },
    },
    () => ++seed,
  );
  const store = new MemoryStore<readonly string[]>(seen);
  const coach = new Coach(app, store);
  return { app, coach, store, session: app.session };
};

describe("tutorial", () => {
  it("walks a new player through building, mazing, fighting and upgrading", () => {
    const { app, coach, store, session } = create();
    const offGuide = vi.fn();
    session.events.on("offGuide", offGuide);
    app.startLevel("c1-crossing");
    const step = () => {
      coach.update();
      return coach.view?.id;
    };

    expect(step()).toBe("welcome");
    expect(coach.view).toMatchObject({ kind: "tutorial", tap: true, step: 1 });
    expect(app.overlay).toBe("coach");
    expect(session.paused).toBe(true);

    coach.next();
    expect(step()).toBe("pick");
    expect(app.overlay).toBeUndefined();
    expect(session.paused).toBe(false);

    session.selectBuild("bolt");
    expect(step()).toBe("place");
    session.setGuide(coach.guide);
    session.activateCell({ x: 8, y: 2 });
    expect(offGuide).toHaveBeenCalledOnce();
    expect(session.simulation.world.towers).toHaveLength(0);
    session.activateCell({ x: 3, y: 5 });
    expect(step()).toBe("walls");
    coach.next();
    coach.next();

    expect(step()).toBe("more");
    session.setGuide(coach.guide);
    session.activateCell({ x: 3, y: 4 });
    session.activateCell({ x: 3, y: 6 });
    expect(step()).toBe("hero");
    expect(coach.guide).toBeUndefined();
    expect(coach.view?.anchor).toEqual({ kind: "element", selector: "#stick" });
    session.moveHero(-1, 0);
    for (let i = 0; i < 15; i++) session.step();
    session.stopHero();
    expect(step()).toBe("start");

    session.startWave();
    expect(step()).toBe("watch");
    for (let i = 0; i < 5000 && session.simulation.world.wavesCleared < 1; i++) session.step();
    expect(step()).toBe("inspect");

    session.cancel();
    session.activateCell({ x: 3, y: 5 });
    expect(step()).toBe("upgrade");
    session.cancel();
    expect(step()).toBe("inspect");
    session.activateCell({ x: 3, y: 5 });
    session.upgradeSelected();
    expect(step()).toBe("finish");
    expect(coach.view?.step).toBe(TUTORIAL.length);

    coach.next();
    coach.update();
    expect(coach.view).toBeUndefined();
    expect(store.saved.at(-1)).toContain(TUTORIAL_DONE);
    expect(coach.hasSeen(TUTORIAL_DONE)).toBe(true);
  });

  it("steps back when the player drops the tower they were asked to place", () => {
    const { app, coach, session } = create();
    app.startLevel("c1-crossing");
    coach.update();
    coach.next();
    session.selectBuild("bolt");
    coach.update();
    expect(coach.view?.id).toBe("place");
    session.cancel();
    coach.update();
    expect(coach.view?.id).toBe("pick");
  });

  it("treats the back gesture on a tap step as continue, and can be skipped", () => {
    const { app, coach } = create();
    app.startLevel("c1-crossing");
    coach.update();
    expect(app.back()).toBe(true);
    coach.update();
    expect(coach.view?.id).toBe("pick");

    coach.next();
    expect(coach.view?.id).toBe("pick");
    coach.skipTutorial();
    coach.update();
    expect(coach.view).toBeUndefined();
  });

  it("only runs on the first campaign level, restarts with the level, and can be replayed", () => {
    const { app, coach, store } = create();
    app.startClassic();
    coach.update();
    expect(coach.tutorialActive).toBe(false);

    app.startLevel("c1-crossing");
    coach.update();
    coach.next();
    app.retry();
    coach.update();
    expect(coach.view?.id).toBe("welcome");

    coach.skipTutorial();
    coach.reset();
    expect(store.saved.at(-1)).toEqual([]);
    expect(coach.hasSeen(TUTORIAL_DONE)).toBe(false);
  });
});

describe("tips", () => {
  it("explain an early wave call once, pausing until dismissed", () => {
    const { app, coach, store, session } = create([TUTORIAL_DONE]);
    app.startClassic();
    session.startWave();
    for (let i = 0; i < 400 && !session.simulation.canStartWave; i++) session.step();
    coach.update();
    expect(coach.view).toMatchObject({ kind: "tip", id: "early", tap: true, step: 0 });
    expect(app.overlay).toBe("coach");
    expect(coach.guide).toBeUndefined();

    coach.next();
    coach.update();
    expect(coach.view).toBeUndefined();
    expect(app.overlay).toBeUndefined();
    expect(store.saved.at(-1)).toContain("early");
  });

  it("wait for the player's own dialogs to close first", () => {
    const { app, coach, session } = create([TUTORIAL_DONE]);
    app.startClassic();
    session.startWave();
    for (let i = 0; i < 400 && !session.simulation.canStartWave; i++) session.step();
    app.openOverlay("pause");
    coach.update();
    expect(coach.view).toBeUndefined();
    expect(app.overlay).toBe("pause");
  });

  it("each react to their own situation", () => {
    const { app, session } = create();
    app.startLevel("c1-crossing");
    for (const tip of TIPS) expect(tip.when(session)).toBe(false);
  });
});

describe("onboarding data", () => {
  it("keeps only well-formed saved ids", () => {
    expect(parseSeen("nope")).toEqual([]);
    expect(parseSeen(["tutorial", 3, "BAD ID", "early"])).toEqual(["tutorial", "early"]);
  });

  it("has words for every tutorial step, tip and story line in every language", () => {
    for (const t of [en, tr]) {
      const steps = t.coach.steps as Readonly<Record<string, string>>;
      const tips = t.coach.tips as Readonly<Record<string, string>>;
      for (const step of TUTORIAL) expect(steps[step.id], `${t.locale} ${step.id}`).toBeTruthy();
      for (const tip of TIPS) expect(tips[tip.id], `${t.locale} ${tip.id}`).toBeTruthy();
      for (const [levelId, beats] of Object.entries(STORY_BEATS)) {
        for (const beat of beats) {
          expect(
            t.dialogue[levelId]?.[beat.line],
            `${t.locale} ${levelId} ${beat.line}`,
          ).toBeTruthy();
        }
      }
      expect(t.ending.text.length).toBeGreaterThan(40);
    }
  });

  it("only schedules story lines on waves that exist", () => {
    for (const [levelId, beats] of Object.entries(STORY_BEATS)) {
      const level = CAMPAIGN.chapters.flatMap((c) => c.levels).find((l) => l.id === levelId);
      expect(level, levelId).toBeDefined();
      for (const beat of beats) expect(beat.wave).toBeLessThanOrEqual(level!.waves.length);
    }
  });
});
