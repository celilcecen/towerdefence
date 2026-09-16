/**
 * In-level story: short lines that play as a wave starts. The words live in
 * the translation tables under `dialogue[levelId][line]`; this file only says
 * who speaks, and when. Wave numbers count from 1.
 */

export type Speaker = "ilka" | "scout" | "tyrant";

export interface StoryBeat {
  readonly wave: number;
  readonly speaker: Speaker;
  readonly line: string;
}

export const STORY_BEATS: Readonly<Record<string, readonly StoryBeat[]>> = {
  "c1-crossing": [
    { wave: 1, speaker: "scout", line: "first" },
    { wave: 5, speaker: "ilka", line: "brute" },
    { wave: 8, speaker: "scout", line: "last" },
  ],
  "c1-fords": [
    { wave: 1, speaker: "ilka", line: "fords" },
    { wave: 6, speaker: "scout", line: "meteor" },
    { wave: 10, speaker: "ilka", line: "last" },
  ],
  "c1-mill": [
    { wave: 1, speaker: "scout", line: "mill" },
    { wave: 12, speaker: "tyrant", line: "warden" },
  ],
  "c2-lake": [
    { wave: 3, speaker: "scout", line: "wisps" },
    { wave: 12, speaker: "tyrant", line: "cold" },
  ],
  "c2-pass": [
    { wave: 3, speaker: "ilka", line: "mender" },
    { wave: 8, speaker: "scout", line: "focus" },
  ],
  "c2-gate": [
    { wave: 4, speaker: "scout", line: "harriers" },
    { wave: 10, speaker: "tyrant", line: "gate" },
    { wave: 14, speaker: "ilka", line: "freeze" },
  ],
  "c3-cinder": [
    { wave: 2, speaker: "scout", line: "brood" },
    { wave: 9, speaker: "ilka", line: "forges" },
  ],
  "c3-molten": [
    { wave: 1, speaker: "scout", line: "heat" },
    { wave: 14, speaker: "tyrant", line: "burn" },
  ],
  "c3-keep": [
    { wave: 1, speaker: "ilka", line: "keep" },
    { wave: 7, speaker: "tyrant", line: "walls" },
    { wave: 15, speaker: "scout", line: "hold" },
  ],
  "c4-edge": [
    { wave: 1, speaker: "tyrant", line: "welcome" },
    { wave: 8, speaker: "ilka", line: "split" },
  ],
  "c4-spire": [
    { wave: 1, speaker: "scout", line: "center" },
    { wave: 16, speaker: "tyrant", line: "spire" },
  ],
  "c4-heart": [
    { wave: 1, speaker: "tyrant", line: "arrive" },
    { wave: 9, speaker: "ilka", line: "believe" },
    { wave: 18, speaker: "tyrant", line: "final" },
  ],
};
