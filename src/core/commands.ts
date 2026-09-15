import type { TargetingMode } from "./content-types";
import { TARGETING_MODES } from "./content-types";
import { FlowField } from "./flow-field";
import type { SimulationInternals } from "./internals";
import type { PlacementError } from "./placement";
import { checkPlacement } from "./placement";
import type { TowerState } from "./state";
import { nextLevel, sellValue } from "./state";

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
  | { readonly type: "startWave" };

export type CommandType = Command["type"];

export type CommandError =
  | PlacementError
  | "game-over"
  | "unknown-tower-type"
  | "unknown-tower"
  | "insufficient-gold"
  | "max-level"
  | "invalid-targeting"
  | "wave-in-progress";

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

const startWave: Handler<Extract<Command, { type: "startWave" }>> = (sim) => {
  if (isOver(sim)) return fail("game-over");
  if (sim.world.phase === "wave") return fail("wave-in-progress");

  const wave = sim.content.wave(sim.world.wavesStarted);
  sim.world.wavesStarted += 1;
  sim.world.phase = "wave";
  sim.world.spawnQueue = wave.groups.map((group) => ({
    group,
    hpMultiplier: wave.hpMultiplier,
    spawned: 0,
    timer: group.delay,
  }));
  sim.events.emit("waveStarted", { wave: sim.world.wavesStarted });
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
};
