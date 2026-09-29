import { createMatch, stepMatch, type MatchState, type PlayerInput } from '@squeaky/shared';
import type { GameSession } from './GameSession';

export class LocalGameSession implements GameSession {
  readonly localPlayerId = 'local';
  private state!: MatchState;
  private accumulator = 0;
  private pendingJump = false;
  private pendingThrow = false;
  private pendingThrowForce = 1;
  private pendingDetonation = false;
  private readonly stepMs = 1000 / 60;
  constructor(
    private readonly displayName: string,
    private readonly botCount = 11,
  ) {}

  start(): MatchState {
    this.accumulator = 0;
    this.pendingJump = false;
    this.pendingThrow = false;
    this.pendingThrowForce = 1;
    this.pendingDetonation = false;
    this.state = createMatch(this.displayName, this.botCount, `local-${Date.now()}`);
    return this.state;
  }

  update(elapsedMs: number, input: PlayerInput): MatchState {
    if (this.state.status === 'finished') return this.state;
    // Preserve short presses on render frames that occur between simulation steps.
    this.pendingJump ||= input.jump;
    if (input.throwBomb) {
      this.pendingThrow = true;
      this.pendingThrowForce = input.throwForce;
    }
    this.pendingDetonation ||= input.detonateBomb;
    this.accumulator += Math.max(0, Math.min(elapsedMs, 100));
    while (this.accumulator >= this.stepMs && this.getState().status !== 'finished') {
      stepMatch(this.state, this.stepMs, {
        [this.localPlayerId]: {
          ...input,
          jump: input.jump || this.pendingJump,
          throwBomb: input.throwBomb || this.pendingThrow,
          throwForce: this.pendingThrow ? this.pendingThrowForce : input.throwForce,
          detonateBomb: this.pendingDetonation,
        },
      });
      this.pendingJump = false;
      this.pendingThrow = false;
      this.pendingDetonation = false;
      this.accumulator -= this.stepMs;
    }
    return this.state;
  }

  getState(): MatchState {
    return this.state;
  }
  dispose(): void {
    this.state.status = 'finished';
  }
}
