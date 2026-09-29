import type { ZonePhase } from './types.js';

export const GAME_CONFIG = {
  arena: { width: 3200, height: 2200 },
  playerRadius: 25,
  movementSpeed: 280,
  bombRadius: 12,
  bombSpeed: 650,
  bombFuseMs: 3000,
  bombBlastRadius: 190,
  bombCooldownMs: 900,
  chainReactions: true,
  maxPlayers: 20,
  zoneDamageIsLethal: true,
  zonePhases: [
    { waitMs: 12_000, shrinkMs: 10_000, radius: 1250 },
    { waitMs: 8_000, shrinkMs: 9_000, radius: 900 },
    { waitMs: 6_000, shrinkMs: 8_000, radius: 600 },
    { waitMs: 4_000, shrinkMs: 7_000, radius: 320 },
    { waitMs: 2_000, shrinkMs: 6_000, radius: 80 },
  ] satisfies ZonePhase[],
} as const;
