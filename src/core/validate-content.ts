import type {
  AttackSpec,
  EnemyDef,
  GameContent,
  HeroDef,
  PowerDef,
  TowerDef,
} from "./content-types";
import { TARGETING_MODES } from "./content-types";
import { FlowField } from "./flow-field";
import { Grid, GridParseError } from "./grid";

const isPositive = (n: number): boolean => Number.isFinite(n) && n > 0;
const isNonNegative = (n: number): boolean => Number.isFinite(n) && n >= 0;
const isPositiveInt = (n: number): boolean => Number.isInteger(n) && n > 0;
const isNonNegativeInt = (n: number): boolean => Number.isInteger(n) && n >= 0;
const isRatio = (n: number): boolean => n > 0 && n <= 1;

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
      if (!isRatio(attack.slow.factor)) errors.push(`${where}: slow factor must be in (0, 1].`);
      if (!isPositive(attack.slow.duration))
        errors.push(`${where}: slow duration must be positive.`);
      break;
    case "chain":
      if (!isNonNegativeInt(attack.jumps))
        errors.push(`${where}: jumps must be a non-negative integer.`);
      if (!isPositive(attack.jumpRange)) errors.push(`${where}: jumpRange must be positive.`);
      if (!isRatio(attack.falloff)) errors.push(`${where}: falloff must be in (0, 1].`);
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

function validateEnemy(enemy: EnemyDef, enemyIds: ReadonlySet<string>): string[] {
  const where = `Enemy "${enemy.id}"`;
  const errors: string[] = [];
  if (!isPositive(enemy.hp)) errors.push(`${where}: hp must be positive.`);
  if (!isPositive(enemy.speed)) errors.push(`${where}: speed must be positive.`);
  if (!isNonNegative(enemy.armor)) errors.push(`${where}: armor must be >= 0.`);
  if (!isNonNegativeInt(enemy.bounty))
    errors.push(`${where}: bounty must be a non-negative integer.`);
  if (!isPositiveInt(enemy.leakDamage))
    errors.push(`${where}: leakDamage must be a positive integer.`);
  if (!(enemy.radius > 0 && enemy.radius <= 0.5))
    errors.push(`${where}: radius must be in (0, 0.5].`);
  if (enemy.split) {
    if (!enemyIds.has(enemy.split.enemy))
      errors.push(`${where}: splits into unknown enemy "${enemy.split.enemy}".`);
    if (!isPositiveInt(enemy.split.count))
      errors.push(`${where}: split count must be a positive integer.`);
  }
  if (enemy.heal) {
    if (!isPositive(enemy.heal.amount)) errors.push(`${where}: heal amount must be positive.`);
    if (!isPositive(enemy.heal.radius)) errors.push(`${where}: heal radius must be positive.`);
    if (!isPositive(enemy.heal.interval)) errors.push(`${where}: heal interval must be positive.`);
  }
  return errors;
}

/** A splitter whose descendants split back into it would never finish dying. */
function splitCycles(enemies: readonly EnemyDef[]): string[] {
  const byId = new Map(enemies.map((e) => [e.id, e]));
  const errors: string[] = [];
  for (const start of enemies) {
    const seen = new Set<string>([start.id]);
    let next = start.split?.enemy;
    while (next !== undefined) {
      if (next === start.id) {
        errors.push(`Enemy "${start.id}": split chain loops back to itself.`);
        break;
      }
      if (seen.has(next)) break;
      seen.add(next);
      next = byId.get(next)?.split?.enemy;
    }
  }
  return errors;
}

function validatePower(power: PowerDef): string[] {
  const where = `Power "${power.id}"`;
  const errors: string[] = [];
  if (!isPositive(power.cooldown)) errors.push(`${where}: cooldown must be positive.`);
  const { spec } = power;
  switch (spec.kind) {
    case "strike":
      if (!isPositive(spec.damage)) errors.push(`${where}: damage must be positive.`);
      if (!isPositive(spec.radius)) errors.push(`${where}: radius must be positive.`);
      break;
    case "freeze":
      if (!isRatio(spec.slow.factor)) errors.push(`${where}: slow factor must be in (0, 1].`);
      if (!isPositive(spec.slow.duration)) errors.push(`${where}: slow duration must be positive.`);
      break;
  }
  return errors;
}

function validateHero(hero: HeroDef): string[] {
  const where = `Hero "${hero.id}"`;
  const errors: string[] = [];
  if (!isPositive(hero.hp)) errors.push(`${where}: hp must be positive.`);
  if (!isPositive(hero.speed)) errors.push(`${where}: speed must be positive.`);
  if (!(hero.radius > 0 && hero.radius <= 0.5))
    errors.push(`${where}: radius must be in (0, 0.5].`);
  if (!isPositive(hero.attack.damage)) errors.push(`${where}: attack damage must be positive.`);
  if (!isPositive(hero.attack.cooldown)) errors.push(`${where}: attack cooldown must be positive.`);
  if (!isPositive(hero.attack.range)) errors.push(`${where}: attack range must be positive.`);
  if (!isPositive(hero.attack.speed)) errors.push(`${where}: attack speed must be positive.`);
  if (!isPositive(hero.dash.distance)) errors.push(`${where}: dash distance must be positive.`);
  if (!isPositive(hero.dash.duration)) errors.push(`${where}: dash duration must be positive.`);
  if (!isPositive(hero.dash.cooldown)) errors.push(`${where}: dash cooldown must be positive.`);
  if (!isPositive(hero.nova.damage)) errors.push(`${where}: nova damage must be positive.`);
  if (!isPositive(hero.nova.radius)) errors.push(`${where}: nova radius must be positive.`);
  if (!isPositive(hero.nova.charge)) errors.push(`${where}: nova charge must be positive.`);
  if (!isRatio(hero.nova.slow.factor)) errors.push(`${where}: nova slow factor must be in (0, 1].`);
  if (!isPositive(hero.nova.slow.duration))
    errors.push(`${where}: nova slow duration must be positive.`);
  if (!isNonNegative(hero.contactDamage)) errors.push(`${where}: contactDamage must be >= 0.`);
  if (!isNonNegative(hero.regen)) errors.push(`${where}: regen must be >= 0.`);
  if (!isPositive(hero.respawn)) errors.push(`${where}: respawn must be positive.`);
  return errors;
}

/**
 * Validates content once at startup, so the simulation can trust it and no
 * gameplay code needs defensive checks for impossible data. Returns every
 * problem found rather than stopping at the first.
 */
export function validateContent(content: GameContent): string[] {
  const errors: string[] = [];
  const { towers, enemies, waves, powers, hero, rules, map } = content;

  if (towers.length === 0) errors.push("At least one tower is required.");
  for (const id of duplicates(towers.map((t) => t.id))) errors.push(`Duplicate tower id "${id}".`);
  for (const key of duplicates(towers.map((t) => t.hotkey)))
    errors.push(`Duplicate hotkey "${key}".`);
  towers.forEach((tower) => errors.push(...validateTower(tower)));

  const enemyIds = new Set(enemies.map((e) => e.id));
  if (enemies.length === 0) errors.push("At least one enemy is required.");
  for (const id of duplicates(enemies.map((e) => e.id))) errors.push(`Duplicate enemy id "${id}".`);
  for (const enemy of enemies) errors.push(...validateEnemy(enemy, enemyIds));
  errors.push(...splitCycles(enemies));

  for (const id of duplicates(powers.map((p) => p.id))) errors.push(`Duplicate power id "${id}".`);
  powers.forEach((power) => errors.push(...validatePower(power)));
  if (hero) errors.push(...validateHero(hero));

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
  if (!isRatio(rules.minDamageRatio)) errors.push("minDamageRatio must be in (0, 1].");
  if (!(rules.earlyCallRatio >= 0 && rules.earlyCallRatio <= 1)) {
    errors.push("earlyCallRatio must be in [0, 1].");
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
