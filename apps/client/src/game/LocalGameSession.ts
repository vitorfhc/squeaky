import {
  GAME_CONFIG,
  attachedPosition,
  bombShouldExplode,
  circleHitsObstacle,
  firstImpact,
  isInBlastRange,
  isOutsideZone,
  normalize,
  selectWinner,
  zoneAtTime,
  type BombState,
  type MatchState,
  type ObstacleState,
  type PlayerInput,
  type PlayerState,
  type Vector2,
} from '@squeaky/shared';
import type { GameSession } from './GameSession';

const obstacles: ObstacleState[] = [
  { id: 'wall-a', x: 600, y: 420, width: 420, height: 90 },
  { id: 'wall-b', x: 2050, y: 380, width: 90, height: 520 },
  { id: 'wall-c', x: 1220, y: 930, width: 700, height: 100 },
  { id: 'wall-d', x: 440, y: 1510, width: 100, height: 400 },
  { id: 'wall-e', x: 2300, y: 1500, width: 480, height: 100 },
  { id: 'block-a', x: 1520, y: 330, width: 180, height: 180 },
  { id: 'block-b', x: 1100, y: 1640, width: 230, height: 230 },
];
const spawnPoints: Vector2[] = [
  { x: 1600, y: 1200 },
  { x: 300, y: 300 },
  { x: 2900, y: 300 },
  { x: 300, y: 1950 },
  { x: 2900, y: 1950 },
  { x: 800, y: 800 },
  { x: 2450, y: 1100 },
  { x: 1700, y: 1850 },
  { x: 1500, y: 650 },
  { x: 750, y: 1250 },
  { x: 2650, y: 750 },
  { x: 2100, y: 1850 },
];

export class LocalGameSession implements GameSession {
  readonly localPlayerId = 'local';
  private state!: MatchState;
  private bombSequence = 0;
  private accumulator = 0;
  private readonly stepMs = 1000 / 60;
  constructor(
    private readonly displayName: string,
    private readonly botCount = 11,
  ) {}

  start(): MatchState {
    const players: Record<string, PlayerState> = {};
    for (let i = 0; i <= this.botCount; i += 1) {
      const position = spawnPoints[i % spawnPoints.length] ?? { x: 1600, y: 1100 };
      const id = i === 0 ? this.localPlayerId : `bot-${i}`;
      players[id] = {
        id,
        displayName: i === 0 ? this.displayName : `Bot ${i}`,
        position: { ...position },
        radius: GAME_CONFIG.playerRadius,
        velocity: { x: 0, y: 0 },
        aim: { x: 1, y: 0 },
        alive: true,
        isBot: i !== 0,
        score: 0,
        lastThrowAt: -GAME_CONFIG.bombCooldownMs,
      };
    }
    this.state = {
      id: `local-${Date.now()}`,
      now: 0,
      status: 'running',
      players,
      bombs: {},
      obstacles,
      zone: {
        center: { x: GAME_CONFIG.arena.width / 2, y: GAME_CONFIG.arena.height / 2 },
        radius: 1850,
        nextRadius: GAME_CONFIG.zonePhases[0].radius,
        phaseIndex: 0,
        phaseStartedAt: 0,
        shrinking: false,
      },
    };
    return this.state;
  }

  update(elapsedMs: number, input: PlayerInput): MatchState {
    if (this.state.status !== 'running') return this.state;
    this.accumulator += Math.min(elapsedMs, 100);
    while (this.accumulator >= this.stepMs) {
      this.tick(this.stepMs, input);
      this.accumulator -= this.stepMs;
    }
    return this.state;
  }

  private tick(ms: number, input: PlayerInput): void {
    const dt = ms / 1000;
    this.state.now += ms;
    this.state.zone = zoneAtTime(this.state.zone, this.state.now);
    const local = this.state.players[this.localPlayerId];
    if (local?.alive) {
      local.aim = normalize(input.aim);
      this.movePlayer(local, normalize(input.movement), dt);
      if (input.throwBomb) this.throwBomb(local);
    }
    for (const bot of Object.values(this.state.players).filter((p) => p.isBot && p.alive))
      this.updateBot(bot, dt);
    this.updateBombs(dt);
    for (const player of Object.values(this.state.players)) {
      if (player.alive && GAME_CONFIG.zoneDamageIsLethal && isOutsideZone(player, this.state.zone))
        player.alive = false;
    }
    const result = selectWinner(this.state);
    if (result.survivors.length <= 1) {
      this.state.status = 'finished';
      if (result.winnerId) this.state.winnerId = result.winnerId;
    }
  }

  private movePlayer(player: PlayerState, direction: Vector2, dt: number): void {
    const prior = { ...player.position };
    player.velocity = {
      x: direction.x * GAME_CONFIG.movementSpeed,
      y: direction.y * GAME_CONFIG.movementSpeed,
    };
    player.position.x = Math.max(
      player.radius,
      Math.min(GAME_CONFIG.arena.width - player.radius, player.position.x + player.velocity.x * dt),
    );
    player.position.y = Math.max(
      player.radius,
      Math.min(
        GAME_CONFIG.arena.height - player.radius,
        player.position.y + player.velocity.y * dt,
      ),
    );
    if (this.state.obstacles.some((obstacle) => circleHitsObstacle(player, obstacle)))
      player.position = prior;
  }

  private updateBot(bot: PlayerState, dt: number): void {
    const targets = Object.values(this.state.players).filter((p) => p.alive && p.id !== bot.id);
    const target = targets.sort(
      (a, b) =>
        Math.hypot(a.position.x - bot.position.x, a.position.y - bot.position.y) -
        Math.hypot(b.position.x - bot.position.x, b.position.y - bot.position.y),
    )[0];
    if (!target) return;
    const toward = normalize({
      x: target.position.x - bot.position.x,
      y: target.position.y - bot.position.y,
    });
    bot.aim = toward;
    const distance = Math.hypot(
      target.position.x - bot.position.x,
      target.position.y - bot.position.y,
    );
    const strafe = Math.sin(this.state.now / 700 + Number(bot.id.slice(4))) * 0.55;
    this.movePlayer(
      bot,
      normalize({ x: toward.x + -toward.y * strafe, y: toward.y + toward.x * strafe }),
      dt,
    );
    if (distance < 700 && this.state.now - bot.lastThrowAt >= GAME_CONFIG.bombCooldownMs * 1.7)
      this.throwBomb(bot);
  }

  private throwBomb(player: PlayerState): void {
    if (this.state.now - player.lastThrowAt < GAME_CONFIG.bombCooldownMs) return;
    player.lastThrowAt = this.state.now;
    const id = `bomb-${this.bombSequence++}`;
    this.state.bombs[id] = {
      id,
      ownerId: player.id,
      position: {
        x: player.position.x + player.aim.x * 40,
        y: player.position.y + player.aim.y * 40,
      },
      radius: GAME_CONFIG.bombRadius,
      velocity: {
        x: player.aim.x * GAME_CONFIG.bombSpeed,
        y: player.aim.y * GAME_CONFIG.bombSpeed,
      },
      thrownAt: this.state.now,
      explodeAt: this.state.now + GAME_CONFIG.bombFuseMs,
      exploded: false,
    };
  }

  private updateBombs(dt: number): void {
    for (const bomb of Object.values(this.state.bombs)) {
      if (bomb.exploded) continue;
      if (bomb.attachment) bomb.position = attachedPosition(bomb.attachment, this.state.players);
      else {
        const from = { ...bomb.position };
        const to = { x: from.x + bomb.velocity.x * dt, y: from.y + bomb.velocity.y * dt };
        const candidates = Object.values(this.state.players).filter(
          (p) => p.id !== bomb.ownerId || this.state.now - bomb.thrownAt > 200,
        );
        const impact = firstImpact(from, to, bomb.radius, candidates, this.state.obstacles, 8);
        const outside =
          to.x < bomb.radius ||
          to.y < bomb.radius ||
          to.x > GAME_CONFIG.arena.width - bomb.radius ||
          to.y > GAME_CONFIG.arena.height - bomb.radius;
        if (impact) {
          bomb.attachment = impact;
          bomb.position = attachedPosition(impact, this.state.players);
          bomb.velocity = { x: 0, y: 0 };
        } else if (outside) {
          bomb.position = {
            x: Math.max(bomb.radius, Math.min(GAME_CONFIG.arena.width - bomb.radius, to.x)),
            y: Math.max(bomb.radius, Math.min(GAME_CONFIG.arena.height - bomb.radius, to.y)),
          };
          bomb.attachment = { kind: 'world', position: bomb.position };
          bomb.velocity = { x: 0, y: 0 };
        } else bomb.position = to;
      }
      if (bombShouldExplode(bomb, this.state.now)) this.explode(bomb);
    }
  }

  private explode(bomb: BombState): void {
    bomb.exploded = true;
    for (const player of Object.values(this.state.players))
      if (player.alive && isInBlastRange(bomb, player)) player.alive = false;
    if (GAME_CONFIG.chainReactions)
      for (const other of Object.values(this.state.bombs))
        if (!other.exploded && isInBlastRange(bomb, other)) this.explode(other);
  }

  getState(): MatchState {
    return this.state;
  }
  dispose(): void {
    this.state.status = 'finished';
  }
}
