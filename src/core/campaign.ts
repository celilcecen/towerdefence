import type { CampaignDef, ChapterDef, GameContent, LevelDef } from "./content-types";
import { validateContent } from "./validate-content";

export interface LevelRef {
  readonly chapter: ChapterDef;
  readonly level: LevelDef;
  /** Position across the whole campaign, starting at 0. */
  readonly index: number;
}

/** Every level in play order. */
export function campaignLevels(campaign: CampaignDef): readonly LevelRef[] {
  let index = 0;
  return campaign.chapters.flatMap((chapter) =>
    chapter.levels.map((level) => ({ chapter, level, index: index++ })),
  );
}

export function findLevel(campaign: CampaignDef, id: string): LevelRef | undefined {
  return campaignLevels(campaign).find((ref) => ref.level.id === id);
}

/**
 * The self-contained content one level is played with: shared definitions
 * narrowed to what the level unlocks. Enemies are always the full roster so
 * splitters can release children that no wave spawns directly.
 */
export function levelContent(campaign: CampaignDef, level: LevelDef): GameContent {
  const pick = <T extends { readonly id: string }>(all: readonly T[], ids: readonly string[]) =>
    ids.flatMap((id) => all.filter((item) => item.id === id));
  const hero = campaign.heroes.find((h) => h.id === level.hero);
  return {
    towers: pick(campaign.towers, level.towers),
    enemies: campaign.enemies,
    powers: pick(campaign.powers, level.powers),
    ...(hero ? { hero } : {}),
    waves: level.waves,
    map: level.map,
    rules: {
      ...campaign.rules,
      startingGold: level.startingGold,
      startingLives: level.startingLives,
    },
  };
}

const duplicateIds = (ids: readonly string[]): string[] => [
  ...new Set(ids.filter((id, i) => ids.indexOf(id) !== i)),
];

/** Structural checks across levels, plus full content validation of each one. */
export function validateCampaign(campaign: CampaignDef): string[] {
  const errors: string[] = [];
  const levels = campaignLevels(campaign);
  if (levels.length === 0) errors.push("The campaign needs at least one level.");

  const seen = new Set<string>();
  for (const id of [...campaign.chapters.map((c) => c.id), ...levels.map((l) => l.level.id)]) {
    if (seen.has(id)) errors.push(`Duplicate campaign id "${id}".`);
    seen.add(id);
  }

  const towerIds = new Set(campaign.towers.map((t) => t.id));
  const powerIds = new Set(campaign.powers.map((p) => p.id));
  const heroIds = new Set(campaign.heroes.map((h) => h.id));
  for (const id of duplicateIds(campaign.heroes.map((h) => h.id))) {
    errors.push(`Duplicate hero id "${id}".`);
  }
  for (const { level } of levels) {
    const where = `Level "${level.id}"`;
    if (level.hero !== undefined && !heroIds.has(level.hero)) {
      errors.push(`${where}: unknown hero "${level.hero}".`);
    }
    for (const id of level.towers) {
      if (!towerIds.has(id)) errors.push(`${where}: unknown tower "${id}".`);
    }
    for (const id of level.powers) {
      if (!powerIds.has(id)) errors.push(`${where}: unknown power "${id}".`);
    }
    errors.push(...validateContent(levelContent(campaign, level)).map((p) => `${where}: ${p}`));
  }
  for (const chapter of campaign.chapters) {
    if (chapter.levels.length === 0) errors.push(`Chapter "${chapter.id}" has no levels.`);
  }
  return [...new Set(errors)];
}

export interface Introductions {
  readonly towers: readonly string[];
  readonly powers: readonly string[];
  readonly enemies: readonly string[];
}

/** Enemies a level can put on the board: every wave spawn, plus what splitters release. */
function enemiesOf(campaign: CampaignDef, level: LevelDef): Set<string> {
  const found = new Set<string>();
  const pending = level.waves.flatMap((w) => w.groups.map((g) => g.enemy));
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || found.has(id)) continue;
    found.add(id);
    const split = campaign.enemies.find((e) => e.id === id)?.split;
    if (split) pending.push(split.enemy);
  }
  return found;
}

/** What a level shows the player for the first time, in the order the level lists it. */
export function introducedIn(campaign: CampaignDef, levelId: string): Introductions {
  const levels = campaignLevels(campaign);
  const index = levels.findIndex((ref) => ref.level.id === levelId);
  const current = levels[index];
  if (!current) return { towers: [], powers: [], enemies: [] };
  const earlier = levels.slice(0, index).map((ref) => ref.level);
  const seen = (pick: (level: LevelDef) => Iterable<string>): Set<string> =>
    new Set(earlier.flatMap((level) => [...pick(level)]));
  const oldTowers = seen((l) => l.towers);
  const oldPowers = seen((l) => l.powers);
  const oldEnemies = seen((l) => enemiesOf(campaign, l));
  const order = campaign.enemies.map((e) => e.id);
  return {
    towers: current.level.towers.filter((id) => !oldTowers.has(id)),
    powers: current.level.powers.filter((id) => !oldPowers.has(id)),
    enemies: [...enemiesOf(campaign, current.level)]
      .filter((id) => !oldEnemies.has(id))
      .sort((a, b) => order.indexOf(a) - order.indexOf(b)),
  };
}
