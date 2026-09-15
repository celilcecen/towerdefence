import type { EnemyDef, GameContent, MapDef, RulesDef, TowerDef, WaveDef } from "./content-types";
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

  constructor(private readonly content: GameContent) {
    const problems = validateContent(content);
    if (problems.length > 0) throw new InvalidContentError(problems);
    this.towersById = new Map(content.towers.map((t) => [t.id, t]));
    this.enemiesById = new Map(content.enemies.map((e) => [e.id, e]));
  }

  get towers(): readonly TowerDef[] {
    return this.content.towers;
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

  wave(index: number): WaveDef {
    const wave = this.content.waves[index];
    if (!wave) throw new UnknownContentError(`Unknown wave index ${index}.`);
    return wave;
  }
}
