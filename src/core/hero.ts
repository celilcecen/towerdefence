import type { HeroDef } from "./content-types";
import type { Cell, Point } from "./geometry";
import { cellCenter, cellOf } from "./geometry";
import type { Grid } from "./grid";
import type { HeroState } from "./state";

/**
 * The hero's collision circle is a little smaller than its drawn body, so it
 * slips through one-cell corridors without catching on the corners.
 */
const BODY_SHARE = 0.8;

/** The cell the hero starts on and returns to: the crystal it guards. */
export function heroHome(grid: Grid): Point {
  const exit = grid.exits[0];
  return exit ? cellCenter(exit) : { x: 0.5, y: 0.5 };
}

export function createHero(def: HeroDef, at: Point): HeroState {
  return {
    def,
    x: at.x,
    y: at.y,
    prevX: at.x,
    prevY: at.y,
    hp: def.hp,
    facing: 0,
    moveX: 0,
    moveY: 0,
    attackCooldown: 0,
    dashCooldown: 0,
    dashTimer: 0,
    dashX: 1,
    dashY: 0,
    charge: 0,
    targetId: undefined,
    status: "alive",
    respawnTimer: 0,
  };
}

/** Whether a circle of the hero's size centred at (x, y) overlaps rock, a tower or the edge. */
export function heroBlocked(grid: Grid, def: HeroDef, x: number, y: number): boolean {
  const r = def.radius * BODY_SHARE;
  const probes: readonly (readonly [number, number])[] = [
    [0, 0],
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ];
  return probes.some(([ox, oy]) => !grid.isWalkable(Math.floor(x + ox), Math.floor(y + oy)));
}

/**
 * Moves the hero by (dx, dy), sliding along walls: each axis is tried on its
 * own and reverted if it would push the hero into something solid.
 */
export function slideHero(grid: Grid, hero: HeroState, dx: number, dy: number): void {
  const { def } = hero;
  if (dx !== 0 && !heroBlocked(grid, def, hero.x + dx, hero.y)) hero.x += dx;
  if (dy !== 0 && !heroBlocked(grid, def, hero.x, hero.y + dy)) hero.y += dy;
}

/**
 * The nearest free cell to `cell`, searched ring by ring so the answer is
 * deterministic. Used when a tower is built on the hero's cell.
 */
export function nearestFreeCell(grid: Grid, def: HeroDef, cell: Cell): Cell | undefined {
  for (let ring = 1; ring <= Math.max(grid.width, grid.height); ring++) {
    let best: Cell | undefined;
    let bestDistance = Infinity;
    for (let oy = -ring; oy <= ring; oy++) {
      for (let ox = -ring; ox <= ring; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== ring) continue;
        const candidate = { x: cell.x + ox, y: cell.y + oy };
        const c = cellCenter(candidate);
        if (heroBlocked(grid, def, c.x, c.y)) continue;
        const d = ox * ox + oy * oy;
        if (d < bestDistance) {
          best = candidate;
          bestDistance = d;
        }
      }
    }
    if (best) return best;
  }
  return undefined;
}

/** Moves the hero off `cell` if it stands there, to the nearest free cell. */
export function evictHero(grid: Grid, hero: HeroState, cell: Cell): void {
  const at = cellOf(hero);
  if (at.x !== cell.x || at.y !== cell.y) return;
  const free = nearestFreeCell(grid, hero.def, cell);
  if (!free) return;
  const c = cellCenter(free);
  hero.x = c.x;
  hero.y = c.y;
  hero.prevX = c.x;
  hero.prevY = c.y;
}

/** Adds nova charge for damage the hero's shots dealt. */
export function chargeNova(hero: HeroState, damage: number): void {
  hero.charge = Math.min(1, hero.charge + damage / hero.def.nova.charge);
}
