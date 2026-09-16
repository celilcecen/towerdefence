import type { Command, CommandError, CommandResult } from "../core/commands";
import type { ContentRegistry } from "../core/content-registry";
import type { TargetingMode } from "../core/content-types";
import { EventBus } from "../core/events";
import type { Cell } from "../core/geometry";
import { cellCenter } from "../core/geometry";
import { Simulation } from "../core/simulation";
import type { HeroState, PowerState, TowerState } from "../core/state";
import type { LoopControl } from "./game-loop";

export type Selection =
  | { readonly kind: "none" }
  | { readonly kind: "build"; readonly tower: string }
  | { readonly kind: "tower"; readonly towerId: number }
  | { readonly kind: "power"; readonly power: string };

export interface SessionOutcome {
  readonly won: boolean;
  /** Waves started when the game ended. */
  readonly wave: number;
  readonly lives: number;
}

export interface SessionEvents {
  /** A new simulation replaced the old one: a new level, or a restart. */
  loaded: { readonly simulation: Simulation };
  /** A command was refused; adapters decide how to tell the player. */
  rejected: { readonly error: CommandError };
  /** A build tap landed outside the cells the tutorial allows. */
  offGuide: { readonly cell: Cell };
  finished: SessionOutcome;
}

export const SPEEDS: readonly number[] = [1, 2, 3];

const NONE: Selection = { kind: "none" };

/**
 * Application state around one game: selection, hover, pause and speed. It
 * translates player gestures into simulation commands and reports refused
 * commands and the final outcome. It has no DOM dependency, so every
 * interaction rule is unit-tested.
 */
export class GameSession implements LoopControl {
  readonly events = new EventBus<SessionEvents>();
  speed = SPEEDS[0] ?? 1;
  paused = false;
  started = false;

  private sim: Simulation;
  private currentSelection: Selection = NONE;
  private hoverCell: Cell | undefined;
  private finalOutcome: SessionOutcome | undefined;
  private guideCells: readonly Cell[] | undefined;

  constructor(
    private registry: ContentRegistry,
    private readonly nextSeed: () => number,
  ) {
    this.sim = this.createSimulation();
  }

  get simulation(): Simulation {
    return this.sim;
  }

  get content(): ContentRegistry {
    return this.registry;
  }

  get selection(): Selection {
    return this.currentSelection;
  }

  get hover(): Cell | undefined {
    return this.hoverCell;
  }

  get outcome(): SessionOutcome | undefined {
    return this.finalOutcome;
  }

  get selectedTower(): Readonly<TowerState> | undefined {
    const selection = this.currentSelection;
    if (selection.kind !== "tower") return undefined;
    return this.sim.world.towers.find((t) => t.id === selection.towerId);
  }

  /** Swaps in different content (another level) and waits for `start`. */
  load(content: ContentRegistry): void {
    this.registry = content;
    this.reset();
    this.started = false;
  }

  /** Begins play on the loaded simulation. */
  start(): void {
    this.started = true;
    this.paused = false;
  }

  /** A fresh game on the same content, started immediately. */
  restart(): void {
    this.reset();
    this.start();
  }

  step(): void {
    if (this.started && !this.paused) this.sim.step();
  }

  selectBuild(tower: string): void {
    if (!this.registry.hasTower(tower)) return;
    const current = this.currentSelection;
    this.currentSelection =
      current.kind === "build" && current.tower === tower ? NONE : { kind: "build", tower };
  }

  /**
   * Targeted powers enter aiming mode (tap again to cancel); untargeted
   * powers fire straight away.
   */
  selectPower(power: string): void {
    if (!this.started || !this.registry.hasPower(power)) return;
    const current = this.currentSelection;
    if (current.kind === "power" && current.power === power) {
      this.currentSelection = NONE;
      return;
    }
    if (this.registry.power(power).spec.kind === "strike") {
      const ready = this.powerState(power);
      if (ready && ready.cooldown > 0) {
        this.events.emit("rejected", { error: "power-not-ready" });
        return;
      }
      if (this.sim.world.phase !== "wave") {
        this.events.emit("rejected", { error: "no-wave-active" });
        return;
      }
      this.currentSelection = { kind: "power", power };
      return;
    }
    this.dispatch({ type: "castPower", power, x: 0, y: 0 });
  }

  powerState(power: string): Readonly<PowerState> | undefined {
    return this.sim.world.powers.find((p) => p.id === power);
  }

  /** The player's hero on the board, if this level has one. */
  get hero(): Readonly<HeroState> | undefined {
    return this.sim.world.hero;
  }

  /**
   * Steers the hero. Called every time the stick or the keys change; a zero
   * vector stops. Silently ignored on levels without a hero, so input
   * bindings need no special case.
   */
  moveHero(dx: number, dy: number): void {
    const { hero } = this.sim.world;
    if (!hero || !this.started || this.paused) return;
    if (hero.moveX === dx && hero.moveY === dy) return;
    this.dispatch({ type: "moveHero", dx, dy });
  }

  /** Stops the hero, for when input focus is lost mid-press. */
  stopHero(): void {
    this.moveHero(0, 0);
  }

  dash(): void {
    if (this.hero && this.started && !this.paused) this.dispatch({ type: "heroDash" });
  }

  nova(): void {
    if (this.hero && this.started && !this.paused) this.dispatch({ type: "heroNova" });
  }

  cancel(): void {
    this.currentSelection = NONE;
  }

  setHover(cell: Cell | undefined): void {
    this.hoverCell = cell;
  }

  /** A tap or click on the board: build, aim a power, or inspect. */
  activateCell(cell: Cell): void {
    if (!this.started || this.paused || this.sim.isOver) return;
    const selection = this.currentSelection;
    switch (selection.kind) {
      case "build":
        if (this.guideCells && !this.guideCells.some((c) => c.x === cell.x && c.y === cell.y)) {
          this.events.emit("offGuide", { cell });
          return;
        }
        this.dispatch({ type: "placeTower", tower: selection.tower, x: cell.x, y: cell.y });
        return;
      case "power": {
        const center = cellCenter(cell);
        if (this.dispatch({ type: "castPower", power: selection.power, ...center }).ok) {
          this.currentSelection = NONE;
        }
        return;
      }
      case "none":
      case "tower": {
        const occupant = this.sim.grid.occupantAt(cell.x, cell.y);
        this.currentSelection =
          occupant === undefined ? NONE : { kind: "tower", towerId: occupant };
      }
    }
  }

  /** Restricts building to these cells (the tutorial); undefined lifts the restriction. */
  setGuide(cells: readonly Cell[] | undefined): void {
    this.guideCells = cells;
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

  /** Starts the next wave, or calls it early while one is running. */
  startWave(): void {
    if (this.started && !this.paused) this.dispatch({ type: "startWave" });
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  setPaused(paused: boolean): void {
    if (this.started && !this.sim.isOver) this.paused = paused;
  }

  cycleSpeed(): void {
    const index = SPEEDS.indexOf(this.speed);
    this.speed = SPEEDS[(index + 1) % SPEEDS.length] ?? 1;
  }

  private reset(): void {
    this.sim = this.createSimulation();
    this.currentSelection = NONE;
    this.finalOutcome = undefined;
    this.paused = false;
    this.events.emit("loaded", { simulation: this.sim });
  }

  private dispatch(command: Command): CommandResult {
    const result = this.sim.apply(command);
    if (!result.ok) this.events.emit("rejected", { error: result.error });
    return result;
  }

  private createSimulation(): Simulation {
    const sim = new Simulation(this.registry, { seed: this.nextSeed() });
    sim.events.on("gameOver", ({ won }) => {
      const outcome: SessionOutcome = {
        won,
        wave: sim.world.wavesStarted,
        lives: sim.world.lives,
      };
      this.finalOutcome = outcome;
      this.currentSelection = NONE;
      this.events.emit("finished", outcome);
    });
    return sim;
  }
}
