import { applyDamage, applySlow } from "./combat/damage";
import type { TargetingMode } from "./content-types";
import { TARGETING_MODES } from "./content-types";
import { FlowField } from "./flow-field";
import { distance } from "./geometry";
import { evictHero } from "./hero";
import type { SimulationInternals } from "./internals";
import type { PlacementError } from "./placement";
import { checkPlacement } from "./placement";
import type { TowerState } from "./state";
import { nextLevel, sellValue } from "./state";
import { detonateNova } from "./systems/hero";

/**
 * Every player intent is a serialisable command. The UI, keyboard shortcuts,
 * tests and bots all drive the game through this one narrow interface, and a
 * list of (tick, command) pairs is a complete replay.
 */
export type Command =
  | { readonly type: "placeTower"; readonly tower: string; readonly x: number; readonly y: number }
  | { readonly type: "upgradeTower"; readonly towerId: number }
  | { readonly type: "sellTower"; readonly towerId: number }
  | { readonly type: "setTargeting"; readonly towerId: number; readonly mode: TargetingMode }
  | { readonly type: "startWave" }
  | { readonly type: "castPower"; readonly power: string; readonly x: number; readonly y: number }
  /** Where the hero should head: a vector of length 0 (stop) to 1 (full speed). */
  | { readonly type: "moveHero"; readonly dx: number; readonly dy: number }
  | { readonly type: "heroDash" }
  | { readonly type: "heroNova" };

export type CommandType = Command["type"];

export type CommandError =
  | PlacementError
  | "game-over"
  | "unknown-tower-type"
  | "unknown-tower"
  | "insufficient-gold"
  | "max-level"
  | "invalid-targeting"
  | "wave-in-progress"
  | "no-more-waves"
  | "unknown-power"
  | "power-not-ready"
  | "no-wave-active"
  | "no-hero"
  | "hero-down"
  | "dash-not-ready"
  | "nova-not-charged";

export type CommandResult =
  { readonly ok: true } | { readonly ok: false; readonly error: CommandError };

type Handler<C extends Command> = (sim: SimulationInternals, command: C) => CommandResult;

const OK: CommandResult = { ok: true };
const fail = (error: CommandError): CommandResult => ({ ok: false, error });

const isOver = (sim: SimulationInternals): boolean =>
  sim.world.phase === "won" || sim.world.phase === "lost";

const findTower = (sim: SimulationInternals, id: number): TowerState | undefined =>
  sim.world.towers.find((t) => t.id === id);

const placeTower: Handler<Extract<Command, { type: "placeTower" }>> = (sim, command) => {
  if (isOver(sim)) return fail("game-over");
  if (!sim.content.hasTower(command.tower)) return fail("unknown-tower-type");

  const placement = checkPlacement(sim, command.x, command.y);
  if (!placement.ok) return fail(placement.error);

  const def = sim.content.tower(command.tower);
  const cost = def.levels[0].cost;
  if (sim.world.gold < cost) return fail("insufficient-gold");

  const tower: TowerState = {
    id: sim.world.nextId++,
    def,
    x: command.x,
    y: command.y,
    level: 0,
    cooldown: 0,
    targeting: def.defaultTargeting,
    invested: cost,
  };
  sim.world.gold -= cost;
  sim.world.towers.push(tower);
  sim.grid.setOccupant(tower.x, tower.y, tower.id);
  sim.flow = placement.field;
  if (sim.world.hero) evictHero(sim.grid, sim.world.hero, tower);
  sim.events.emit("towerPlaced", { tower });
  return OK;
};

const upgradeTower: Handler<Extract<Command, { type: "upgradeTower" }>> = (sim, command) => {
  if (isOver(sim)) return fail("game-over");
  const tower = findTower(sim, command.towerId);
  if (!tower) return fail("unknown-tower");
  const upgrade = nextLevel(tower);
  if (!upgrade) return fail("max-level");
  if (sim.world.gold < upgrade.cost) return fail("insufficient-gold");

  sim.world.gold -= upgrade.cost;
  tower.level += 1;
  tower.invested += upgrade.cost;
  sim.events.emit("towerUpgraded", { tower });
  return OK;
};

const sellTower: Handler<Extract<Command, { type: "sellTower" }>> = (sim, command) => {
  if (isOver(sim)) return fail("game-over");
  const tower = findTower(sim, command.towerId);
  if (!tower) return fail("unknown-tower");

  const refund = sellValue(tower, sim.content.rules.sellRefundRatio);
  sim.world.gold += refund;
  sim.world.towers = sim.world.towers.filter((t) => t !== tower);
  sim.grid.clearOccupant(tower.x, tower.y);
  sim.flow = FlowField.compute(sim.grid);
  sim.events.emit("towerSold", { tower, refund });
  return OK;
};

const setTargeting: Handler<Extract<Command, { type: "setTargeting" }>> = (sim, command) => {
  if (isOver(sim)) return fail("game-over");
  const tower = findTower(sim, command.towerId);
  if (!tower) return fail("unknown-tower");
  // Commands can originate outside the type system (replays, UI values), so validate at runtime.
  if (!TARGETING_MODES.includes(command.mode)) return fail("invalid-targeting");
  tower.targeting = command.mode;
  return OK;
};

/**
 * Starts the next wave. During a wave it calls the next one early, but only
 * once the current waves have released every enemy, and pays part of the
 * next wave's clear bonus up front for the risk.
 */
const startWave: Handler<Extract<Command, { type: "startWave" }>> = (sim) => {
  if (isOver(sim)) return fail("game-over");
  const { world, content } = sim;
  const early = world.phase === "wave";
  if (early && world.spawnQueue.length > 0) return fail("wave-in-progress");
  if (world.wavesStarted >= content.waves.length) return fail("no-more-waves");

  const wave = content.wave(world.wavesStarted);
  const bonus = early ? Math.floor(wave.clearBonus * content.rules.earlyCallRatio) : 0;
  world.wavesStarted += 1;
  world.phase = "wave";
  world.gold += bonus;
  world.spawnQueue = wave.groups.map((group) => ({
    group,
    hpMultiplier: wave.hpMultiplier,
    spawned: 0,
    timer: group.delay,
  }));
  sim.events.emit("waveStarted", { wave: world.wavesStarted, early, bonus });
  return OK;
};

const castPower: Handler<Extract<Command, { type: "castPower" }>> = (sim, command) => {
  if (isOver(sim)) return fail("game-over");
  const { world, content, grid } = sim;
  const state = world.powers.find((p) => p.id === command.power);
  if (!state || !content.hasPower(command.power)) return fail("unknown-power");
  if (world.phase !== "wave") return fail("no-wave-active");
  if (state.cooldown > 0) return fail("power-not-ready");

  const power = content.power(command.power);
  const { spec } = power;
  let targets = 0;
  switch (spec.kind) {
    case "strike": {
      const { x, y } = command;
      if (!(Number.isFinite(x) && Number.isFinite(y))) return fail("out-of-bounds");
      if (x < 0 || y < 0 || x > grid.width || y > grid.height) return fail("out-of-bounds");
      for (const enemy of world.enemies) {
        if (enemy.status !== "alive" || distance({ x, y }, enemy) > spec.radius) continue;
        applyDamage(sim, enemy, spec.damage);
        targets++;
      }
      break;
    }
    case "freeze":
      for (const enemy of world.enemies) {
        if (enemy.status !== "alive") continue;
        applySlow(enemy, spec.slow);
        targets++;
      }
      break;
  }
  state.cooldown = power.cooldown;
  sim.events.emit("powerCast", { power, x: command.x, y: command.y, targets });
  return OK;
};

const moveHero: Handler<Extract<Command, { type: "moveHero" }>> = (sim, command) => {
  const { hero } = sim.world;
  if (!hero) return fail("no-hero");
  const { dx, dy } = command;
  if (!(Number.isFinite(dx) && Number.isFinite(dy))) return fail("out-of-bounds");
  const length = Math.hypot(dx, dy);
  const scale = length > 1 ? 1 / length : 1;
  hero.moveX = dx * scale;
  hero.moveY = dy * scale;
  return OK;
};

/** Dashes the way the hero is moving, or the way it faces when standing still. */
const heroDash: Handler<Extract<Command, { type: "heroDash" }>> = (sim) => {
  if (isOver(sim)) return fail("game-over");
  const { hero } = sim.world;
  if (!hero) return fail("no-hero");
  if (hero.status === "down") return fail("hero-down");
  if (hero.dashCooldown > 0 || hero.dashTimer > 0) return fail("dash-not-ready");
  const moving = hero.moveX !== 0 || hero.moveY !== 0;
  const length = moving ? Math.hypot(hero.moveX, hero.moveY) : 1;
  hero.dashX = moving ? hero.moveX / length : Math.cos(hero.facing);
  hero.dashY = moving ? hero.moveY / length : Math.sin(hero.facing);
  hero.facing = Math.atan2(hero.dashY, hero.dashX);
  hero.dashTimer = hero.def.dash.duration;
  hero.dashCooldown = hero.def.dash.cooldown;
  sim.events.emit("heroDashed", { hero, dx: hero.dashX, dy: hero.dashY });
  return OK;
};

const heroNova: Handler<Extract<Command, { type: "heroNova" }>> = (sim) => {
  if (isOver(sim)) return fail("game-over");
  const { hero } = sim.world;
  if (!hero) return fail("no-hero");
  if (hero.status === "down") return fail("hero-down");
  if (hero.charge < 1) return fail("nova-not-charged");
  const targets = detonateNova(sim, hero);
  hero.charge = 0;
  sim.events.emit("heroNova", { hero, radius: hero.def.nova.radius, targets });
  return OK;
};

export const COMMAND_HANDLERS: {
  readonly [K in CommandType]: Handler<Extract<Command, { type: K }>>;
} = {
  placeTower,
  upgradeTower,
  sellTower,
  setTargeting,
  startWave,
  castPower,
  moveHero,
  heroDash,
  heroNova,
};
