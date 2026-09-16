import { describe, expect, it } from "vitest";
import type { Strings } from "../src/i18n";
import { enemyName, powerName, stringsFor, towerName } from "../src/i18n";
import { en } from "../src/i18n/en";
import { tr } from "../src/i18n/tr";

type Leaf = readonly [path: string, value: unknown];

function leaves(value: unknown, path = ""): Leaf[] {
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, path ? `${path}.${key}` : key),
    );
  }
  return [[path, value]];
}

const shape = (table: Strings): string[] =>
  leaves(table)
    .filter(([path]) => path !== "locale")
    .map(([path, value]) => `${path}:${typeof value}`)
    .sort();

describe("translations", () => {
  it("give both languages the same keys with the same kinds of value", () => {
    expect(shape(tr)).toEqual(shape(en));
  });

  for (const table of [en, tr]) {
    it(`fill every sentence template in ${table.locale}, for one and for many`, () => {
      for (const [path, value] of leaves(table)) {
        if (typeof value === "string") {
          expect(value.trim(), path).not.toBe("");
          continue;
        }
        if (typeof value !== "function") continue;
        const template = value as (...args: unknown[]) => unknown;
        for (const n of [1, 7]) {
          const text = template(...Array.from({ length: template.length }, () => n));
          expect(typeof text, path).toBe("string");
          expect(String(text), path).toContain(String(n));
        }
      }
    });
  }

  it("look content names up, falling back to the content's own name", () => {
    const t = stringsFor("tr");
    expect(stringsFor("en")).toBe(en);
    expect(towerName(t, "bolt", "x")).not.toBe("x");
    expect(towerName(t, "missing", "x")).toBe("x");
    expect(enemyName(t, "missing", "y")).toBe("y");
    expect(powerName(t, "missing", "z")).toBe("z");
    expect(powerName(t, "meteor", "z")).not.toBe("z");
  });
});
