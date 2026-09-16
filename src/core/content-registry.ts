import type {
  EnemyDef,
  GameContent,
  MapDef,
  PowerDef,
  RulesDef,
  TowerDef,
  WaveDef,
} from "./content-types";
import { validateContent } from "./validate-content";

export class InvalidContentError extends Error {
  override readonly name = "InvalidContentError";

  constructor(readonly problems: readonly string[]) {
    super(`Invalid game content:\n- ${problems.join("\n- ")}`);
  }
}

export class UnknownContentError extends Error {
  override readonly name = "UnknownContentError";
}

/** Validated, indexed access to game content. Construction fails fast on bad data. */
export class ContentRegistry {
  private readonly towersById: ReadonlyMap<string, TowerDef>;
  private readonly enemiesById: ReadonlyMap<string, EnemyDef>;
  private readonly powersById: ReadonlyMap<string, PowerDef>;

  constructor(private readonly content: GameContent) {
    const problems = validateContent(content);
    if (problems.length > 0) throw new InvalidContentError(problems);
    this.towersById = new Map(content.towers.map((t) => [t.id, t]));
    this.enemiesById = new Map(content.enemies.map((e) => [e.id, e]));
    this.powersById = new Map(content.powers.map((p) => [p.id, p]));
  }

  get towers(): readonly TowerDef[] {
    return this.content.towers;
  }

  get enemies(): readonly EnemyDef[] {
    return this.content.enemies;
  }

  get powers(): readonly PowerDef[] {
    return this.content.powers;
  }

  get waves(): readonly WaveDef[] {
    return this.content.waves;
  }

  get map(): MapDef {
    return this.content.map;
  }

  get rules(): RulesDef {
    return this.content.rules;
  }

  hasTower(id: string): boolean {
    return this.towersById.has(id);
  }

  hasPower(id: string): boolean {
    return this.powersById.has(id);
  }

  tower(id: string): TowerDef {
    const tower = this.towersById.get(id);
    if (!tower) throw new UnknownContentError(`Unknown tower "${id}".`);
    return tower;
  }

  enemy(id: string): EnemyDef {
    const enemy = this.enemiesById.get(id);
    if (!enemy) throw new UnknownContentError(`Unknown enemy "${id}".`);
    return enemy;
  }

  power(id: string): PowerDef {
    const power = this.powersById.get(id);
    if (!power) throw new UnknownContentError(`Unknown power "${id}".`);
    return power;
  }

  wave(index: number): WaveDef {
    const wave = this.content.waves[index];
    if (!wave) throw new UnknownContentError(`Unknown wave index ${index}.`);
    return wave;
  }
}
