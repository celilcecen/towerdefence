import type { ContentRegistry } from "../../src/core/content-registry";
import type { EnemyDef, TowerLevel } from "../../src/core/content-types";
import type { FlowField } from "../../src/core/flow-field";
import type { Cell } from "../../src/core/geometry";
import type { Grid } from "../../src/core/grid";
import type { Simulation } from "../../src/core/simulation";
import type { Bot } from "./bots";

export type GreedyMode = "maze" | "hug";

/**
 * Damage is tracked on four channels, because a tower that shreds a swarm of
 * runners can be useless against an armored flyer: ground light, ground
 * armored, air light, air armored.
 */
const CHANNELS = 4;
type Channels = [number, number, number, number];
const ARMORED = 3;
/** Scale of the diminishing returns per channel, in damage-per-second x cells of route. */
const SATURATION = 60;
/**
 * A tower shoots one target at a time, so covering more route than this many
 * cells stops adding damage once waves are dense.
 */
const COVER_CAP = 12;
/** Worth of one extra cell of ground route, in the same units, before towers line it. */
const ROUTE_CELL = 2;
/**
 * A wall grows long before it lengthens the route. Placements are also
 * credited for pushing up the distance-to-exit of cells beside the route
 * (within CORRIDOR cells), scaled by PHI and capped at PHI_CAP route cells so
 * the bot never spends its opening on walls alone.
 */
const PHI = 20;
const CORRIDOR = 2;
const PHI_CAP = 2;
/** Once towers line the route, an extra route cell is worth this many average route cells of damage. */
const ROUTE_GAIN = 2;

const zero = (): Channels => [0, 0, 0, 0];
const channelOf = (enemy: EnemyDef): number =>
  (enemy.flying === true ? 2 : 0) + (enemy.armor >= ARMORED ? 1 : 0);
const slowOf = (level: TowerLevel): number =>
  level.attack.kind === "pulse" ? 1 / level.attack.slow.factor : 1;

/** A stream of identical enemies the bot expects to face. */
interface Threat {
  readonly enemy: EnemyDef;
  readonly count: number;
  readonly hp: number;
  /** Cells between consecutive enemies, which decides how much splash and chains hit. */
  readonly spacing: number;
  readonly weight: number;
}

type Action =
  | { readonly kind: "build"; readonly tower: string; readonly cell: Cell; readonly cost: number }
  | { readonly kind: "upgrade"; readonly towerId: number; readonly cost: number };

interface Placed {
  readonly x: number;
  readonly y: number;
  readonly level: TowerLevel;
  /** Damage per second per channel, already scaled down for over-long coverage. */
  readonly dps: Channels;
}

interface Option {
  readonly range: number;
  readonly slow: number;
  readonly dps: Channels;
}

/** Points enemies pass, weighted by how long they spend there, as flat arrays for speed. */
interface Stops {
  readonly n: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly weight: Float64Array;
  readonly lane: Int32Array;
  readonly air: Uint8Array;
  /** Damage per channel (4 per stop) and strongest slow that existing towers put there. */
  readonly dps: Float64Array;
  readonly slow: Float64Array;
}

interface RawStop {
  readonly x: number;
  readonly y: number;
  readonly weight: number;
  readonly lane: number;
  readonly air: boolean;
}

function threats(content: ContentRegistry, from: number): Threat[] {
  const list: Threat[] = [];
  const add = (enemy: EnemyDef, count: number, hp: number, spacing: number, emphasis: number) => {
    list.push({ enemy, count, hp, spacing, weight: emphasis * count * hp });
    if (enemy.split) {
      const child = content.enemy(enemy.split.enemy);
      const childHp = (child.hp * hp) / enemy.hp;
      const childSpacing = Math.max(0.3, spacing / enemy.split.count);
      add(child, count * enemy.split.count, childHp, childSpacing, emphasis);
    }
  };
  content.waves.forEach((wave, i) => {
    if (i < from) return;
    // Plan for the whole level, but most carefully for what is about to arrive.
    const emphasis = i <= from + 1 ? 4 : i <= from + 3 ? 2 : 1;
    for (const group of wave.groups) {
      const enemy = content.enemy(group.enemy);
      const spacing = Math.max(0.3, enemy.speed * group.interval);
      add(enemy, group.count, enemy.hp * wave.hpMultiplier, spacing, emphasis);
    }
  });
  return list;
}

/** Expected damage per second of one tower level against one stream. */
function dpsAgainst(level: TowerLevel, threat: Threat, minRatio: number): number {
  const { attack } = level;
  const hit = (damage: number) =>
    Math.min(threat.hp, Math.max(damage * minRatio, damage - threat.enemy.armor));
  const extra = (reach: number, cap: number) =>
    Math.min(cap, threat.count - 1, reach / threat.spacing);
  let damage = 0;
  switch (attack.kind) {
    case "projectile":
      damage = hit(attack.damage);
      if (attack.splashRadius > 0) damage *= 1 + extra(2 * attack.splashRadius, 3);
      break;
    case "beam":
      damage = hit(attack.damage);
      break;
    case "pulse":
      damage = hit(attack.damage) * (1 + extra(2 * level.range, 4));
      break;
    case "chain": {
      const jumps =
        threat.spacing <= attack.jumpRange ? Math.min(attack.jumps, threat.count - 1) : 0;
      for (let i = 0; i <= jumps; i++) damage += hit(attack.damage * attack.falloff ** i);
      break;
    }
  }
  return damage / level.cooldown;
}

/** Groups spawn cells that touch (including diagonally) into lanes. */
function lanesOf(grid: Grid): Cell[][] {
  const lanes: Cell[][] = [];
  const assigned = new Set<Cell>();
  for (const spawn of grid.spawns) {
    if (assigned.has(spawn)) continue;
    const members: Cell[] = [];
    const queue = [spawn];
    assigned.add(spawn);
    while (queue.length > 0) {
      const cell = queue.pop()!;
      members.push(cell);
      for (const other of grid.spawns) {
        if (assigned.has(other)) continue;
        if (Math.max(Math.abs(other.x - cell.x), Math.abs(other.y - cell.y)) > 1) continue;
        assigned.add(other);
        queue.push(other);
      }
    }
    lanes.push(members);
  }
  return lanes;
}

function groundStops(grid: Grid, field: FlowField, lanes: readonly Cell[][]): RawStop[] {
  const stops: RawStop[] = [];
  lanes.forEach((spawns, lane) => {
    const weights = new Map<number, number>();
    for (const spawn of spawns) {
      for (const cell of field.pathFrom(spawn)) {
        const i = grid.index(cell.x, cell.y);
        weights.set(i, (weights.get(i) ?? 0) + 1 / spawns.length);
      }
    }
    for (const [i, weight] of weights) {
      const x = (i % grid.width) + 0.5;
      const y = Math.floor(i / grid.width) + 0.5;
      stops.push({ x, y, weight, lane, air: false });
    }
  });
  return stops;
}

/** Points along a lane's straight flight from its middle spawn to the nearest exit. */
function airStops(grid: Grid, lanes: readonly Cell[][]): RawStop[] {
  const stops: RawStop[] = [];
  lanes.forEach((spawns, lane) => {
    const spawn = spawns[Math.floor(spawns.length / 2)]!;
    const fx = spawn.x + 0.5;
    const fy = spawn.y + 0.5;
    let [tx, ty, span] = [fx, fy, Infinity];
    for (const exit of grid.exits) {
      const d = Math.hypot(exit.x + 0.5 - fx, exit.y + 0.5 - fy);
      if (d < span) [tx, ty, span] = [exit.x + 0.5, exit.y + 0.5, d];
    }
    const steps = Math.max(1, Math.ceil(span));
    for (let i = 0; i <= steps; i++) {
      const x = fx + ((tx - fx) * i) / steps;
      const y = fy + ((ty - fy) * i) / steps;
      stops.push({ x, y, weight: span / (steps + 1), lane, air: true });
    }
  });
  return stops;
}

/**
 * A map-agnostic bot that plays like a competent human who never uses powers
 * or calls waves early. It reads the coming waves to learn what it will face
 * (swarms, armor, flyers), then repeatedly buys whatever adds the most
 * expected damage per gold: a new tower on its best cell, or an upgrade.
 * Value has diminishing returns per channel and per lane, so it keeps a
 * sensible tower mix, defends every entrance, and covers the flyers' straight
 * line in proportion to how much of the threat flies. Frost is valued by how
 * much it multiplies the damage of the towers around it.
 *
 * "maze" also builds on the route when that lengthens it; "hug" never builds
 * on the route, so it has the same towers and upgrade policy but no maze.
 */
export class GreedyBot implements Bot {
  private target: Action | undefined;
  private learnedWave = -1;
  private dps = new Map<TowerLevel, Channels>();
  private shares: Channels = zero();
  private flyers = false;
  private retryAt = 0;
  /**
   * What building on a route cell would do to the route, keyed by cell. It
   * depends only on the grid, so it survives upgrades and new waves; `null`
   * marks a cell that cannot be built on right now.
   */
  private routes = new Map<number, { ground: RawStop[]; equiv: number } | null>();
  private routesFor = -1;

  constructor(
    readonly name: string,
    private readonly mode: GreedyMode,
    private readonly maxTowers = 60,
  ) {}

  act(simulation: Simulation): void {
    const { world } = simulation;
    if (world.tick < this.retryAt) return;
    for (let guard = 0; guard < 20; guard++) {
      if (this.learnedWave !== world.wavesStarted) {
        this.learn(simulation);
        this.target = undefined;
      }
      this.target ??= this.plan(simulation);
      const action = this.target;
      if (!action || world.gold < action.cost) return;
      const result =
        action.kind === "build"
          ? simulation.apply({ type: "placeTower", tower: action.tower, ...action.cell })
          : simulation.apply({ type: "upgradeTower", towerId: action.towerId });
      this.target = undefined;
      if (!result.ok) {
        // Usually an enemy standing on the cell; skip it until the grid changes and look again shortly.
        if (action.kind === "build") {
          this.routes.set(simulation.grid.index(action.cell.x, action.cell.y), null);
        }
        this.retryAt = world.tick + 10;
        return;
      }
    }
  }

  /** Re-reads the coming waves: the share of the threat on each channel, and each tower's worth. */
  private learn(simulation: Simulation): void {
    const { content, world } = simulation;
    this.learnedWave = world.wavesStarted;
    const current = world.phase === "wave" ? world.wavesStarted - 1 : world.wavesStarted;
    const list = threats(content, Math.max(0, current));
    this.flyers ||= list.some((t) => t.enemy.flying === true);
    const totals = zero();
    for (const t of list) {
      const c = channelOf(t.enemy);
      totals[c] = totals[c]! + t.weight;
    }
    const all = totals.reduce((a, b) => a + b, 0) || 1;
    this.shares = totals.map((v) => v / all) as Channels;

    this.dps = new Map();
    for (const tower of content.towers) {
      for (const level of tower.levels) {
        const sums = zero();
        for (const t of list) {
          if (tower.groundOnly === true && t.enemy.flying === true) continue;
          const c = channelOf(t.enemy);
          sums[c] = sums[c]! + t.weight * dpsAgainst(level, t, content.rules.minDamageRatio);
        }
        this.dps.set(level, sums.map((s, i) => (totals[i] ? s / totals[i] : 0)) as Channels);
      }
    }
  }

  private plan(simulation: Simulation): Action | undefined {
    const { grid, flow, content, world } = simulation;
    // This bot never sells, so the tower count identifies the grid.
    if (this.routesFor !== world.towers.length) {
      this.routes.clear();
      this.routesFor = world.towers.length;
    }
    const lanes = lanesOf(grid);
    const laneShare = lanes.map((spawns) => spawns.length / grid.spawns.length);
    const laneCount = lanes.length;
    const air = this.flyers ? airStops(grid, lanes) : [];

    /** Utility of per-lane strength, with `extra[offset + lane * 4 + channel]` added. */
    const utility = (strength: Float64Array, extra?: Float64Array, offset = 0): number => {
      let u = 0;
      for (let l = 0; l < laneCount; l++) {
        for (let c = 0; c < CHANNELS; c++) {
          const s = strength[l * CHANNELS + c]! + (extra ? extra[offset + l * CHANNELS + c]! : 0);
          u += laneShare[l]! * this.shares[c]! * Math.log1p(s / SATURATION);
        }
      }
      return u;
    };

    const base = [...groundStops(grid, flow, lanes), ...air];
    const coverOf = (x: number, y: number, range: number): number => {
      let covered = 0;
      for (const s of base) {
        const dx = s.x - x;
        const dy = s.y - y;
        if (dx * dx + dy * dy <= range * range) covered += laneShare[s.lane]! * s.weight;
      }
      return covered;
    };
    const towers: Placed[] = world.towers.map((t) => {
      const level = t.def.levels[t.level]!;
      const scale = Math.min(
        1,
        COVER_CAP / Math.max(coverOf(t.x + 0.5, t.y + 0.5, level.range), 1e-9),
      );
      const dps = (this.dps.get(level) ?? zero()).map((v) => v * scale) as Channels;
      return { x: t.x, y: t.y, level, dps };
    });

    const cellDps = new Float64Array(grid.width * grid.height * CHANNELS);
    const cellSlow = new Float64Array(grid.width * grid.height).fill(1);
    const exposeAt = (x: number, y: number, out: Float64Array, o: number): number => {
      let slow = 1;
      for (const t of towers) {
        const dx = t.x + 0.5 - x;
        const dy = t.y + 0.5 - y;
        if (dx * dx + dy * dy > t.level.range ** 2) continue;
        for (let c = 0; c < CHANNELS; c++) out[o + c]! += t.dps[c]!;
        slow = Math.max(slow, slowOf(t.level));
      }
      return slow;
    };
    for (let i = 0; i < grid.width * grid.height; i++) {
      const x = (i % grid.width) + 0.5;
      const y = Math.floor(i / grid.width) + 0.5;
      cellSlow[i] = exposeAt(x, y, cellDps, i * CHANNELS);
    }

    const flatten = (raw: readonly RawStop[]): Stops => {
      const n = raw.length;
      const stops: Stops = {
        n,
        x: new Float64Array(n),
        y: new Float64Array(n),
        weight: new Float64Array(n),
        lane: new Int32Array(n),
        air: new Uint8Array(n),
        dps: new Float64Array(n * CHANNELS),
        slow: new Float64Array(n),
      };
      raw.forEach((s, i) => {
        stops.x[i] = s.x;
        stops.y[i] = s.y;
        stops.weight[i] = s.weight;
        stops.lane[i] = s.lane;
        stops.air[i] = s.air ? 1 : 0;
        const first = s.air ? 2 : 0;
        if (s.air) {
          const tmp = new Float64Array(CHANNELS);
          stops.slow[i] = exposeAt(s.x, s.y, tmp, 0);
          stops.dps[i * CHANNELS + 2] = tmp[2]!;
          stops.dps[i * CHANNELS + 3] = tmp[3]!;
        } else {
          const cell = grid.index(s.x - 0.5, s.y - 0.5);
          stops.slow[i] = cellSlow[cell]!;
          for (let c = first; c < first + 2; c++) {
            stops.dps[i * CHANNELS + c] = cellDps[cell * CHANNELS + c]!;
          }
        }
      });
      return stops;
    };
    const strengthOf = (stops: Stops, onlyGround: boolean): Float64Array => {
      const strength = new Float64Array(laneCount * CHANNELS);
      for (let i = 0; i < stops.n; i++) {
        if (onlyGround && stops.air[i]) continue;
        for (let c = 0; c < CHANNELS; c++) {
          strength[stops.lane[i]! * CHANNELS + c]! +=
            stops.weight[i]! * stops.slow[i]! * stops.dps[i * CHANNELS + c]!;
        }
      }
      return strength;
    };

    const baseStops = flatten(base);
    const strength = strengthOf(baseStops, false);
    const baseGround = strengthOf(baseStops, true);
    const baseUtility = utility(strength);
    const distance = new Float64Array(4096);

    /**
     * Extra strength, per option then lane then channel, from putting each
     * option at a spot that currently holds `before` (or nothing).
     */
    const gains = (
      stops: Stops,
      sx: number,
      sy: number,
      options: readonly Option[],
      before?: Placed,
    ) => {
      const count = options.length;
      const out = new Float64Array(count * laneCount * CHANNELS);
      const scale = new Float64Array(count);
      // Squared distances throughout: this is the bot's hot loop.
      const ranges = new Float64Array(count);
      let reach = (before?.level.range ?? 0) ** 2;
      for (let k = 0; k < count; k++) {
        ranges[k] = options[k]!.range ** 2;
        reach = Math.max(reach, ranges[k]!);
      }
      for (let i = 0; i < stops.n; i++) {
        const dx = stops.x[i]! - sx;
        const dy = stops.y[i]! - sy;
        const d = dx * dx + dy * dy;
        distance[i] = d;
        if (d > reach) continue;
        const cover = laneShare[stops.lane[i]!]! * stops.weight[i]!;
        for (let k = 0; k < count; k++) if (d <= ranges[k]!) scale[k]! += cover;
      }
      for (let k = 0; k < count; k++) scale[k] = Math.min(1, COVER_CAP / Math.max(scale[k]!, 1e-9));
      const beforeRange = before ? before.level.range ** 2 : -1;
      for (let i = 0; i < stops.n; i++) {
        const d = distance[i]!;
        if (d > reach) continue;
        const first = stops.air[i] ? 2 : 0;
        const w = stops.weight[i]!;
        const slow0 = stops.slow[i]!;
        const inBefore = d <= beforeRange;
        const laneOffset = stops.lane[i]! * CHANNELS;
        for (let k = 0; k < count; k++) {
          const option = options[k]!;
          const inAfter = d <= ranges[k]!;
          if (!inAfter && !inBefore) continue;
          const slow = inAfter ? Math.max(slow0, option.slow) : slow0;
          for (let c = first; c < first + 2; c++) {
            const existing = stops.dps[i * CHANNELS + c]!;
            const own =
              (inAfter ? option.dps[c]! * scale[k]! : 0) - (inBefore ? before!.dps[c]! : 0);
            out[k * laneCount * CHANNELS + laneOffset + c]! +=
              w * (slow * (existing + own) - slow0 * existing);
          }
        }
      }
      return out;
    };

    let best: Action | undefined;
    let bestRatio = 0;
    const consider = (action: Action, extra: Float64Array, offset: number) => {
      const ratio = (utility(strength, extra, offset) - baseUtility) / action.cost;
      if (ratio > bestRatio) {
        best = action;
        bestRatio = ratio;
      }
    };
    const optionOf = (level: TowerLevel): Option => ({
      range: level.range,
      slow: slowOf(level),
      dps: this.dps.get(level) ?? zero(),
    });

    world.towers.forEach((tower, i) => {
      const next = tower.def.levels[tower.level + 1];
      if (!next) return;
      const extra = gains(baseStops, tower.x + 0.5, tower.y + 0.5, [optionOf(next)], towers[i]);
      consider({ kind: "upgrade", towerId: tower.id, cost: next.cost }, extra, 0);
    });

    if (world.towers.length >= this.maxTowers) return best;

    const onRoute = new Uint8Array(grid.width * grid.height);
    const laneRoute = new Float64Array(laneCount);
    for (let i = 0; i < baseStops.n; i++) {
      if (baseStops.air[i]) continue;
      onRoute[grid.index(baseStops.x[i]! - 0.5, baseStops.y[i]! - 0.5)] = 1;
      laneRoute[baseStops.lane[i]!]! += baseStops.weight[i]!;
    }
    const routeLength = (field: FlowField) =>
      grid.spawns.reduce((sum, s) => sum + field.distanceAt(s.x, s.y), 0) / grid.spawns.length;
    const length = routeLength(flow);
    // Cells beside the route: pushing their distance up means a wall is growing across it.
    const corridor: number[] = [];
    for (let yy = 0; yy < grid.height; yy++) {
      for (let xx = 0; xx < grid.width; xx++) {
        let close = false;
        for (let dy = -CORRIDOR; dy <= CORRIDOR && !close; dy++) {
          for (let dx = -CORRIDOR; dx <= CORRIDOR && !close; dx++) {
            close = grid.contains(xx + dx, yy + dy) && onRoute[grid.index(xx + dx, yy + dy)] === 1;
          }
        }
        if (close) corridor.push(grid.index(xx, yy));
      }
    }
    const potential = (field: FlowField) => {
      let sum = 0;
      for (const i of corridor) {
        const d = field.distanceAt(i % grid.width, Math.floor(i / grid.width));
        if (Number.isFinite(d)) sum += d;
      }
      return sum / Math.max(1, corridor.length);
    };
    const basePotential = potential(flow);
    const groundShare = this.shares[0] + this.shares[1] || 1;
    const options = content.towers.map((def) => optionOf(def.levels[0]));
    const reach = Math.max(...options.map((o) => o.range));
    const near = new Uint8Array(grid.width * grid.height);
    for (const s of base) {
      for (
        let y = Math.max(0, Math.floor(s.y - reach));
        y <= Math.min(grid.height - 1, s.y + reach);
        y++
      ) {
        for (
          let x = Math.max(0, Math.floor(s.x - reach));
          x <= Math.min(grid.width - 1, s.x + reach);
          x++
        ) {
          near[grid.index(x, y)] = 1;
        }
      }
    }
    const block = laneCount * CHANNELS;

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const index = grid.index(x, y);
        if (!grid.isBuildable(x, y) || !near[index]) continue;
        let stops = baseStops;
        let shift: Float64Array | undefined;
        if (this.routes.get(index) === null) continue;
        if (onRoute[index]) {
          if (this.mode === "hug") continue;
          let route = this.routes.get(index);
          if (route === undefined) {
            const check = simulation.checkPlacement(x, y);
            route = check.ok
              ? {
                  ground: groundStops(grid, check.field, lanes),
                  equiv:
                    routeLength(check.field) -
                    length +
                    Math.min(PHI_CAP, PHI * (potential(check.field) - basePotential)),
                }
              : null;
            this.routes.set(index, route);
          }
          if (route === null) continue;
          stops = flatten([...route.ground, ...air]);
          shift = strengthOf(stops, true);
          const { equiv } = route;
          for (let l = 0; l < laneCount; l++) {
            for (let c = 0; c < 2; c++) {
              const old = baseGround[l * CHANNELS + c]!;
              const perCell = Math.max(
                (ROUTE_CELL * this.shares[c]!) / groundShare,
                (ROUTE_GAIN * old) / Math.max(1, laneRoute[l]!),
              );
              shift[l * CHANNELS + c]! += equiv * perCell - old;
            }
          }
        }
        const extra = gains(stops, x + 0.5, y + 0.5, options);
        content.towers.forEach((def, k) => {
          if (shift) for (let j = 0; j < block; j++) extra[k * block + j]! += shift[j]!;
          const cost = def.levels[0].cost;
          consider({ kind: "build", tower: def.id, cell: { x, y }, cost }, extra, k * block);
        });
      }
    }
    return best;
  }
}
