import type { GameContent, MapDef, RulesDef } from "../core/content-types";
import { ENEMIES } from "./enemies";
import { TOWERS } from "./towers";
import { WAVES } from "./waves";

export const MAP: MapDef = {
  id: "crossing",
  name: "The Crossing",
  rows: [
    "..................",
    "......#...........",
    "......#.....#.....",
    "............#.....",
    "S................E",
    "S.......##.......E",
    "S................E",
    ".....#............",
    ".....#......#.....",
    "............#.....",
    "..................",
  ],
};

export const RULES: RulesDef = {
  startingGold: 200,
  startingLives: 20,
  sellRefundRatio: 0.7,
  minDamageRatio: 0.2,
};

export const GAME_CONTENT: GameContent = {
  towers: TOWERS,
  enemies: ENEMIES,
  waves: WAVES,
  map: MAP,
  rules: RULES,
};
