# ADR 0004: The hero is a layer inside the deterministic core

- Status: accepted
- Date: 2026-09-16

## Context

Tower defense reads as "place, then watch". To make Gridlock feel interactive the player
should have a body on the field: something that moves, shoots and can be hurt. The obvious
shortcuts (a separate real-time loop for the hero, or reading input straight from the
renderer) would break the two properties the engine is built on: a DOM-free core and
replayable, hash-checked games.

## Decision

- The hero (the Sentinel) is ordinary simulation state: `WorldState.hero`, updated by
  `HeroSystem` in the fixed system order (spawn → move → abilities → **hero** → towers →
  projectiles → power cooldown → resolution). It moves at the tick rate like everything else.
- Player intent reaches it only as commands: `moveHero` (a direction vector, normalised and
  validated), `heroDash` and `heroNova`. The virtual stick, the keyboard and a replay log all
  produce the same commands, so a seed plus the command log still reproduces a whole game,
  hero included, and `hashWorld` covers the hero's position, health, timers and charge.
- The hero fires ordinary projectiles with `towerId = HERO_ID (0)`, so the projectile,
  damage and resolution systems need no special case. Only the charge rule looks at the id:
  Nova charge comes from the hero's own hits, never from towers.
- Content, not code, defines the hero (`HeroDef`: health, speed, attack, dash, nova, contact
  damage, regen, respawn). Levels pick a hero by id; `validateCampaign` and `validateContent`
  check every number. Levels without a hero simply have `hero: undefined`.
- Towers are walls for the hero too. Placing a tower on the hero's cell evicts it to the
  nearest free cell, so the maze rules never bend for the hero.
- The balance bots ignore the hero. Every level must stay winnable by mazing alone; the hero
  adds margin and fun, never a requirement.
- Everything that makes the hero _look_ alive (cloak poses, recoil, dash streaks, the Nova
  wash, the respawn pillar) lives in `src/render` and reacts to events (`heroFired`,
  `heroDashed`, `heroNova`, …). The core does not know it is being drawn.

## Consequences

- The hero cost no new architecture: three commands, one system, a few events and a state
  slice, all covered by the same determinism tests as the rest.
- Input latency is bounded by the tick (1/30 s). Movement is smoothed by the renderer's
  interpolation, the same way enemies are.
- The renderer draws the hero a fifth larger than its collision circle so it reads at phone
  size; collisions are still resolved on the small circle, so the extra size is purely visual.
