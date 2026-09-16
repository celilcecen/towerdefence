import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAMPAIGN } from "../src/content";
import {
  campaignLevels,
  findLevel,
  introducedIn,
  levelContent,
  validateCampaign,
} from "../src/core/campaign";
import type { CampaignDef, LevelDef } from "../src/core/content-types";
import {
  EMPTY_PROGRESS,
  isUnlocked,
  nextLevelId,
  parseProgress,
  recordResult,
  starsFor,
  totalStars,
} from "../src/core/progress";
import { en } from "../src/i18n/en";
import { enemyName, powerName, stringsFor, towerName } from "../src/i18n";
import { tr } from "../src/i18n/tr";
import { lookupText } from "../src/ui/describe";
import { singleWave, TEST_ENEMY, TEST_TOWER } from "./support/fixtures";

describe("shipped campaign", () => {
  it("passes validation", () => {
    expect(validateCampaign(CAMPAIGN)).toEqual([]);
  });

  it("uses one board size for every level, so phones rotate them all the same way", () => {
    for (const { level } of campaignLevels(CAMPAIGN)) {
      expect(level.map.rows, level.id).toHaveLength(11);
      for (const row of level.map.rows) expect(row, level.id).toHaveLength(18);
    }
  });

  it("introduces each chapter's new threat and answer where the story says", () => {
    expect(introducedIn(CAMPAIGN, "c1-crossing")).toMatchObject({
      towers: ["bolt", "cannon"],
      powers: [],
    });
    expect(introducedIn(CAMPAIGN, "c1-fords")).toMatchObject({
      towers: ["frost"],
      powers: ["meteor"],
    });
    expect(introducedIn(CAMPAIGN, "c1-mill").enemies).toContain("warden");
    expect(introducedIn(CAMPAIGN, "c2-lake")).toMatchObject({ towers: ["arc"] });
    expect(introducedIn(CAMPAIGN, "c2-lake").enemies).toContain("wisp");
    expect(introducedIn(CAMPAIGN, "c2-pass").enemies).toContain("mender");
    expect(introducedIn(CAMPAIGN, "c2-gate")).toMatchObject({ powers: ["frostbind"] });
    expect(introducedIn(CAMPAIGN, "c2-gate").enemies).toContain("harrier");
    expect(introducedIn(CAMPAIGN, "c3-cinder")).toMatchObject({ towers: ["mortar"] });
    expect(introducedIn(CAMPAIGN, "c3-cinder").enemies).toEqual(
      expect.arrayContaining(["brood", "broodling"]),
    );
    expect(introducedIn(CAMPAIGN, "c4-heart").enemies).toEqual(["tyrant"]);
    expect(introducedIn(CAMPAIGN, "missing")).toEqual({ towers: [], powers: [], enemies: [] });
  });

  it("builds a level's content from the shared definitions", () => {
    const ref = findLevel(CAMPAIGN, "c1-fords");
    expect(ref?.index).toBe(1);
    expect(ref?.chapter.id).toBe("greenreach");
    const content = levelContent(CAMPAIGN, ref!.level);
    expect(content.towers.map((t) => t.id)).toEqual(["bolt", "cannon", "frost"]);
    expect(content.powers.map((p) => p.id)).toEqual(["meteor"]);
    expect(content.enemies).toBe(CAMPAIGN.enemies);
    expect(content.rules.startingGold).toBe(ref!.level.startingGold);
    expect(findLevel(CAMPAIGN, "missing")).toBeUndefined();
  });
});

describe("validateCampaign", () => {
  const level = (id: string, overrides: Partial<LevelDef> = {}): LevelDef => ({
    id,
    map: { id: "m", name: "m", rows: ["S..E"] },
    waves: [singleWave()],
    towers: ["gun"],
    powers: [],
    startingGold: 10,
    startingLives: 5,
    ...overrides,
  });
  const campaign = (chapters: CampaignDef["chapters"]): CampaignDef => ({
    towers: [TEST_TOWER],
    enemies: [TEST_ENEMY],
    powers: [],
    heroes: [],
    rules: { sellRefundRatio: 0.5, minDamageRatio: 0.2, earlyCallRatio: 0.5 },
    chapters,
  });

  it("reports structural problems and each level's content problems", () => {
    expect(validateCampaign(campaign([]))).toEqual(["The campaign needs at least one level."]);
    const problems = validateCampaign(
      campaign([
        { id: "a", theme: "meadow", levels: [level("x"), level("x", { towers: ["laser"] })] },
        { id: "x", theme: "meadow", levels: [] },
        { id: "b", theme: "meadow", levels: [level("y", { powers: ["zap"], startingLives: 0 })] },
      ]),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        'Duplicate campaign id "x".',
        'Level "x": unknown tower "laser".',
        'Level "x": At least one tower is required.',
        'Level "y": unknown power "zap".',
        'Level "y": startingLives must be a positive integer.',
        'Chapter "x" has no levels.',
      ]),
    );
  });
});

describe("progress", () => {
  const two = {
    ...CAMPAIGN,
    chapters: [{ id: "c", theme: "meadow", levels: CAMPAIGN.chapters[0]!.levels.slice(0, 2) }],
  };

  it("awards stars for keeping the crystal intact", () => {
    expect(starsFor(false, 20, 20)).toBe(0);
    expect(starsFor(true, 18, 20)).toBe(3);
    expect(starsFor(true, 17, 20)).toBe(2);
    expect(starsFor(true, 10, 20)).toBe(2);
    expect(starsFor(true, 9, 20)).toBe(1);
  });

  it("keeps valid saved entries and drops everything else", () => {
    expect(parseProgress(undefined)).toEqual(EMPTY_PROGRESS);
    expect(parseProgress({ levels: "nope" })).toEqual(EMPTY_PROGRESS);
    expect(
      parseProgress({
        levels: {
          "c1-crossing": { stars: 3, bestLives: 20 },
          "c1-fords": { stars: 4, bestLives: 1 },
          "BAD ID": { stars: 1, bestLives: 1 },
          "c1-mill": null,
          "c2-lake": { stars: 1, bestLives: -1 },
        },
      }),
    ).toEqual({ levels: { "c1-crossing": { stars: 3, bestLives: 20 } } });
  });

  it("merges results without ever lowering what was earned", () => {
    const first = recordResult(EMPTY_PROGRESS, "a", true, 12, 20);
    expect(first).toMatchObject({ stars: 2, improved: true });
    expect(first.progress.levels["a"]).toEqual({ stars: 2, bestLives: 12 });

    const loss = recordResult(first.progress, "a", false, 0, 20);
    expect(loss).toEqual({ progress: first.progress, stars: 0, improved: false });

    const worse = recordResult(first.progress, "a", true, 3, 20);
    expect(worse.improved).toBe(false);
    expect(worse.progress).toBe(first.progress);

    const moreLives = recordResult(first.progress, "a", true, 14, 20);
    expect(moreLives.progress.levels["a"]).toEqual({ stars: 2, bestLives: 14 });

    const better = recordResult(moreLives.progress, "a", true, 20, 20);
    expect(better.progress.levels["a"]).toEqual({ stars: 3, bestLives: 20 });
    expect(totalStars(better.progress)).toBe(3);
  });

  it("unlocks levels in order and points Continue at the first unwon one", () => {
    expect(isUnlocked(two, EMPTY_PROGRESS, "c1-crossing")).toBe(true);
    expect(isUnlocked(two, EMPTY_PROGRESS, "c1-fords")).toBe(false);
    expect(isUnlocked(two, EMPTY_PROGRESS, "missing")).toBe(false);
    expect(nextLevelId(two, EMPTY_PROGRESS)).toBe("c1-crossing");

    const won = recordResult(EMPTY_PROGRESS, "c1-crossing", true, 20, 20).progress;
    expect(isUnlocked(two, won, "c1-fords")).toBe(true);
    expect(nextLevelId(two, won)).toBe("c1-fords");
    const all = recordResult(won, "c1-fords", true, 1, 20).progress;
    expect(nextLevelId(two, all)).toBe("c1-fords");
    expect(nextLevelId({ ...two, chapters: [] }, all)).toBeUndefined();
  });
});

describe("translations", () => {
  const tables = [en, tr];

  it("name every chapter, level, tower, enemy and power in every language", () => {
    for (const t of tables) {
      for (const chapter of CAMPAIGN.chapters) {
        expect(t.chapters[chapter.id]?.intro, `${t.locale} ${chapter.id}`).toBeTruthy();
        for (const level of chapter.levels) {
          const story = t.levels[level.id];
          expect(story?.brief.length, `${t.locale} ${level.id}`).toBeGreaterThan(0);
          expect(story?.victory, `${t.locale} ${level.id}`).toBeTruthy();
        }
      }
      for (const tower of CAMPAIGN.towers) expect(t.towers[tower.id]?.summary).toBeTruthy();
      for (const enemy of CAMPAIGN.enemies) expect(t.enemies[enemy.id]).toBeTruthy();
      for (const power of CAMPAIGN.powers) expect(t.powers[power.id]?.summary).toBeTruthy();
    }
  });

  it("resolve every key the page markup uses", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const keys = [...html.matchAll(/data-t(?:-aria)?="([^"]+)"/g)].map((m) => m[1]!);
    expect(keys.length).toBeGreaterThan(30);
    for (const t of tables) {
      for (const key of keys) expect(lookupText(t, key), `${t.locale} ${key}`).toBeDefined();
    }
  });

  it("format numbers and plurals in both languages", () => {
    expect(en.traits.lives(1)).toBe("−1 life");
    expect(en.traits.lives(3)).toBe("−3 lives");
    expect(tr.traits.lives(3)).toBe("−3 can");
    expect(en.result.classicWon(15, 1)).toBe("All 15 waves held with 1 life left.");
    expect(tr.hud.callEarly(12)).toBe("Erken çağır +12a");
    for (const t of tables) {
      expect(t.map.levelLabel(2, "X", 0)).toContain("X");
      expect(t.map.levelLabel(2, "X", 3)).toContain("3");
      expect(t.result.starsLabel(1)).toContain("1");
      expect(t.briefing.waves(12)).toContain("12");
    }
  });

  it("fall back to content names for ids without a translation", () => {
    expect(stringsFor("tr")).toBe(tr);
    expect(towerName(tr, "bolt", "Bolt")).toBe("Ok");
    expect(towerName(tr, "laser", "Laser")).toBe("Laser");
    expect(enemyName(en, "ghost", "Ghost")).toBe("Ghost");
    expect(powerName(en, "zap", "Zap")).toBe("Zap");
  });
});
