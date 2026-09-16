import type { PowerDef } from "../core/content-types";

export const POWERS: readonly PowerDef[] = [
  {
    id: "meteor",
    name: "Meteor",
    summary: "Call down a meteor on any spot. Hits ground and air.",
    cooldown: 35,
    spec: { kind: "strike", damage: 160, radius: 1.5 },
  },
  {
    id: "frostbind",
    name: "Frostbind",
    summary: "Freeze the whole field for a few seconds.",
    cooldown: 55,
    spec: { kind: "freeze", slow: { factor: 0.35, duration: 5 } },
  },
];
