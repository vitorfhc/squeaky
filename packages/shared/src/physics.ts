import { GAME_CONFIG } from './config.js';
import { attachedPosition, firstImpact } from './rules.js';
import type { BombState, ObstacleState, PlayerState } from './types.js';

const resizePlayer = (player: PlayerState, shrink: boolean, obstacles: ObstacleState[]): void => {
  if (player.shrunk === shrink) return;
  const radius = GAME_CONFIG.playerRadius * (shrink ? GAME_CONFIG.playerShrinkScale : 1);
  // Keep the feet anchored instead of lifting the player or embedding them in the floor.
  const position = {
    x: Math.max(radius, Math.min(GAME_CONFIG.arena.width - radius, player.position.x)),
    y: player.position.y + player.radius - radius,
  };
  if (
    !shrink &&
    (position.y < radius ||
      obstacles.some(
        (platform) =>
          position.x + radius > platform.x &&
          position.x - radius < platform.x + platform.width &&
          position.y + radius > platform.y &&
          position.y - radius < platform.y + platform.height,
      ))
  )
    return;
  player.radius = radius;
  player.position = position;
  player.shrunk = shrink;
};

/** Solid platform collision uses the player's radius as an axis-aligned half extent. */
export const movePlayer = (
  player: PlayerState,
  directionX: number,
  jump: boolean,
  dt: number,
  obstacles: ObstacleState[],
  shrink = false,
): void => {
  if (!player.alive) return;
  resizePlayer(player, shrink, obstacles);
  if (jump && !player.jumpHeld && player.grounded && !player.shrunk)
    player.velocity.y = -GAME_CONFIG.jumpSpeed;
  player.jumpHeld = jump;
  player.velocity.x =
    Math.max(-1, Math.min(1, directionX)) *
    GAME_CONFIG.movementSpeed *
    (player.shrunk ? GAME_CONFIG.playerShrinkSpeedMultiplier : 1);
  player.velocity.y = Math.min(
    GAME_CONFIG.maxFallSpeed,
    player.velocity.y + GAME_CONFIG.gravity * dt,
  );
  const r = player.radius;
  const fromX = player.position.x;
  let x = Math.max(r, Math.min(GAME_CONFIG.arena.width - r, fromX + player.velocity.x * dt));
  for (const platform of obstacles) {
    if (
      player.position.y + r <= platform.y ||
      player.position.y - r >= platform.y + platform.height
    )
      continue;
    if (player.velocity.x > 0 && fromX + r <= platform.x && x + r >= platform.x)
      x = Math.min(x, platform.x - r);
    else if (
      player.velocity.x < 0 &&
      fromX - r >= platform.x + platform.width &&
      x - r <= platform.x + platform.width
    )
      x = Math.max(x, platform.x + platform.width + r);
  }
  if (Math.abs(x - (fromX + player.velocity.x * dt)) > 0.001) player.velocity.x = 0;
  player.position.x = x;

  const fromY = player.position.y;
  let y = Math.max(r, Math.min(GAME_CONFIG.arena.height - r, fromY + player.velocity.y * dt));
  player.grounded = false;
  for (const platform of obstacles) {
    if (x + r <= platform.x || x - r >= platform.x + platform.width) continue;
    if (player.velocity.y >= 0 && fromY + r <= platform.y && y + r >= platform.y) {
      y = Math.min(y, platform.y - r);
      player.grounded = true;
    } else if (
      player.velocity.y < 0 &&
      fromY - r >= platform.y + platform.height &&
      y - r <= platform.y + platform.height
    )
      y = Math.max(y, platform.y + platform.height + r);
  }
  if (player.velocity.y >= 0 && y === GAME_CONFIG.arena.height - r) player.grounded = true;
  if (Math.abs(y - (fromY + player.velocity.y * dt)) > 0.001 || player.grounded)
    player.velocity.y = 0;
  player.position.y = y;
};

export const moveBomb = (
  bomb: BombState,
  dt: number,
  players: Record<string, PlayerState>,
  obstacles: ObstacleState[],
): void => {
  if (bomb.exploded) return;
  if (bomb.attachment) {
    bomb.position = attachedPosition(bomb.attachment, players);
    return;
  }
  bomb.velocity.x *= Math.exp(-GAME_CONFIG.bombAirDrag * dt);
  bomb.velocity.y = Math.min(
    GAME_CONFIG.maxFallSpeed,
    bomb.velocity.y + GAME_CONFIG.bombGravity * dt,
  );
  const from = { ...bomb.position };
  const to = { x: from.x + bomb.velocity.x * dt, y: from.y + bomb.velocity.y * dt };
  const impact = firstImpact(
    from,
    to,
    bomb.radius,
    Object.values(players).filter((player) => player.id !== bomb.ownerId),
    obstacles,
    8,
  );
  if (impact) {
    bomb.attachment = impact;
    bomb.position = attachedPosition(impact, players);
    bomb.velocity = { x: 0, y: 0 };
    return;
  }
  bomb.position = {
    x: Math.max(bomb.radius, Math.min(GAME_CONFIG.arena.width - bomb.radius, to.x)),
    y: Math.max(bomb.radius, Math.min(GAME_CONFIG.arena.height - bomb.radius, to.y)),
  };
  if (bomb.position.x !== to.x || bomb.position.y !== to.y) {
    bomb.attachment = { kind: 'world', position: { ...bomb.position } };
    bomb.velocity = { x: 0, y: 0 };
  }
};
