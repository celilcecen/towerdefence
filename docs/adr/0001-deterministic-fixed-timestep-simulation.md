# ADR 0001: Deterministic, fixed-timestep simulation core

- Status: accepted
- Date: 2026-09-15

## Context

Game logic that runs inside `requestAnimationFrame` with a variable delta time behaves
differently on a 60 Hz laptop and a 144 Hz phone, is hard to test, and cannot be
replayed. We want gameplay that is testable without a browser, reproducible from a
bug report, and ready for future features such as replays or lockstep multiplayer.

## Decision

- The rules live in `src/core`, a pure TypeScript module compiled **without the DOM
  library** (`tsconfig.core.json`) and linted against `Math.random`, `Date.now` and
  imports from adapter layers.
- The simulation advances only in fixed ticks of 1/30 s. The browser loop
  (`src/app/game-loop.ts`) accumulates real time, runs whole ticks and passes an
  interpolation factor to the renderer.
- All randomness comes from a seeded generator owned by the simulation.
- Player intent is expressed as serialisable commands applied between ticks.
- `hashWorld` fingerprints all state that affects the future.

## Consequences

- A seed plus a `(tick, command)` log reproduces a game exactly; tests assert
  tick-for-tick hash equality.
- Headless bots can play thousands of ticks per millisecond, which makes automated
  balance tests practical (see ADR 0003).
- Fire rates are quantised to ticks (at most about 33 ms of error). This is invisible
  at this game's pace and is the accepted price of determinism.
- Rendering must interpolate between `prev*` and current positions to stay smooth.
