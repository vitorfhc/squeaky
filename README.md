# Squeaky

A local side-view bomb platformer with deterministic gameplay rules. Climb solid platforms, survive enemy blasts, and stay between the shrinking storm walls. The last survivor wins.

## Setup

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev             # Vite client at http://localhost:5173
npm run dev:server      # future Colyseus scaffold at ws://localhost:2567
npm run check           # lint, formatting, types, tests, production builds
```

`npm run build` builds the shared rules before their client and server consumers. The client is the only runnable game today; starting the server does **not** network the match.

## Mock authentication

Enter any valid-looking email. The six-digit one-time development code is generated in the browser and deliberately displayed on the next screen rather than emailed. Authentication and the profile are stored only in `localStorage`. The profile tracks display name, score, coins, wins, and matches played. This is a development convenience, not secure authentication; clearing site data resets it.

## Controls and game loop

| Action         | Control                                              |
| -------------- | ---------------------------------------------------- |
| Run left/right | A / D or Left / Right arrows                         |
| Jump           | Space, W, or Up arrow (release before jumping again) |
| Shrink         | Hold Ctrl; half size and speed, no jumping           |
| Aim            | Pointer; dotted arc previews the throw               |
| Throw          | Hold left mouse to charge; release to throw          |
| Detonate       | Right mouse; newest active owned bomb only           |

Each match begins with a **three-second countdown**. Everyone is frozen and invulnerable, and shooting consumes no charges. Movement unlocks when the countdown ends. Bombs unlock **three seconds later**, at six seconds from match creation. The HUD displays both timers, and the storm clock starts when movement unlocks.

Players have **100 health**. Each enemy bomb deals **40 damage**, so a healthy player survives two blasts. A player's own bombs never damage or attach to that player. Health bars appear above every living player, and the HUD shows your exact health.

Each player has a distinct, stable color. You are **blue**; the first bot is **orange**. Bombs keep their owner's color in flight, after attachment, and during their blast. Blue bombs are yours and harmless to you; other colors deal enemy damage. The color is a visual ownership cue; damage immunity is always checked against the actual owner ID.

Each player has **three bomb charges**. A consumed slot independently becomes ready **2 seconds after its throw**. Throws have a **0.5-second minimum interval**: use the first three at 0, 0.5, and 1 second, then their slots reload at 2, 2.5, and 3 seconds. A corner panel shows bomb icons, the available count, each slot's reload countdown and progress bar, the throw status, and the detonation cooldown. Larger text, solid dark panels, and bright text improve contrast throughout the game and menus.

Bombs fly like light rockets: 600px/s base launch speed, a small upward bias, 500px/s² gravity, and low air drag keep their flight mostly horizontal. They inherit the thrower's horizontal running speed. Holding left mouse increases launch force from **1× to 1.6× over one second**, then holds that maximum; release throws one bomb. The dotted trajectory updates with charge and running momentum, using the same launch and collision rules as the actual bomb. Space jumps and never fires a bomb.

Bombs have a **90px blast radius** and a **three-second fuse**. They blink at an increasing rate as their fuse runs down (from 1.5 to 10 flashes per second), with a colored outline visible between flashes so ownership remains clear. Bombs stick on their first impact with a platform, arena boundary, or opponent. Attached bombs follow their target. Right-click detonates only the newest active bomb you own, without triggering nearby bombs, and starts a **five-second detonation cooldown**. Clicking without an active owned bomb uses no cooldown. Natural fuse explosions retain chain reactions and continue during the cooldown. Every exploding bomb uses its own owner for damage immunity.

Players run at 270px/s, fall with 1800px/s² gravity, and jump at 800px/s. Solid platforms are spaced 150px vertically and can be climbed by jumping beside their edges. Platform sides and undersides also block movement. Eleven local bots use the same physics, health, charges, and throw rules.

Hold **Ctrl** to shrink to **half size**, including the solid collision bounds and bomb hitbox. Running slows to **135px/s**, and jumping is disabled while small. The character smoothly shrinks and grows over 180ms, keeping their feet on the same surface. Releasing Ctrl restores normal size when there is room; under a low ceiling or beside a blocking wall, the player stays small until they can safely grow. A jump held while small must be released before jumping at normal size. Bomb throwing remains available, with the trajectory starting at the scaled character's throw position and inheriting the reduced running speed. The HUD shows the current size mode.

The arena is **7,800 × 1,000px**, three times the previous playable area: three connected horizontal sectors, thirty elevated platforms, and one continuous ground surface. Platform heights and jump distances stay reachable. Spawn slots are evenly spaced across the full map width for the actual player count, with the outer slots 66–110px from the bottom corners. Each match randomizes player assignments and chooses safe platform heights, so the blue player can start anywhere. Spawn randomness is seeded by the match ID for reproducible simulations. Storm boundaries scale to cover the larger map before converging on the final corridor.

The safe zone holds and contracts in phases as two vertical storm walls. Height does not affect zone safety. Crossing a wall remains lethal, regardless of health; the next boundary and phase countdown are visible. After the final 80px half-width, the storm holds for six seconds and closes completely over six seconds so survivors on separate heights cannot stall a match indefinitely. After elimination the camera follows a survivor. The last survivor wins, updates the local profile, and can replay or return to the menu.

Gameplay tuning lives in `packages/shared/src/config.ts`; the arena and spawns live in `packages/shared/src/simulation.ts`.

## Architecture

```text
packages/shared/       serializable state, gameplay tuning, platform physics and match rules
apps/client/src/game/  Phaser rendering/input adapter + session implementations
apps/server/           non-production Colyseus room/schema boundary
```

`@squeaky/shared` imports no Phaser, browser, DOM, or Node APIs. Its state is plain serializable data. `createMatch` initializes platform spawns and resources; `stepMatch` applies player and bot inputs, physics, bomb fuses, damage, zone progression, and results. `LocalGameSession` orchestrates a 60Hz simulation. Phaser reads snapshots and supplies inputs; its objects are never authoritative. `GameSession` remains the transport boundary. `NetworkGameSession` intentionally throws today rather than implying that multiplayer exists.

The server scaffold imports the same shared contracts and declares a future room and schema. It does not yet process gameplay or connect to the client.

## Verification

`npm run check` runs shared unit and match integration tests for health, owner immunity (including chain reactions), three separate reload deadlines, the throw interval, gravity/jumping, solid platform collision, rocket flight/running momentum/attachments, charged force and trajectory agreement, latest-only manual detonation, accelerating blink timing, player/bomb colors, three-sector arena coverage, even spawn spacing and randomized corner assignments, start invulnerability and weapon unlock, deterministic bot matches, zone timing, and winner selection. Client adapter tests cover short input presses and charged force between simulation steps, one detonation per click, consistent behavior at different render frame rates, and clean restarts. Lint, formatting, types, and production builds are checked too.

## Multiplayer migration (up to 20 players)

1. Run the shared fixed-step simulation in the Colyseus `ArenaRoom` instead of `LocalGameSession`.
2. Make the room authoritative for spawn allocation, input validation, movement/platform collision, health, charge reload deadlines, throw intervals, bomb physics/attachments/fuses, chain reactions, storm walls, winner selection, and profile rewards.
3. Expand schemas for player velocities, grounded/input state, health and charge deadlines, bombs, platforms, zone phase clock, and match status. Broadcast server snapshots at a controlled rate; do not send Phaser objects.
4. Implement `NetworkGameSession` to send sequenced `PlayerInput` messages (including jump and held shrink) and translate schema patches into the same `MatchState` shape consumed by the scene.
5. Add client prediction/interpolation for responsive movement, followed by reconciliation against server snapshots. Bomb outcomes and match results must never be predicted as authoritative.
6. Add real identity/session validation, reconnect windows, rate limiting, input sanity checks, room lifecycle/matchmaking, persistence, observability, and load tests with the configured maximum of 20 clients.
7. Run deterministic server integration tests and adversarial clients before enabling the multiplayer entry point.

## Current limitations

- All opponents and gameplay run in one browser tab; there is no multiplayer transport.
- Mock auth provides no identity security and profile values are client-editable.
- Bots use simple platform heuristics rather than full route planning. Bomb impact sweeps are discretely sampled; player collision uses axis-aligned bounds matching the player's radius.
- Timers use simulation time. The local adapter caps catch-up at 100ms per render frame, so a backgrounded tab or a long rendering stall slows the match clock rather than advancing by the full wall-clock delay.
- No audio, assets, mobile controls, accessibility pass, persistence service, reconnect support, matchmaking, lag compensation, or anti-cheat exists yet.
- The Colyseus room is a compile-checked boundary only. The shared simulation and expanded snapshots must become server-authoritative before public multiplayer is enabled.
