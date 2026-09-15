import type { CommandError } from "../core/commands";

/** Player-facing wording lives outside the rules engine. */
export const COMMAND_ERROR_MESSAGES: Readonly<Record<CommandError, string>> = {
  "out-of-bounds": "That's off the board.",
  "not-buildable": "You can't build there.",
  "occupied-by-enemy": "An enemy is in the way.",
  "blocks-path": "That would seal the maze. Enemies always need a way through.",
  "game-over": "The game is over.",
  "unknown-tower-type": "That tower type doesn't exist.",
  "unknown-tower": "That tower is gone.",
  "insufficient-gold": "Not enough gold.",
  "max-level": "Already fully upgraded.",
  "invalid-targeting": "Unknown targeting mode.",
  "wave-in-progress": "A wave is already underway.",
};
