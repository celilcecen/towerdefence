# ADR 0003: Content as validated data, guarded by balance bots

- Status: accepted
- Date: 2026-09-15

## Context

Towers, enemies, waves and maps change far more often than the engine. Tuning numbers
by hand-playing is slow, subjective and easy to regress.

## Decision

- Content is plain typed data in `src/content`. Behaviour is selected through
  registries: attack kinds (`ATTACKS`) and targeting strategies (`TARGETING`). Adding
  a tower does not touch the systems (open/closed principle); adding a new _kind_ of
  attack adds one registry entry, and the compiler enforces completeness.
- `validateContent` checks every invariant once at startup and reports all problems
  together. The simulation trusts validated content.
- `tests/balance.test.ts` plays the real campaign headlessly with three strategies
  across several seeds:
  - `idle` never builds, so it must lose immediately;
  - `wall` lines towers along the straight route, so it must not win;
  - `maze` builds a serpentine maze with the same towers, so it must win on most seeds
    while still losing lives.
- `npm run balance` prints the outcome table.

## Consequences

- A content change that makes the game unwinnable, trivial, or makes mazing pointless
  fails CI.
- The bots are deliberately simple reference players, not optimal ones. The guardrails
  bound the difficulty curve; they do not replace playtesting for feel.
