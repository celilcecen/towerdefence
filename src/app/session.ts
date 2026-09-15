import type { Command, CommandResult } from "../core/commands";
import type { ContentRegistry } from "../core/content-registry";
import type { TargetingMode } from "../core/content-types";
import { EventBus } from "../core/events";
import type { Cell } from "../core/geometry";
import type { BestRecord, RecordStore } from "../core/records";
import { isBetter } from "../core/records";
import { Simulation } from "../core/simulation";
import type { TowerState } from "../core/state";
import type { LoopControl } from "./game-loop";
import { COMMAND_ERROR_MESSAGES } from "./messages";

export type Selection =
  | { readonly kind: "none" }
  | { readonly kind: "build"; readonly tower: string }
  | { readonly kind: "tower"; readonly towerId: number };

export interface GameResult extends BestRecord {
  readonly newRecord: boolean;
}

export interface SessionEvents {
  restarted: { readonly simulation: Simulation };
  notice: { readonly message: string };
}

export const SPEEDS: readonly number[] = [1, 2, 3];

const NONE: Selection = { kind: "none" };

/**
 * Application state around one game: selection, hover, pause, speed, the
 * persisted best record. It translates player gestures into simulation
 * commands and turns rejected commands into player-facing notices. It has no
 * DOM dependency, so every interaction rule is unit-tested.
 */
export class GameSession implements LoopControl {
  readonly events = new EventBus<SessionEvents>();
  speed = SPEEDS[0] ?? 1;
  paused = false;
  started = false;

  private sim: Simulation;
  private currentSelection: Selection = NONE;
  private hoverCell: Cell | undefined;
  private result: GameResult | undefined;
  private bestRecord: BestRecord | undefined;

  constructor(
    private readonly content: ContentRegistry,
    private readonly records: RecordStore,
    private readonly nextSeed: () => number,
  ) {
    this.bestRecord = records.load();
    this.sim = this.createSimulation();
  }

  get simulation(): Simulation {
    return this.sim;
  }

  get selection(): Selection {
    return this.currentSelection;
  }

  get hover(): Cell | undefined {
    return this.hoverCell;
  }

  get lastResult(): GameResult | undefined {
    return this.result;
  }

  get best(): BestRecord | undefined {
    return this.bestRecord;
  }

  get selectedTower(): Readonly<TowerState> | undefined {
    const selection = this.currentSelection;
    if (selection.kind !== "tower") return undefined;
    return this.sim.world.towers.find((t) => t.id === selection.towerId);
  }

  /** Play button: starts the first game, or a fresh one after a finished game. */
  play(): void {
    if (this.sim.isOver) this.restart();
    this.started = true;
    this.paused = false;
  }

  restart(): void {
    this.sim = this.createSimulation();
    this.currentSelection = NONE;
    this.result = undefined;
    this.paused = false;
    this.events.emit("restarted", { simulation: this.sim });
  }

  step(): void {
    if (this.started) this.sim.step();
  }

  selectBuild(tower: string): void {
    if (!this.content.hasTower(tower)) return;
    const current = this.currentSelection;
    this.currentSelection =
      current.kind === "build" && current.tower === tower ? NONE : { kind: "build", tower };
  }

  cancel(): void {
    this.currentSelection = NONE;
  }

  setHover(cell: Cell | undefined): void {
    this.hoverCell = cell;
  }

  /** A tap or click on the board: build in build mode, otherwise inspect. */
  activateCell(cell: Cell): void {
    if (!this.started || this.sim.isOver) return;
    const selection = this.currentSelection;
    if (selection.kind === "build") {
      this.dispatch({ type: "placeTower", tower: selection.tower, x: cell.x, y: cell.y });
      return;
    }
    const occupant = this.sim.grid.occupantAt(cell.x, cell.y);
    this.currentSelection = occupant === undefined ? NONE : { kind: "tower", towerId: occupant };
  }

  upgradeSelected(): void {
    const tower = this.selectedTower;
    if (tower) this.dispatch({ type: "upgradeTower", towerId: tower.id });
  }

  sellSelected(): void {
    const tower = this.selectedTower;
    if (tower && this.dispatch({ type: "sellTower", towerId: tower.id }).ok) this.cancel();
  }

  setTargeting(mode: TargetingMode): void {
    const tower = this.selectedTower;
    if (tower) this.dispatch({ type: "setTargeting", towerId: tower.id, mode });
  }

  startWave(): void {
    if (this.started) this.dispatch({ type: "startWave" });
  }

  togglePause(): void {
    if (this.started && !this.sim.isOver) this.paused = !this.paused;
  }

  cycleSpeed(): void {
    const index = SPEEDS.indexOf(this.speed);
    this.speed = SPEEDS[(index + 1) % SPEEDS.length] ?? 1;
  }

  private dispatch(command: Command): CommandResult {
    const result = this.sim.apply(command);
    if (!result.ok) this.events.emit("notice", { message: COMMAND_ERROR_MESSAGES[result.error] });
    return result;
  }

  private createSimulation(): Simulation {
    const sim = new Simulation(this.content, { seed: this.nextSeed() });
    sim.events.on("gameOver", ({ won }) => {
      const record: BestRecord = { wave: sim.world.wavesStarted, won, lives: sim.world.lives };
      const newRecord = isBetter(record, this.bestRecord);
      if (newRecord) {
        this.bestRecord = record;
        this.records.save(record);
      }
      this.result = { ...record, newRecord };
      this.currentSelection = NONE;
    });
    return sim;
  }
}
