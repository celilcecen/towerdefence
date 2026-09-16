import type { SpawnGroup, WaveDef } from "../core/content-types";

export const group = (enemy: string, count: number, interval: number, delay = 0): SpawnGroup => ({
  enemy,
  count,
  interval,
  delay,
});

/**
 * Builds a level's waves from their spawn groups. Hit points ramp
 * geometrically from `firstHp` to `lastHp`, and clear bonuses grow so
 * falling behind stays recoverable. Rounded so the data reads cleanly.
 */
export function rampWaves(
  firstHp: number,
  lastHp: number,
  bonusBase: number,
  bonusStep: number,
  groups: readonly (readonly SpawnGroup[])[],
): WaveDef[] {
  const steps = Math.max(1, groups.length - 1);
  return groups.map((wave, i) => ({
    groups: wave,
    hpMultiplier: Math.round(firstHp * (lastHp / firstHp) ** (i / steps) * 100) / 100,
    clearBonus: bonusBase + bonusStep * (i + 1),
  }));
}
