# Gridlock

[![CI](https://github.com/celilcecen/towerdefence/actions/workflows/ci.yml/badge.svg)](https://github.com/celilcecen/towerdefence/actions/workflows/ci.yml)
[![CodeQL](https://github.com/celilcecen/towerdefence/actions/workflows/codeql.yml/badge.svg)](https://github.com/celilcecen/towerdefence/actions/workflows/codeql.yml)

A maze-building tower defense game with a hero on the field, for the browser and for phones.

**▶ Play it: [play.yctechnologies.com.tr](https://play.yctechnologies.com.tr)**

![Gridlock gameplay: the Sentinel fighting a wave of grunts in the Cinder Fields while towers line the lane](docs/screenshot.png)

<table>
  <tr>
    <td width="68%"><img src="docs/start-screen.png" alt="Home screen: continue the campaign, the campaign map, classic mode, help and settings" /></td>
    <td width="32%"><img src="docs/mobile.png" alt="Phone layout: the board rotates and the Sentinel is steered from a virtual stick with Dash and Nova buttons" /></td>
  </tr>
  <tr>
    <td align="center">Home screen: a story campaign across four regions, plus the original Classic mode</td>
    <td align="center">On phones the board rotates; the Sentinel is steered from a virtual stick</td>
  </tr>
</table>

Your towers are the walls. Enemies always take the shortest open route to the exit, so every
tower you place reshapes the maze they have to walk. You can never seal the path completely;
the game checks every placement before accepting it. A 12-level story campaign crosses four
regions with six tower types, ten kinds of monster (flyers, healers, splitters, two bosses),
three upgrade levels, four targeting strategies and two powers to aim by hand; Classic mode
keeps the original 15 waves. And you are on the field too: the Sentinel runs the maze you
build, fires at anything in reach, dashes through gaps and unleashes a crystal Nova when
charged. Works with mouse, keyboard and touch (a virtual stick on phones), in English and
Turkish, and ships as native Android and iOS shells.

## At a glance

|                      |                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------- |
| Runtime dependencies | **0** on the web. TypeScript, Canvas 2D, Web Audio and the DOM only                     |
| Unit tests           | **277**, with **99% statement / 96% branch** coverage of all game logic                 |
| End-to-end tests     | **26**. Playwright on desktop and mobile Chromium, under the production CSP             |
| Art and sound assets | **0 files**. Every tower, enemy, hero, effect and sound is generated in code            |
| Balance guardrails   | Headless bots play all 12 levels and Classic on several seeds in CI                     |
| Platforms            | Web (static, offline-capable), Android and iOS through [Capacitor](capacitor.config.ts) |
| Languages            | English and Turkish, every string in [`src/i18n`](src/i18n)                             |
| Static analysis      | `strictTypeChecked` ESLint, strictest TypeScript flags, CodeQL `security-extended`      |
| Delivery             | GitHub Actions pinned to commit SHAs, atomic releases with instant rollback             |

## Architecture

The rules of the game are a **pure, deterministic simulation** with no knowledge of the
browser. Everything that touches the outside world (canvas, DOM, input, storage, time) is an
adapter around it.

```mermaid
flowchart LR
  subgraph Adapters
    UI["ui/<br/>DOM chrome"]
    Input["input/<br/>pointer + keyboard"]
    Render["render/<br/>Canvas 2D"]
    Audio["audio/<br/>Web Audio synth"]
    Platform["platform/<br/>storage + native bridge"]
  end
  App["app/<br/>session, coach, fixed-step loop"]
  Core["core/<br/>deterministic simulation"]
  Content["content/<br/>campaign, story, towers, enemies, heroes, powers"]

  UI --> App
  Input --> App
  Render --> Core
  Audio --> Core
  App --> Core
  Platform -. implements RecordStore port .-> Core
  Content --> Core
```

Arrows point from a module to what it depends on. Nothing depends on an adapter except the
composition root, [`src/app/main.ts`](src/app/main.ts). The dependency rule is **enforced, not
documented**: `src/core` and `src/content` compile against a tsconfig **without the DOM library**,
and ESLint rejects imports from adapter folders as well as `Math.random` or `Date.now` inside
the core.

### How a tick works

1. The browser loop ([`game-loop.ts`](src/app/game-loop.ts)) accumulates real time and runs
   whole ticks of exactly 1/30 s, independent of display refresh rate.
2. Player intent arrives as serialisable [commands](src/core/commands.ts) (`placeTower`,
   `upgradeTower`, `sellTower`, `setTargeting`, `startWave`, `castPower`, `moveHero`,
   `heroDash`, `heroNova`), validated at runtime. Even the hero's stick input is a command, so
   a replay log reproduces a whole game, hero and all.
3. [`Simulation.step()`](src/core/simulation.ts) runs its systems in a fixed order: spawn →
   move → abilities → hero → towers → projectiles → power cooldown → resolution.
4. The renderer draws a read-only `WorldView`, interpolating between ticks for smooth motion.
   Procedural [artwork](src/render/art) is painted once per cell size into a
   [`SpriteCache`](src/render/sprite-cache.ts), so a frame is mostly `drawImage` calls; the
   terrain is a single cached layer.
5. Systems publish typed events (`enemyKilled`, `waveCleared`, `heroNova`, …); visual
   effects, turret aim, sound cues, haptics and UI subscribe without the core knowing they
   exist. Presentation wording (tower roles, enemy traits, the next-wave preview) is
   [derived from content data](src/ui/describe.ts), so new content explains itself.
6. The [hero](src/core/systems/hero.ts) is ordinary simulation state driven by the same
   commands as everything else. What makes it _look_ alive (a rippling cloak, recoil, dash
   streaks, the Nova wash) lives entirely in [`src/render`](src/render/art/hero.ts) and reacts
   to events.

A seed plus the command log reproduces a game exactly, which the test suite verifies
tick for tick with a state hash.

### SOLID in practice

| Principle                 | Where it shows up                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Single responsibility** | Each [system](src/core/systems) does one thing. Only `ResolutionSystem` decides bounties, leaks, victory and defeat. The renderer only draws.                                                                                                                                                    |
| **Open/closed**           | A new tower, enemy or wave is data in [`src/content`](src/content). A new attack kind is one entry in the [`ATTACKS`](src/core/combat/attacks.ts) registry; a new targeting mode is one entry in [`TARGETING`](src/core/combat/targeting.ts). Mapped types make a missing entry a compile error. |
| **Liskov substitution**   | Any `System`, `AttackBehaviour`, `TargetingStrategy` or `RecordStore` is interchangeable. Tests inject probe systems and an in-memory store.                                                                                                                                                     |
| **Interface segregation** | Adapters receive narrow views: `WorldView` (read-only state), `LoopControl` (`speed`, `paused`), `KeyValueStorage` (`getItem`, `setItem`).                                                                                                                                                       |
| **Dependency inversion**  | `Simulation` depends on the `System` abstraction; `GameSession` depends on the `RecordStore` port; concrete classes are wired in the composition root.                                                                                                                                           |

### Design decisions

- [ADR 0001: Deterministic, fixed-timestep simulation core](docs/adr/0001-deterministic-fixed-timestep-simulation.md)
- [ADR 0002: Flow-field pathfinding instead of per-enemy A*](docs/adr/0002-flow-field-pathfinding.md)
- [ADR 0003: Content as validated data, guarded by balance bots](docs/adr/0003-content-as-data-and-balance-bots.md)
- [ADR 0004: The hero is a layer inside the deterministic core](docs/adr/0004-hero-as-a-layer-inside-the-core.md)
  (see also the [Sentinel design note](docs/designs/sentinel-hero-layer.md))

## Testing strategy

| Layer       | What it proves                                                                                                                                                                                                                                                                                                                                                                                                               | Where                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Unit        | Grid parsing, flow field, damage and armor, slows, every targeting strategy, every command and rejection reason, content and campaign validation, the hero (movement, wall sliding, eviction, fire, charge, dash, Nova, down and respawn), session rules, the onboarding coach, sound cues and limiter, translations, loop timing, storage failure modes, sprite caching, turret aim, effect timelines, derived descriptions | [`tests/`](tests)                                                                                        |
| Determinism | Same seed and commands give identical state every tick, hero included; replays equal live play                                                                                                                                                                                                                                                                                                                               | [`simulation.test.ts`](tests/simulation.test.ts), [`hero.test.ts`](tests/hero.test.ts)                   |
| Balance     | Doing nothing loses fast, towers without a maze never win, a planned maze wins every level while still losing lives; the bots never use the hero, so no level depends on it                                                                                                                                                                                                                                                  | [`balance.test.ts`](tests/balance.test.ts), [`campaign-balance.test.ts`](tests/campaign-balance.test.ts) |
| End-to-end  | Real build, real headers, desktop and mobile: tutorial, campaign briefing and locks, classic mode, language switch, build, fight, upgrade, sell, shortcuts, steering the Sentinel from stick and keyboard, canvases actually painted; fails on any console error or CSP violation                                                                                                                                            | [`e2e/`](e2e)                                                                                            |
| Deployment  | nginx sends exactly the headers the e2e suite ran under; HTML contains nothing the CSP would block                                                                                                                                                                                                                                                                                                                           | [`deploy.test.ts`](tests/deploy.test.ts)                                                                 |

```text
$ npm run balance

Balance report (8 seeds)
idle   wins 0/8   avg wave  2.0   avg lives left  0.0
wall   wins 0/8   avg wave  4.4   avg lives left  0.0
maze   wins 8/8   avg wave 15.0   avg lives left  9.8
Campaign balance (6 seeds, 8+ waves per level)
c1-crossing  idle 0/6 w3.0 ♥0.0    hug 6/6 w8.0 ♥20.0    maze 6/6 w8.0 ♥20.0
c2-gate      idle 0/6 w2.0 ♥0.0    hug 0/6 w9.8 ♥0.0     maze 6/6 w14.0 ♥14.0
c3-keep      idle 0/6 w2.0 ♥0.0    hug 2/6 w15.0 ♥6.3    maze 5/6 w15.0 ♥13.0
c4-heart     idle 0/6 w2.0 ♥0.0    hug 0/6 w8.2 ♥0.0     maze 6/6 w18.0 ♥13.0
maze lives by chapter: greenreach ♥20.0  frostmarch ♥18.0  ashlands ♥12.3  rift ♥11.5
```

The difficulty curve is visible in the last line: the maze bot keeps fewer lives in each
later chapter. The full table lists all 12 levels.

## Security

A static game still gets a real security posture: strict Content Security Policy with no
inline code, HTML string sinks banned by lint, untrusted local data parsed rather than
trusted, zero runtime dependencies, SHA-pinned CI actions, Dependabot and CodeQL. See
[SECURITY.md](SECURITY.md) for the full control list and how to report a vulnerability.

## Getting started

Requires Node.js 22 or newer.

```bash
npm ci
npm run dev        # http://localhost:5173
npm run verify     # format, lint, types, unit tests with coverage, build, e2e
```

| Script                  | Purpose                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `npm run test:coverage` | Unit, determinism, balance and deployment tests with coverage thresholds                     |
| `npm run e2e`           | Playwright against the production build and headers (`npx playwright install chromium` once) |
| `npm run balance`       | Prints the bot outcome table after changing content                                          |
| `npm run assets:readme` | Retakes the three README pictures from the running game                                      |
| `npm run assets:app`    | Renders the app icon and splash screens for both native shells                               |
| `npm run assets:store`  | Captures store screenshots and the feature graphic in every language                         |

## Mobile

The same build runs inside [Capacitor](capacitor.config.ts) shells for Android and iOS
(`android/`, `ios/`, app id `tr.com.yctechnologies.gridlock`). The web bundle is packaged
into the app, so it plays fully offline. The native layer only adds what the web cannot do
well: haptics on dashes, Novas and hits, a dark status bar and a splash that hides once the
game has painted. On phones the board rotates so the route runs top to bottom, the Sentinel
is steered from a fixed virtual stick, and Dash and Nova sit under the right thumb.

```bash
npm run build && npx cap sync   # copy the web build into both shells
npx cap open android            # Android Studio; iOS needs Xcode on a Mac
```

## Deployment

[`scripts/deploy.sh`](scripts/deploy.sh) builds, uploads a timestamped release, validates the
nginx config before reloading, swaps the `current` symlink atomically and keeps the last five
releases for rollback. The site sits behind Cloudflare.

## How it was built

This project was built with an AI-assisted workflow. I defined the architecture, the
constraints and the quality gates: the DOM-free core, the command model, the lint and type
rules, coverage thresholds and the balance guardrails. I then worked with Claude Code (Anthropic)
to implement and refactor within those limits. No change counted until it passed formatting,
lint, strict type checks, unit and determinism tests, the balance bots and the end-to-end suite.
Balance was tuned the same way: parameter sweeps run by headless bots, not guesswork.

## License

[MIT](LICENSE) © 2026 Celil Çeçen
