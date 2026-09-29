export type EntityId = string;
export interface Vector2 {
  x: number;
  y: number;
}
export interface Circle {
  position: Vector2;
  radius: number;
}

export interface PlayerState extends Circle {
  id: EntityId;
  displayName: string;
  velocity: Vector2;
  aim: Vector2;
  alive: boolean;
  isBot: boolean;
  score: number;
  lastThrowAt: number;
}

export type BombAttachment =
  | { kind: 'world'; position: Vector2 }
  | { kind: 'entity'; entityId: EntityId; offset: Vector2 };

export interface BombState extends Circle {
  id: EntityId;
  ownerId: EntityId;
  velocity: Vector2;
  thrownAt: number;
  explodeAt: number;
  attachment?: BombAttachment;
  exploded: boolean;
}

export interface ObstacleState {
  id: EntityId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ZonePhase {
  waitMs: number;
  shrinkMs: number;
  radius: number;
}
export interface ShrinkingZoneState {
  center: Vector2;
  radius: number;
  nextRadius: number;
  phaseIndex: number;
  phaseStartedAt: number;
  shrinking: boolean;
}

export interface PlayerInput {
  sequence: number;
  movement: Vector2;
  aim: Vector2;
  throwBomb: boolean;
}

export type MatchStatus = 'waiting' | 'running' | 'finished';
export interface MatchState {
  id: string;
  now: number;
  status: MatchStatus;
  players: Record<EntityId, PlayerState>;
  bombs: Record<EntityId, BombState>;
  obstacles: ObstacleState[];
  zone: ShrinkingZoneState;
  winnerId?: EntityId;
}

export interface MatchResult {
  winnerId?: EntityId;
  survivors: EntityId[];
}
