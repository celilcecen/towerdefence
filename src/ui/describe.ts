import type { AttackSpec, EnemyDef, TowerDef, TowerLevel, WaveDef } from "../core/content-types";
import type { Strings } from "../i18n";

/**
 * Player-facing wording derived from content data. Nothing here is written
 * per id, so a new tower, enemy or wave explains itself without UI changes;
 * only the words themselves come from the translation table.
 */

export function describeAttack(t: Strings, attack: AttackSpec): string {
  switch (attack.kind) {
    case "projectile":
      return attack.splashRadius > 0
        ? t.stats.splash(attack.damage)
        : t.stats.damage(attack.damage);
    case "beam":
      return t.stats.beam(attack.damage);
    case "pulse":
      return t.stats.pulse(attack.damage, Math.round((1 - attack.slow.factor) * 100));
    case "chain":
      return t.stats.chain(attack.damage, attack.jumps);
  }
}

export function describeLevel(
  t: Strings,
  level: TowerLevel,
  tower?: Pick<TowerDef, "groundOnly">,
): string {
  const parts = [
    describeAttack(t, level.attack),
    t.stats.range(level.range),
    t.stats.rate((1 / level.cooldown).toFixed(1)),
  ];
  if (tower?.groundOnly) parts.push(t.stats.groundOnly);
  return parts.join(" · ");
}

/** Artillery: splash that reaches most of the way across a phone-sized board. */
const ARTILLERY_RANGE = 4.5;

/** A two- to four-word role for a build card, from the first level's attack. */
export function towerRole(t: Strings, tower: TowerDef): string {
  const { attack, cooldown, range } = tower.levels[0];
  switch (attack.kind) {
    case "projectile":
      if (attack.splashRadius > 0)
        return range >= ARTILLERY_RANGE ? t.roles.artillery : t.roles.area;
      return cooldown <= 0.75 ? t.roles.rapid : t.roles.single;
    case "beam":
      return range >= 3.5 ? t.roles.longPierce : t.roles.pierce;
    case "pulse":
      return t.roles.slows;
    case "chain":
      return t.roles.chain;
  }
}

export interface EnemyProfile {
  readonly traits: readonly string[];
  readonly boss: boolean;
}

/** Traits relative to the rest of the roster, so wording follows balance changes. */
export function enemyProfile(
  t: Strings,
  enemy: EnemyDef,
  roster: readonly EnemyDef[],
): EnemyProfile {
  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };
  const speed = median(roster.map((e) => e.speed));
  const leak = median(roster.map((e) => e.leakDamage));
  const boss = enemy.leakDamage >= Math.max(5, leak * 5);
  const traits: string[] = [];
  if (boss) traits.push(t.traits.boss);
  if (enemy.flying) traits.push(t.traits.flying);
  if (enemy.heal) traits.push(t.traits.heals);
  if (enemy.split) traits.push(t.traits.splits);
  if (enemy.speed > speed * 1.4) traits.push(t.traits.fast);
  else if (enemy.speed < speed * 0.75) traits.push(t.traits.slow);
  if (enemy.armor >= 3) traits.push(t.traits.armored);
  if (traits.length === 0) traits.push(t.traits.basic);
  traits.push(t.traits.lives(enemy.leakDamage));
  return { traits, boss };
}

export interface WaveEntry {
  readonly enemy: string;
  readonly count: number;
}

/** Enemies in a wave, merged by type, in order of first appearance. */
export function waveRoster(wave: WaveDef): readonly WaveEntry[] {
  const counts = new Map<string, number>();
  const firstSeen = [...wave.groups].sort((a, b) => a.delay - b.delay);
  for (const group of firstSeen) {
    counts.set(group.enemy, (counts.get(group.enemy) ?? 0) + group.count);
  }
  return [...counts].map(([enemy, count]) => ({ enemy, count }));
}

/** Enemies the player will meet in a set of waves, including what splitters release. */
export function rosterOf(
  waves: readonly WaveDef[],
  enemy: (id: string) => EnemyDef,
): readonly EnemyDef[] {
  const seen = new Map<string, EnemyDef>();
  const visit = (id: string): void => {
    if (seen.has(id)) return;
    const def = enemy(id);
    seen.set(id, def);
    if (def.split) visit(def.split.enemy);
  };
  for (const wave of waves) for (const group of wave.groups) visit(group.enemy);
  return [...seen.values()];
}

/** Resolves a dotted path such as "home.campaign" to a string leaf of the table. */
export function lookupText(t: Strings, path: string): string | undefined {
  let node: unknown = t;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}
