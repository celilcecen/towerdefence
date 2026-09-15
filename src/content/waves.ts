import type { SpawnGroup, WaveDef } from "../core/content-types";

const group = (enemy: string, count: number, interval: number, delay = 0): SpawnGroup => ({
  enemy,
  count,
  interval,
  delay,
});

const wave = (hpMultiplier: number, ...groups: SpawnGroup[]): Omit<WaveDef, "clearBonus"> => ({
  hpMultiplier,
  groups,
});

/**
 * Early waves teach, the middle introduces armor and the boss, the late game
 * ramps hit points steeply. Clear bonuses grow so falling behind is recoverable.
 * Tuned with the balance bots; run `npm run balance` after changing.
 */
export const WAVES: readonly WaveDef[] = [
  wave(1, group("grunt", 8, 0.9)),
  wave(1, group("grunt", 10, 0.8), group("runner", 6, 0.6, 6)),
  wave(1.07, group("runner", 16, 0.45)),
  wave(1.14, group("grunt", 14, 0.7), group("brute", 2, 3, 8)),
  wave(1.21, group("brute", 5, 2), group("grunt", 10, 0.6, 2)),
  wave(1.35, group("runner", 24, 0.35)),
  wave(1.49, group("grunt", 18, 0.55), group("brute", 4, 2.2, 5)),
  wave(1.63, group("brute", 8, 1.6), group("runner", 16, 0.4, 4)),
  wave(1.84, group("runner", 30, 0.3), group("grunt", 16, 0.5, 6)),
  wave(1.98, group("warden", 1, 0), group("grunt", 20, 0.5, 4)),
  wave(2.19, group("brute", 12, 1.3), group("runner", 24, 0.35, 3)),
  wave(2.47, group("grunt", 30, 0.45), group("brute", 10, 1.4, 5)),
  wave(2.82, group("runner", 40, 0.25), group("brute", 12, 1.2, 4)),
  wave(3.17, group("brute", 20, 1.1), group("grunt", 30, 0.4, 2)),
  wave(3.52, group("warden", 2, 6), group("brute", 12, 1.2, 3), group("runner", 30, 0.3, 8)),
].map((w, i) => ({ ...w, clearBonus: 15 + (i + 1) * 5 }));
