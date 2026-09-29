import { GAME_CONFIG } from './config.js';
import type {
  BombAttachment,
  BombState,
  Circle,
  EntityId,
  MatchResult,
  MatchState,
  ObstacleState,
  PlayerState,
  ShrinkingZoneState,
  Vector2,
} from './types.js';

export const distanceSquared = (a: Vector2, b: Vector2): number =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const normalize = (v: Vector2): Vector2 => {
  const length = Math.hypot(v.x, v.y);
  return length ? { x: v.x / length, y: v.y / length } : { x: 0, y: 0 };
};
export const bombShouldExplode = (bomb: BombState, now: number): boolean =>
  !bomb.exploded && now >= bomb.explodeAt;
export const isInBlastRange = (bomb: BombState, target: Circle): boolean =>
  distanceSquared(bomb.position, target.position) <=
  (GAME_CONFIG.bombBlastRadius + target.radius) ** 2;
export const isOutsideZone = (target: Circle, zone: ShrinkingZoneState): boolean =>
  distanceSquared(target.position, zone.center) > (zone.radius - target.radius) ** 2;

export const circleHitsObstacle = (circle: Circle, obstacle: ObstacleState): boolean => {
  const x = Math.max(obstacle.x, Math.min(circle.position.x, obstacle.x + obstacle.width));
  const y = Math.max(obstacle.y, Math.min(circle.position.y, obstacle.y + obstacle.height));
  return distanceSquared(circle.position, { x, y }) <= circle.radius ** 2;
};

export const firstImpact = (
  from: Vector2,
  to: Vector2,
  radius: number,
  players: PlayerState[],
  obstacles: ObstacleState[],
  samples = 80,
): BombAttachment | undefined => {
  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const position = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    const hitPlayer = players.find(
      (player) =>
        player.alive && distanceSquared(position, player.position) <= (radius + player.radius) ** 2,
    );
    if (hitPlayer) {
      return {
        kind: 'entity',
        entityId: hitPlayer.id,
        offset: { x: position.x - hitPlayer.position.x, y: position.y - hitPlayer.position.y },
      };
    }
    if (obstacles.some((obstacle) => circleHitsObstacle({ position, radius }, obstacle)))
      return { kind: 'world', position };
  }
  return undefined;
};

export const attachedPosition = (
  attachment: BombAttachment,
  entities: Record<EntityId, PlayerState>,
): Vector2 => {
  if (attachment.kind === 'world') return attachment.position;
  const target = entities[attachment.entityId];
  return target
    ? { x: target.position.x + attachment.offset.x, y: target.position.y + attachment.offset.y }
    : { x: attachment.offset.x, y: attachment.offset.y };
};

export const zoneAtTime = (
  zone: ShrinkingZoneState,
  now: number,
  phases: readonly import('./types.js').ZonePhase[] = GAME_CONFIG.zonePhases,
): ShrinkingZoneState => {
  let result = { ...zone };
  while (result.phaseIndex < phases.length) {
    const phase = phases[result.phaseIndex];
    if (!phase) break;
    const elapsed = now - result.phaseStartedAt;
    if (elapsed < phase.waitMs) return { ...result, shrinking: false, nextRadius: phase.radius };
    const shrinkElapsed = elapsed - phase.waitMs;
    if (shrinkElapsed < phase.shrinkMs) {
      const progress = shrinkElapsed / phase.shrinkMs;
      return {
        ...result,
        shrinking: true,
        nextRadius: phase.radius,
        radius: result.radius + (phase.radius - result.radius) * progress,
      };
    }
    result = {
      ...result,
      radius: phase.radius,
      nextRadius: phases[result.phaseIndex + 1]?.radius ?? phase.radius,
      phaseIndex: result.phaseIndex + 1,
      phaseStartedAt: result.phaseStartedAt + phase.waitMs + phase.shrinkMs,
      shrinking: false,
    };
  }
  return result;
};

export const selectWinner = (state: MatchState): MatchResult => {
  const survivors = Object.values(state.players)
    .filter((player) => player.alive)
    .map((player) => player.id);
  return { survivors, ...(survivors.length === 1 ? { winnerId: survivors[0] } : {}) };
};
