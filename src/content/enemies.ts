import type { EnemyDef } from "../core/content-types";

/** Tuned with the balance bots (tests/balance.test.ts); run `npm run balance` after changing. */
export const ENEMIES: readonly EnemyDef[] = [
  {
    id: "runner",
    name: "Runner",
    hp: 21,
    speed: 2.4,
    armor: 0,
    bounty: 6,
    leakDamage: 1,
    radius: 0.22,
  },
  {
    id: "grunt",
    name: "Grunt",
    hp: 45,
    speed: 1.4,
    armor: 1,
    bounty: 9,
    leakDamage: 1,
    radius: 0.28,
  },
  {
    id: "brute",
    name: "Brute",
    hp: 165,
    speed: 0.9,
    armor: 4,
    bounty: 23,
    leakDamage: 3,
    radius: 0.36,
  },
  {
    id: "warden",
    name: "Warden",
    hp: 900,
    speed: 0.7,
    armor: 6,
    bounty: 225,
    leakDamage: 20,
    radius: 0.45,
  },
];
