import Phaser from 'phaser';
import { GAME_CONFIG, type MatchState, type PlayerInput } from '@squeaky/shared';
import type { GameSession } from './GameSession';

export class ArenaScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private sequence = 0;
  private finished = false;

  constructor(
    private readonly session: GameSession,
    private readonly onFinished: (state: MatchState) => void,
  ) {
    super('arena');
  }

  create(): void {
    this.session.start();
    this.cameras.main.setBounds(0, 0, GAME_CONFIG.arena.width, GAME_CONFIG.arena.height);
    this.graphics = this.add.graphics();
    this.hud = this.add
      .text(18, 16, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: '#e8f4ff',
        backgroundColor: '#08111fdd',
        padding: { x: 14, y: 10 },
        lineSpacing: 5,
      })
      .setScrollFactor(0)
      .setDepth(20);
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input unavailable');
    this.keys = keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    this.input.mouse?.disableContextMenu();
  }

  update(_time: number, delta: number): void {
    const current = this.session.getState();
    const player = current.players[this.session.localPlayerId];
    const pointer = this.input.activePointer;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const input: PlayerInput = {
      sequence: this.sequence++,
      movement: {
        x:
          Number(this.keys.D?.isDown || this.keys.RIGHT?.isDown) -
          Number(this.keys.A?.isDown || this.keys.LEFT?.isDown),
        y:
          Number(this.keys.S?.isDown || this.keys.DOWN?.isDown) -
          Number(this.keys.W?.isDown || this.keys.UP?.isDown),
      },
      aim: player
        ? { x: world.x - player.position.x, y: world.y - player.position.y }
        : { x: 1, y: 0 },
      throwBomb: Boolean(
        Phaser.Input.Keyboard.JustDown(this.keys.SPACE!) || pointer.leftButtonDown(),
      ),
    };
    const state = this.session.update(delta, input);
    this.renderState(state);
    const local = state.players[this.session.localPlayerId];
    if (local) this.cameras.main.centerOn(local.position.x, local.position.y);
    if (state.status === 'finished' && !this.finished) {
      this.finished = true;
      this.time.delayedCall(900, () => this.onFinished(state));
    }
  }

  private renderState(state: MatchState): void {
    const g = this.graphics.clear();
    g.fillStyle(0x10233a).fillRect(0, 0, GAME_CONFIG.arena.width, GAME_CONFIG.arena.height);
    g.lineStyle(3, 0x294763).strokeRect(
      2,
      2,
      GAME_CONFIG.arena.width - 4,
      GAME_CONFIG.arena.height - 4,
    );
    g.fillStyle(0x07111e, 0.72).fillCircle(state.zone.center.x, state.zone.center.y, 2200);
    g.fillStyle(0x143a43, 1).fillCircle(
      state.zone.center.x,
      state.zone.center.y,
      state.zone.radius,
    );
    g.lineStyle(8, 0x62e6dc, 0.85).strokeCircle(
      state.zone.center.x,
      state.zone.center.y,
      state.zone.radius,
    );
    g.lineStyle(3, 0xf5d76e, 0.65).strokeCircle(
      state.zone.center.x,
      state.zone.center.y,
      state.zone.nextRadius,
    );
    for (const obstacle of state.obstacles) {
      g.fillStyle(0x334e68).fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      g.lineStyle(4, 0x557b96).strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    }
    for (const bomb of Object.values(state.bombs)) {
      if (bomb.exploded) {
        if (state.now - bomb.explodeAt < 350)
          g.fillStyle(0xffb84d, 0.28).fillCircle(
            bomb.position.x,
            bomb.position.y,
            GAME_CONFIG.bombBlastRadius,
          );
        continue;
      }
      const remaining = Math.max(0, bomb.explodeAt - state.now) / GAME_CONFIG.bombFuseMs;
      g.fillStyle(remaining < 0.28 ? 0xff5b5b : 0xf4c542).fillCircle(
        bomb.position.x,
        bomb.position.y,
        bomb.radius,
      );
      g.lineStyle(3, 0xffffff, 0.8).strokeCircle(bomb.position.x, bomb.position.y, bomb.radius + 4);
    }
    for (const entity of Object.values(state.players)) {
      if (!entity.alive) continue;
      const color = entity.id === this.session.localPlayerId ? 0x67e8f9 : 0xf472b6;
      g.fillStyle(color).fillCircle(entity.position.x, entity.position.y, entity.radius);
      g.fillStyle(0xffffff).fillTriangle(
        entity.position.x + entity.aim.x * 38,
        entity.position.y + entity.aim.y * 38,
        entity.position.x + entity.aim.y * 9,
        entity.position.y - entity.aim.x * 9,
        entity.position.x - entity.aim.y * 9,
        entity.position.y + entity.aim.x * 9,
      );
    }
    const local = state.players[this.session.localPlayerId];
    const cooldown = local
      ? Math.max(0, GAME_CONFIG.bombCooldownMs - (state.now - local.lastThrowAt))
      : 0;
    const nextPhase = GAME_CONFIG.zonePhases[state.zone.phaseIndex];
    const phaseRemaining = nextPhase
      ? Math.max(0, nextPhase.waitMs + nextPhase.shrinkMs - (state.now - state.zone.phaseStartedAt))
      : 0;
    const alive = Object.values(state.players).filter((p) => p.alive).length;
    this.hud.setText([
      `LOCAL SIMULATION  •  ${state.status.toUpperCase()}`,
      `Remaining  ${alive} / ${Object.keys(state.players).length}`,
      `Bomb  ${cooldown ? `${(cooldown / 1000).toFixed(1)}s cooldown` : 'READY'}  •  Fuse ${(GAME_CONFIG.bombFuseMs / 1000).toFixed(0)}s`,
      `Zone  ${state.zone.shrinking ? 'CONTRACTING' : 'holding'}  •  next ${Math.ceil(phaseRemaining / 1000)}s`,
      'WASD / arrows move  •  pointer aims  •  click / Space throws',
    ]);
  }
}
