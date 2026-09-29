# Squeaky

A deliberately local, top-down bomb arena prototype. The repository proves presentation, transport-neutral contracts, and deterministic rules before networking is allowed to add trust and latency concerns.

## Setup

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev             # Vite client at http://localhost:5173
npm run dev:server      # future Colyseus scaffold at ws://localhost:2567
npm run check           # lint, formatting, types, tests, production builds
```

`npm run build` produces each workspace's production output. The client is the only runnable game today; starting the server does **not** network the match.

## Mock authentication

Enter any valid-looking email. The six-digit one-time development code is generated in the browser and deliberately displayed on the next screen rather than emailed. Authentication and the profile are stored only in `localStorage`. The profile tracks display name, score, coins, wins, and matches played. This is a development convenience, not secure authentication; clearing site data resets it.

## Controls and game loop

| Action | Control            |
| ------ | ------------------ |
| Move   | WASD or arrow keys |
| Aim    | Pointer            |
| Throw  | Click or Space     |

Bombs have a visible cooldown, fly until their first impact, stick to walls or participants, and explode after a three-second fuse. Attached bombs follow a moving target. Blasts are lethal and can chain-react. Eleven simple local bots make encounters easy to test. The arena's circular safe zone holds and contracts in phases; leaving it is lethal. The HUD reports survivors, fuse/cooldown behavior, zone timing, and match state. The last survivor wins, updates the local profile, and can replay or return to the menu.

## Architecture

```text
packages/shared/       platform-neutral state, configuration, geometry and rules
apps/client/src/game/  Phaser rendering/input adapter + session implementations
apps/server/           non-production Colyseus room/schema boundary
```

`@squeaky/shared` imports no Phaser, browser, DOM, or Node APIs. Its state is plain serializable data. `LocalGameSession` owns the canonical simulation; Phaser reads snapshots and supplies normalized input but its objects are never authoritative. `GameSession` is the seam between presentation and simulation. `NetworkGameSession` intentionally throws today rather than implying that multiplayer exists.

The server scaffold imports the same shared contracts and declares a future room and schema. It does not yet process gameplay or connect to the client.

## Multiplayer migration (up to 20 players)

1. Move the fixed-step update currently orchestrated by `LocalGameSession` into the Colyseus `ArenaRoom`, reusing and expanding pure functions in `@squeaky/shared`.
2. Make the room authoritative for spawn allocation, movement bounds and collision validation, throw cooldowns, first-impact bomb attachment, fuse deadlines, chain reactions, safe-zone phases, damage, winner selection, and profile rewards.
3. Define schema fields for players, bombs, obstacles, zone, phase clock, and match status. Broadcast server snapshots at a controlled rate; do not send Phaser objects.
4. Implement `NetworkGameSession` to send sequenced `PlayerInput` messages and translate schema patches into the same `MatchState` shape consumed by the scene.
5. Add client prediction/interpolation for responsive movement, followed by reconciliation against server snapshots. Bomb outcomes and match results must never be predicted as authoritative.
6. Add real identity/session validation, reconnect windows, rate limiting, input sanity checks, room lifecycle/matchmaking, persistence, observability, and load tests with the configured maximum of 20 clients.
7. Run deterministic server integration tests and adversarial clients before enabling the multiplayer entry point.

## Current limitations

- All opponents and gameplay run in one browser tab; there is no multiplayer transport.
- Mock auth provides no identity security and profile values are client-editable.
- Bot behavior is intentionally simple, and the first-impact sweep is discretely sampled rather than a production continuous-collision solver.
- No audio, assets, mobile controls, accessibility pass, persistence service, reconnect support, matchmaking, lag compensation, or anti-cheat exists yet.
- The Colyseus room is a compile-checked boundary only. Movement validation, bomb collision/fuses, zone progression, damage, and results must become server-authoritative before public multiplayer is enabled.
