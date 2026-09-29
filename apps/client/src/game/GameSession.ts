import type { MatchState, PlayerInput } from '@squeaky/shared';

export interface GameSession {
  readonly localPlayerId: string;
  start(): MatchState;
  update(elapsedMs: number, input: PlayerInput): MatchState;
  getState(): MatchState;
  dispose(): void;
}

/** Reserved transport boundary: snapshots and inputs will map to Colyseus messages later. */
export class NetworkGameSession implements GameSession {
  readonly localPlayerId = '';
  private unavailable(): never {
    throw new Error('Multiplayer networking is not active yet.');
  }
  start(): MatchState {
    return this.unavailable();
  }
  update(_elapsedMs: number, _input: PlayerInput): MatchState {
    return this.unavailable();
  }
  getState(): MatchState {
    return this.unavailable();
  }
  dispose(): void {
    /* Future room.leave(). */
  }
}
