import type { GameContent, RulesDef } from "../core/content-types";
import { ENEMIES } from "./enemies";
import { SENTINEL } from "./heroes";
import { CROSSING } from "./maps";
import { TOWERS } from "./towers";
import { WAVES } from "./waves";

export { CAMPAIGN } from "./campaign";

/** The Crossing's enemies predate the campaign roster; Classic keeps its original balance. */
const CLASSIC_ENEMIES = ["runner", "grunt", "brute", "warden"];
const CLASSIC_TOWERS = ["bolt", "cannon", "frost", "spire"];

export const RULES: RulesDef = {
  startingGold: 200,
  startingLives: 20,
  sellRefundRatio: 0.7,
  minDamageRatio: 0.2,
  earlyCallRatio: 0.5,
};

/** Classic mode: the original 15-wave game on The Crossing, now with the Sentinel on the field. */
export const GAME_CONTENT: GameContent = {
  towers: TOWERS.filter((t) => CLASSIC_TOWERS.includes(t.id)),
  enemies: ENEMIES.filter((e) => CLASSIC_ENEMIES.includes(e.id)),
  waves: WAVES,
  powers: [],
  hero: SENTINEL,
  map: CROSSING,
  rules: RULES,
};
