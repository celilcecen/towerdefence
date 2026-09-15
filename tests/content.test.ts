import { describe, expect, it } from "vitest";
import { GAME_CONTENT } from "../src/content";
import {
  ContentRegistry,
  InvalidContentError,
  UnknownContentError,
} from "../src/core/content-registry";
import type { GameContent, TowerDef } from "../src/core/content-types";
import { validateContent } from "../src/core/validate-content";
import { makeContent, singleWave, TEST_ENEMY, TEST_TOWER } from "./support/fixtures";

describe("shipped content", () => {
  it("passes validation", () => {
    expect(validateContent(GAME_CONTENT)).toEqual([]);
  });

  it("offers an upgrade path for every tower", () => {
    for (const tower of GAME_CONTENT.towers) expect(tower.levels.length).toBeGreaterThan(1);
  });

  it("gets harder wave over wave", () => {
    const multipliers = GAME_CONTENT.waves.map((w) => w.hpMultiplier);
    expect(multipliers).toEqual([...multipliers].sort((a, b) => a - b));
  });
});

describe("validateContent", () => {
  const problemsFor = (overrides: Partial<GameContent>): string[] =>
    validateContent(makeContent(overrides));

  it("accepts the test fixture", () => {
    expect(problemsFor({})).toEqual([]);
  });

  it("reports missing collections", () => {
    const problems = problemsFor({ towers: [], enemies: [], waves: [] });
    expect(problems).toEqual(
      expect.arrayContaining([
        "At least one tower is required.",
        "At least one enemy is required.",
        "At least one wave is required.",
      ]),
    );
  });

  it("reports duplicate ids and hotkeys", () => {
    const problems = problemsFor({
      towers: [TEST_TOWER, TEST_TOWER],
      enemies: [TEST_ENEMY, TEST_ENEMY],
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        'Duplicate tower id "gun".',
        'Duplicate hotkey "1".',
        'Duplicate enemy id "dummy".',
      ]),
    );
  });

  it("reports invalid tower stats for every attack kind", () => {
    const broken: TowerDef = {
      ...TEST_TOWER,
      hotkey: "",
      defaultTargeting: "sideways" as TowerDef["defaultTargeting"],
      levels: [
        {
          cost: 0,
          range: 0,
          cooldown: -1,
          attack: { kind: "projectile", damage: 0, speed: 0, splashRadius: -1 },
        },
        {
          cost: 1.5,
          range: 1,
          cooldown: 1,
          attack: { kind: "pulse", damage: 1, slow: { factor: 0, duration: 0 } },
        },
        { cost: 1, range: 1, cooldown: 1, attack: { kind: "beam", damage: Number.NaN } },
      ],
    };
    const problems = problemsFor({ towers: [broken] });
    expect(problems).toHaveLength(12);
    expect(problems).toContain('Tower "gun": unknown default targeting "sideways".');
    expect(problems).toContain('Tower "gun" level 2: slow factor must be in (0, 1].');
  });

  it("reports invalid enemies", () => {
    const problems = problemsFor({
      enemies: [
        { ...TEST_ENEMY, hp: 0, speed: 0, armor: -1, bounty: 0.5, leakDamage: 0, radius: 0.9 },
      ],
    });
    expect(problems).toHaveLength(6);
  });

  it("reports invalid waves and unknown enemies", () => {
    const problems = problemsFor({
      waves: [
        singleWave({ groups: [], hpMultiplier: 0, clearBonus: -1 }),
        singleWave({ groups: [{ enemy: "ghost", count: 0, interval: -1, delay: -1 }] }),
      ],
    });
    expect(problems).toEqual([
      "Wave 1: needs at least one spawn group.",
      "Wave 1: hpMultiplier must be positive.",
      "Wave 1: clearBonus must be a non-negative integer.",
      'Wave 2 group 1: unknown enemy "ghost".',
      "Wave 2 group 1: count must be a positive integer.",
      "Wave 2 group 1: interval must be >= 0.",
      "Wave 2 group 1: delay must be >= 0.",
    ]);
  });

  it("reports invalid rules", () => {
    const problems = problemsFor({
      rules: { startingGold: -1, startingLives: 0, sellRefundRatio: 2, minDamageRatio: 0 },
    });
    expect(problems).toHaveLength(4);
  });

  it("reports unparseable maps and spawns that cannot reach an exit", () => {
    expect(problemsFor({ map: { id: "bad", name: "bad", rows: ["S.X"] } })).toEqual([
      'Map "bad": Unknown map symbol "X" at (2, 0).',
    ]);
    expect(problemsFor({ map: { id: "wall", name: "wall", rows: ["S#E"] } })).toEqual([
      'Map "wall": spawn (0, 0) cannot reach an exit.',
    ]);
  });
});

describe("ContentRegistry", () => {
  it("fails fast with every problem listed", () => {
    const create = () => new ContentRegistry(makeContent({ towers: [] }));
    expect(create).toThrow(InvalidContentError);
    expect(create).toThrow("At least one tower is required.");
  });

  it("looks content up by id and rejects unknown ids", () => {
    const registry = new ContentRegistry(makeContent());
    expect(registry.tower("gun")).toBe(TEST_TOWER);
    expect(registry.enemy("dummy")).toBe(TEST_ENEMY);
    expect(registry.hasTower("nope")).toBe(false);
    expect(registry.towers).toHaveLength(1);
    expect(() => registry.tower("nope")).toThrow(UnknownContentError);
    expect(() => registry.enemy("nope")).toThrow(UnknownContentError);
    expect(() => registry.wave(7)).toThrow(UnknownContentError);
  });
});
