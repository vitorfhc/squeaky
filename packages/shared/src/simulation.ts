import { GAME_CONFIG, PLAYER_COLORS } from './config.js';
import { moveBomb, movePlayer } from './physics.js';
import {
  applyBombDamage,
  bombShouldExplode,
  distanceSquared,
  isInBlastRange,
  isOutsideZone,
  normalize,
  selectWinner,
  tryThrowBomb,
  zoneAtTime,
} from './rules.js';
import type {
  BombState,
  MatchState,
  ObstacleState,
  PlayerInput,
  PlayerState,
  Vector2,
} from './types.js';

const sectorWidth = 2600;
const sectorPlatforms: readonly ObstacleState[] = [
  { id: 'left-low', x: 200, y: 790, width: 320, height: 26 },
  { id: 'middle-low', x: 850, y: 790, width: 320, height: 26 },
  { id: 'right-low', x: 1530, y: 790, width: 320, height: 26 },
  { id: 'far-right-low', x: 2190, y: 790, width: 260, height: 26 },
  { id: 'left-middle', x: 480, y: 640, width: 320, height: 26 },
  { id: 'center-middle', x: 1180, y: 640, width: 320, height: 26 },
  { id: 'right-middle', x: 1860, y: 640, width: 320, height: 26 },
  { id: 'left-high', x: 820, y: 490, width: 350, height: 26 },
  { id: 'right-high', x: 1540, y: 490, width: 350, height: 26 },
  { id: 'summit', x: 1180, y: 340, width: 320, height: 26 },
];

export const ARENA_PLATFORMS: readonly ObstacleState[] = [
  { id: 'ground', x: 0, y: 940, width: GAME_CONFIG.arena.width, height: 60 },
  ...Array.from({ length: GAME_CONFIG.arena.width / sectorWidth }, (_, sector) =>
    sectorPlatforms.map((platform) => ({
      ...platform,
      id: `sector-${sector}-${platform.id}`,
      x: platform.x + sector * sectorWidth,
    })),
  ).flat(),
];

// Match IDs seed spawn randomness so a recorded initial match is reproducible.
const matchRandom = (id: string): (() => number) => {
  let seed = 2166136261;
  for (const character of id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  seed ||= 0x9e3779b9;
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 2 ** 32;
  };
};

const createSpawnPositions = (count: number, id: string): Vector2[] => {
  const random = matchRandom(id);
  const radius = GAME_CONFIG.playerRadius;
  const inset = radius * (3 + random() * 2);
  const positions = Array.from({ length: count }, (_, slot) => {
    const x =
      count === 1
        ? GAME_CONFIG.arena.width / 2
        : inset + (slot * (GAME_CONFIG.arena.width - inset * 2)) / (count - 1);
    // Pick a surface that supports the entire player, including near both map corners.
    const surfaces = ARENA_PLATFORMS.filter(
      (platform) => x - radius >= platform.x && x + radius <= platform.x + platform.width,
    );
    const surface = surfaces[Math.floor(random() * surfaces.length)]!;
    return { x, y: surface.y - radius };
  });
  // Everyone, including the local player, has a chance to occupy any spaced slot.
  for (let i = positions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [positions[i], positions[j]] = [positions[j]!, positions[i]!];
  }
  return positions;
};

export const createMatch = (displayName: string, botCount = 11, id = 'local'): MatchState => {
  const players: Record<string, PlayerState> = {};
  const count = Math.max(0, Math.min(GAME_CONFIG.maxPlayers - 1, Math.floor(botCount)));
  const spawns = createSpawnPositions(count + 1, id);
  for (let i = 0; i <= count; i += 1) {
    const playerId = i === 0 ? 'local' : `bot-${i}`;
    players[playerId] = {
      id: playerId,
      displayName: i === 0 ? displayName : `Bot ${i}`,
      color: PLAYER_COLORS[i]!,
      position: spawns[i]!,
      radius: GAME_CONFIG.playerRadius,
      velocity: { x: 0, y: 0 },
      aim: { x: 1, y: 0 },
      alive: true,
      health: GAME_CONFIG.playerHealth,
      grounded: true,
      shrunk: false,
      jumpHeld: false,
      isBot: i !== 0,
      score: 0,
      lastThrowAt: -GAME_CONFIG.bombCooldownMs,
      detonationReadyAt: 0,
      bombCharges: Array<number>(GAME_CONFIG.bombCharges).fill(0),
    };
  }
  return {
    id,
    now: 0,
    status: 'waiting',
    players,
    bombs: {},
    obstacles: ARENA_PLATFORMS.map((platform) => ({ ...platform })),
    zone: {
      center: { x: GAME_CONFIG.arena.width / 2, y: GAME_CONFIG.arena.height / 2 },
      radius: GAME_CONFIG.arena.width / 2,
      nextRadius: GAME_CONFIG.zonePhases[0]!.radius,
      phaseIndex: 0,
      phaseStartedAt: GAME_CONFIG.matchCountdownMs,
      phaseStartRadius: GAME_CONFIG.arena.width / 2,
      shrinking: false,
    },
  };
};

const botInput = (bot: PlayerState, state: MatchState): PlayerInput => {
  const target = Object.values(state.players)
    .filter((player) => player.alive && player.id !== bot.id)
    .sort(
      (a, b) =>
        distanceSquared(a.position, bot.position) - distanceSquared(b.position, bot.position),
    )[0];
  const dx = (target?.position.x ?? state.zone.center.x) - bot.position.x;
  const dy = (target?.position.y ?? bot.position.y) - bot.position.y;
  const retreat = Math.abs(bot.position.x - state.zone.center.x) + 100 > state.zone.radius;
  let moveX = retreat
    ? Math.sign(state.zone.center.x - bot.position.x)
    : Math.abs(dx) > 95
      ? Math.sign(dx)
      : Math.sin(state.now / 600 + Number(bot.id.slice(4)));
  // Leave the underside of a higher platform before jumping up beside it.
  const overhead = state.obstacles.find(
    (platform) =>
      dy < -60 &&
      platform.y < bot.position.y - bot.radius &&
      platform.y > bot.position.y - 180 &&
      bot.position.x > platform.x - bot.radius &&
      bot.position.x < platform.x + platform.width + bot.radius,
  );
  if (overhead && !retreat) moveX = bot.position.x < overhead.x + overhead.width / 2 ? -1 : 1;
  const stepAhead = state.obstacles.some(
    (platform) =>
      bot.position.x + moveX * 65 > platform.x - bot.radius &&
      bot.position.x + moveX * 65 < platform.x + platform.width + bot.radius &&
      platform.y < bot.position.y + bot.radius &&
      platform.y > bot.position.y - 180,
  );
  return {
    sequence: Math.floor(state.now),
    movement: { x: moveX, y: 0 },
    jump: bot.grounded && !overhead && (dy < -60 || stepAhead),
    shrink: false,
    aim: { x: dx, y: dy },
    throwBomb: Boolean(target && Math.abs(dx) < 230 && Math.abs(dy) < 130),
    throwForce: 1,
    detonateBomb: false,
  };
};

export const explodeBomb = (state: MatchState, bomb: BombState, chainReaction = true): void => {
  if (bomb.exploded) return;
  bomb.exploded = true;
  bomb.explodedAt = state.now;
  if (state.now >= GAME_CONFIG.matchCountdownMs)
    for (const player of Object.values(state.players)) applyBombDamage(bomb, player);
  if (chainReaction && GAME_CONFIG.chainReactions)
    for (const other of Object.values(state.bombs))
      if (!other.exploded && isInBlastRange(bomb, other)) explodeBomb(state, other);
};

/** One right-click detonates only the newest active bomb belonging to this player. */
export const detonateLatestBomb = (state: MatchState, ownerId: string): BombState | undefined => {
  const owner = state.players[ownerId];
  if (
    !owner?.alive ||
    state.now < GAME_CONFIG.matchCountdownMs + GAME_CONFIG.bombUnlockDelayMs ||
    state.now < owner.detonationReadyAt
  )
    return undefined;
  const latest = Object.values(state.bombs)
    .filter((bomb) => bomb.ownerId === ownerId && !bomb.exploded)
    .sort((a, b) => b.thrownAt - a.thrownAt)[0];
  if (latest) {
    explodeBomb(state, latest, false);
    owner.detonationReadyAt = state.now + GAME_CONFIG.bombDetonationCooldownMs;
  }
  return latest;
};

/** Authoritative fixed-step rules: adapters supply inputs and render serializable snapshots. */
export const stepMatch = (
  state: MatchState,
  ms: number,
  inputs: Record<string, PlayerInput>,
): void => {
  if (state.status === 'finished') return;
  state.now += ms;
  if (state.now < GAME_CONFIG.matchCountdownMs) return;
  state.status = 'running';
  state.zone = zoneAtTime(state.zone, state.now);
  const controls = Object.fromEntries(
    Object.values(state.players)
      .filter((player) => player.alive)
      .map((player) => [player.id, player.isBot ? botInput(player, state) : inputs[player.id]]),
  );
  for (const player of Object.values(state.players)) {
    if (!player.alive) continue;
    const input = controls[player.id];
    if (input && Math.hypot(input.aim.x, input.aim.y) > 0) player.aim = normalize(input.aim);
    movePlayer(
      player,
      input?.movement.x ?? 0,
      input?.jump ?? false,
      ms / 1000,
      state.obstacles,
      input?.shrink ?? false,
    );
    if (
      input?.throwBomb &&
      state.now >= GAME_CONFIG.matchCountdownMs + GAME_CONFIG.bombUnlockDelayMs
    ) {
      const bomb = tryThrowBomb(
        player,
        `bomb-${player.id}-${state.now}`,
        state.now,
        input.throwForce,
      );
      if (bomb) state.bombs[bomb.id] = bomb;
    }
  }
  // Move all bombs before resolving fuses so chain reactions use this tick's positions.
  for (const bomb of Object.values(state.bombs))
    moveBomb(bomb, ms / 1000, state.players, state.obstacles);
  for (const player of Object.values(state.players))
    if (controls[player.id]?.detonateBomb) detonateLatestBomb(state, player.id);
  for (const bomb of Object.values(state.bombs)) {
    if (bombShouldExplode(bomb, state.now)) explodeBomb(state, bomb);
    if (bomb.exploded && state.now - (bomb.explodedAt ?? state.now) > 350)
      delete state.bombs[bomb.id];
  }
  for (const player of Object.values(state.players)) {
    if (player.alive && GAME_CONFIG.zoneDamageIsLethal && isOutsideZone(player, state.zone)) {
      player.health = 0;
      player.alive = false;
    }
  }
  const result = selectWinner(state);
  if (result.survivors.length <= 1) {
    state.status = 'finished';
    if (result.winnerId) state.winnerId = result.winnerId;
  }
};
