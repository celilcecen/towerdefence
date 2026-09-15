# ADR 0002: Flow-field pathfinding instead of per-enemy A*

- Status: accepted
- Date: 2026-09-15

## Context

In a maze-building tower defense every tower changes the route. Dozens of enemies
share the same goal (the exits), and a placement must be rejected if it would seal
the maze or trap an enemy that is already on the board.

Per-enemy A* costs one search per enemy per maze change and still needs a separate
reachability check for validation.

## Decision

Compute a single distance-to-exit field with a multi-source breadth-first search from
every exit (`src/core/flow-field.ts`). Enemies read their next step from the field.
Neighbours are visited in a fixed order, so ties, and therefore routes, are
deterministic.

A placement is validated by computing the field with the candidate cell blocked. If
every spawn and every living enemy's next waypoint is still reachable, the placement
is accepted and the precomputed field is kept.

## Consequences

- Cost is O(cells) per maze change and independent of enemy count (198 cells on the
  current map).
- The same computation answers routing, placement validation and the on-screen path
  preview.
- Movement is four-directional. Diagonal or smoothed movement would be a
  presentation concern, or a later change to the neighbour set.
