import type { AttackSpec, GameContent, TowerDef } from "./content-types";
import { TARGETING_MODES } from "./content-types";
import { FlowField } from "./flow-field";
import { Grid, GridParseError } from "./grid";

const isPositive = (n: number): boolean => Number.isFinite(n) && n > 0;
const isNonNegative = (n: number): boolean => Number.isFinite(n) && n >= 0;
const isPositiveInt = (n: number): boolean => Number.isInteger(n) && n > 0;
const isNonNegativeInt = (n: number): boolean => Number.isInteger(n) && n >= 0;

function duplicates(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

function validateAttack(where: string, attack: AttackSpec): string[] {
  const errors: string[] = [];
  if (!isPositive(attack.damage)) errors.push(`${where}: damage must be positive.`);
  switch (attack.kind) {
    case "projectile":
      if (!isPositive(attack.speed)) errors.push(`${where}: projectile speed must be positive.`);
      if (!isNonNegative(attack.splashRadius)) errors.push(`${where}: splashRadius must be >= 0.`);
      break;
    case "pulse":
      if (!(attack.slow.factor > 0 && attack.slow.factor <= 1)) {
        errors.push(`${where}: slow factor must be in (0, 1].`);
      }
      if (!isPositive(attack.slow.duration))
        errors.push(`${where}: slow duration must be positive.`);
      break;
    case "beam":
      break;
  }
  return errors;
}

function validateTower(tower: TowerDef): string[] {
  const errors: string[] = [];
  if (!TARGETING_MODES.includes(tower.defaultTargeting)) {
    errors.push(`Tower "${tower.id}": unknown default targeting "${tower.defaultTargeting}".`);
  }
  if (tower.hotkey.length !== 1) errors.push(`Tower "${tower.id}": hotkey must be one character.`);
  tower.levels.forEach((level, i) => {
    const where = `Tower "${tower.id}" level ${i + 1}`;
    if (!isPositiveInt(level.cost)) errors.push(`${where}: cost must be a positive integer.`);
    if (!isPositive(level.range)) errors.push(`${where}: range must be positive.`);
    if (!isPositive(level.cooldown)) errors.push(`${where}: cooldown must be positive.`);
    errors.push(...validateAttack(where, level.attack));
  });
  return errors;
}

/**
 * Validates content once at startup, so the simulation can trust it and no
 * gameplay code needs defensive checks for impossible data. Returns every
 * problem found rather than stopping at the first.
 */
export function validateContent(content: GameContent): string[] {
  const errors: string[] = [];
  const { towers, enemies, waves, rules, map } = content;

  if (towers.length === 0) errors.push("At least one tower is required.");
  for (const id of duplicates(towers.map((t) => t.id))) errors.push(`Duplicate tower id "${id}".`);
  for (const key of duplicates(towers.map((t) => t.hotkey)))
    errors.push(`Duplicate hotkey "${key}".`);
  towers.forEach((tower) => errors.push(...validateTower(tower)));

  if (enemies.length === 0) errors.push("At least one enemy is required.");
  for (const id of duplicates(enemies.map((e) => e.id))) errors.push(`Duplicate enemy id "${id}".`);
  for (const enemy of enemies) {
    const where = `Enemy "${enemy.id}"`;
    if (!isPositive(enemy.hp)) errors.push(`${where}: hp must be positive.`);
    if (!isPositive(enemy.speed)) errors.push(`${where}: speed must be positive.`);
    if (!isNonNegative(enemy.armor)) errors.push(`${where}: armor must be >= 0.`);
    if (!isNonNegativeInt(enemy.bounty))
      errors.push(`${where}: bounty must be a non-negative integer.`);
    if (!isPositiveInt(enemy.leakDamage))
      errors.push(`${where}: leakDamage must be a positive integer.`);
    if (!(enemy.radius > 0 && enemy.radius <= 0.5))
      errors.push(`${where}: radius must be in (0, 0.5].`);
  }

  const enemyIds = new Set(enemies.map((e) => e.id));
  if (waves.length === 0) errors.push("At least one wave is required.");
  waves.forEach((wave, w) => {
    const where = `Wave ${w + 1}`;
    if (wave.groups.length === 0) errors.push(`${where}: needs at least one spawn group.`);
    if (!isPositive(wave.hpMultiplier)) errors.push(`${where}: hpMultiplier must be positive.`);
    if (!isNonNegativeInt(wave.clearBonus))
      errors.push(`${where}: clearBonus must be a non-negative integer.`);
    wave.groups.forEach((group, g) => {
      const gWhere = `${where} group ${g + 1}`;
      if (!enemyIds.has(group.enemy)) errors.push(`${gWhere}: unknown enemy "${group.enemy}".`);
      if (!isPositiveInt(group.count)) errors.push(`${gWhere}: count must be a positive integer.`);
      if (!isNonNegative(group.interval)) errors.push(`${gWhere}: interval must be >= 0.`);
      if (!isNonNegative(group.delay)) errors.push(`${gWhere}: delay must be >= 0.`);
    });
  });

  if (!isNonNegativeInt(rules.startingGold))
    errors.push("startingGold must be a non-negative integer.");
  if (!isPositiveInt(rules.startingLives)) errors.push("startingLives must be a positive integer.");
  if (!(rules.sellRefundRatio >= 0 && rules.sellRefundRatio <= 1)) {
    errors.push("sellRefundRatio must be in [0, 1].");
  }
  if (!(rules.minDamageRatio > 0 && rules.minDamageRatio <= 1)) {
    errors.push("minDamageRatio must be in (0, 1].");
  }

  try {
    const grid = Grid.parse(map.rows);
    const field = FlowField.compute(grid);
    for (const spawn of grid.spawns) {
      if (!field.isReachable(spawn.x, spawn.y)) {
        errors.push(`Map "${map.id}": spawn (${spawn.x}, ${spawn.y}) cannot reach an exit.`);
      }
    }
  } catch (error) {
    if (!(error instanceof GridParseError)) throw error;
    errors.push(`Map "${map.id}": ${error.message}`);
  }

  return errors;
}
