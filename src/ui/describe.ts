import type { AttackSpec, EnemyDef, TowerDef, TowerLevel, WaveDef } from "../core/content-types";

/**
 * Player-facing wording derived from content data. Nothing here is written
 * per id, so a new tower, enemy or wave explains itself without UI changes.
 */

export function describeAttack(attack: AttackSpec): string {
  switch (attack.kind) {
    case "projectile":
      return attack.splashRadius > 0 ? `${attack.damage} splash` : `${attack.damage} dmg`;
    case "beam":
      return `${attack.damage} beam`;
    case "pulse":
      return `${attack.damage} dmg, slow ${Math.round((1 - attack.slow.factor) * 100)}%`;
  }
}

export function describeLevel(level: TowerLevel): string {
  return `${describeAttack(level.attack)} · range ${level.range} · ${(1 / level.cooldown).toFixed(1)}/s`;
}

/** A two- or three-word role for a build card, from the first level's attack. */
export function towerRole(tower: TowerDef): string {
  const { attack, cooldown, range } = tower.levels[0];
  switch (attack.kind) {
    case "projectile":
      if (attack.splashRadius > 0) return "Area damage";
      return cooldown <= 0.75 ? "Rapid fire" : "Single target";
    case "beam":
      return range >= 3.5 ? "Long range, pierces armor" : "Pierces armor";
    case "pulse":
      return "Slows nearby";
  }
}

export interface EnemyProfile {
  readonly traits: readonly string[];
  readonly boss: boolean;
}

/** Traits relative to the rest of the roster, so wording follows balance changes. */
export function enemyProfile(enemy: EnemyDef, roster: readonly EnemyDef[]): EnemyProfile {
  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };
  const speed = median(roster.map((e) => e.speed));
  const leak = median(roster.map((e) => e.leakDamage));
  const boss = enemy.leakDamage >= Math.max(5, leak * 5);
  const traits: string[] = [];
  if (boss) traits.push("Boss");
  if (enemy.speed > speed * 1.4) traits.push("Fast");
  else if (enemy.speed < speed * 0.75) traits.push("Slow");
  if (enemy.armor >= 4) traits.push("Armored");
  if (traits.length === 0) traits.push("Basic");
  traits.push(`−${enemy.leakDamage} ${enemy.leakDamage === 1 ? "life" : "lives"}`);
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
