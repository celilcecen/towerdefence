import type { Language } from "../app/settings";
import type { Strings } from "./en";
import { en } from "./en";
import { tr } from "./tr";

export type { ChapterText, StoryText, Strings } from "./en";

const TABLES: Readonly<Record<Language, Strings>> = { en, tr };

export function stringsFor(language: Language): Strings {
  return TABLES[language];
}

/** Content names come from translations when present, else from the content data itself. */
export function towerName(t: Strings, id: string, fallback: string): string {
  return t.towers[id]?.name ?? fallback;
}

export function enemyName(t: Strings, id: string, fallback: string): string {
  return t.enemies[id] ?? fallback;
}

export function powerName(t: Strings, id: string, fallback: string): string {
  return t.powers[id]?.name ?? fallback;
}
