import type { TowerDef } from "../core/content-types";

export const TOWERS: readonly TowerDef[] = [
  {
    id: "bolt",
    name: "Bolt",
    summary: "Cheap and quick. The backbone of every maze.",
    hotkey: "1",
    defaultTargeting: "first",
    levels: [
      {
        cost: 40,
        range: 2.6,
        cooldown: 0.55,
        attack: { kind: "projectile", damage: 9, speed: 12, splashRadius: 0 },
      },
      {
        cost: 45,
        range: 2.8,
        cooldown: 0.5,
        attack: { kind: "projectile", damage: 16, speed: 13, splashRadius: 0 },
      },
      {
        cost: 80,
        range: 3.1,
        cooldown: 0.45,
        attack: { kind: "projectile", damage: 28, speed: 14, splashRadius: 0 },
      },
    ],
  },
  {
    id: "cannon",
    name: "Cannon",
    summary: "Slow shells that damage everything they land on. Cannot hit flyers.",
    hotkey: "2",
    defaultTargeting: "first",
    groundOnly: true,
    levels: [
      {
        cost: 90,
        range: 2.3,
        cooldown: 1.3,
        attack: { kind: "projectile", damage: 20, speed: 7, splashRadius: 0.95 },
      },
      {
        cost: 90,
        range: 2.4,
        cooldown: 1.25,
        attack: { kind: "projectile", damage: 36, speed: 7.5, splashRadius: 1.05 },
      },
      {
        cost: 150,
        range: 2.6,
        cooldown: 1.2,
        attack: { kind: "projectile", damage: 62, speed: 8, splashRadius: 1.2 },
      },
    ],
  },
  {
    id: "frost",
    name: "Frost",
    summary: "Pulses cold around itself, slowing everything nearby.",
    hotkey: "3",
    defaultTargeting: "closest",
    levels: [
      {
        cost: 70,
        range: 1.8,
        cooldown: 1,
        attack: { kind: "pulse", damage: 4, slow: { factor: 0.55, duration: 1.2 } },
      },
      {
        cost: 70,
        range: 2,
        cooldown: 1,
        attack: { kind: "pulse", damage: 7, slow: { factor: 0.45, duration: 1.4 } },
      },
      {
        cost: 120,
        range: 2.3,
        cooldown: 0.9,
        attack: { kind: "pulse", damage: 12, slow: { factor: 0.35, duration: 1.6 } },
      },
    ],
  },
  {
    id: "spire",
    name: "Spire",
    summary: "Long-range beam that punches through armor.",
    hotkey: "4",
    defaultTargeting: "strongest",
    levels: [
      { cost: 140, range: 4.2, cooldown: 1.6, attack: { kind: "beam", damage: 55 } },
      { cost: 130, range: 4.5, cooldown: 1.5, attack: { kind: "beam", damage: 100 } },
      { cost: 220, range: 4.8, cooldown: 1.4, attack: { kind: "beam", damage: 180 } },
    ],
  },
  {
    id: "arc",
    name: "Arc",
    summary: "Lightning that jumps between packed enemies.",
    hotkey: "5",
    defaultTargeting: "first",
    levels: [
      {
        cost: 110,
        range: 2.6,
        cooldown: 1.1,
        attack: { kind: "chain", damage: 18, jumps: 3, jumpRange: 1.6, falloff: 0.8 },
      },
      {
        cost: 95,
        range: 2.8,
        cooldown: 1,
        attack: { kind: "chain", damage: 30, jumps: 4, jumpRange: 1.7, falloff: 0.8 },
      },
      {
        cost: 170,
        range: 3,
        cooldown: 0.9,
        attack: { kind: "chain", damage: 50, jumps: 5, jumpRange: 1.8, falloff: 0.85 },
      },
    ],
  },
  {
    id: "mortar",
    name: "Mortar",
    summary: "Lobs heavy shells across the whole field. Cannot hit flyers.",
    hotkey: "6",
    defaultTargeting: "strongest",
    groundOnly: true,
    levels: [
      {
        cost: 160,
        range: 5.5,
        cooldown: 3.2,
        attack: { kind: "projectile", damage: 60, speed: 5, splashRadius: 1.4 },
      },
      {
        cost: 140,
        range: 5.8,
        cooldown: 3,
        attack: { kind: "projectile", damage: 105, speed: 5.5, splashRadius: 1.5 },
      },
      {
        cost: 230,
        range: 6.2,
        cooldown: 2.8,
        attack: { kind: "projectile", damage: 180, speed: 6, splashRadius: 1.7 },
      },
    ],
  },
];
