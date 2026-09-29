import Phaser from 'phaser';
import {
  GAME_CONFIG,
  availableBombCharges,
  bombLaunchVelocity,
  bombLaunchPosition,
  bombBlinkOn,
  chargedThrowForce,
  moveBomb,
  type BombState,
  type MatchState,
  type PlayerInput,
  type PlayerState,
} from '@squeaky/shared';
import type { GameSession } from './GameSession';
import { BombHud } from './BombHud';

interface SizeAnimation {
  from: number;
  to: number;
  startedAt: number;
}

export class ArenaScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private controls!: Phaser.GameObjects.Text;
  private bombHud!: BombHud;
  private startCountdown!: Phaser.GameObjects.Text;
  private startHint!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private sequence = 0;
  private finished = false;
  private jumpPressed = false;
  private throwPressed = false;
  private throwForce = 1;
  private detonatePressed = false;
  private chargingStartedAt: number | undefined;
  private readonly sizeAnimations = new Map<string, SizeAnimation>();

  constructor(
    private readonly session: GameSession,
    private readonly onFinished: (state: MatchState) => void,
  ) {
    super('arena');
  }

  create(): void {
    this.session.start();
    this.sizeAnimations.clear();
    this.cameras.main.setBounds(0, 0, GAME_CONFIG.arena.width, GAME_CONFIG.arena.height);
    this.graphics = this.add.graphics();
    this.hud = this.add
      .text(16, 16, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: '#07111e',
        padding: { x: 14, y: 10 },
        lineSpacing: 8,
        resolution: 2,
      })
      .setScrollFactor(0)
      .setDepth(20);
    this.controls = this.add
      .text(
        16,
        0,
        [
          'A / D or ← / → move · Space / W / ↑ jump · Mouse aims',
          'Hold CTRL: ½ size + hitbox · ½ speed · No jump',
          `Hold left: charge 1–${GAME_CONFIG.maxBombThrowForce}× · Release: throw`,
          `Right: explode newest · ${GAME_CONFIG.bombDetonationCooldownMs / 1000}s cooldown`,
          'Blue bombs are safe · Other colors hurt · Faster blink = less time',
        ],
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          color: '#ffffff',
          backgroundColor: '#07111e',
          padding: { x: 14, y: 10 },
          lineSpacing: 6,
          resolution: 2,
        },
      )
      .setScrollFactor(0)
      .setDepth(20);
    this.bombHud = new BombHud(this);
    this.startCountdown = this.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '80px',
        fontStyle: 'bold',
        color: '#ffdc83',
        stroke: '#07111e',
        strokeThickness: 6,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30);
    this.startHint = this.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: '#07111e',
        padding: { x: 12, y: 8 },
        resolution: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30);
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input unavailable');
    this.keys = keyboard.addKeys('W,A,D,UP,LEFT,RIGHT,SPACE,CTRL') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    for (const key of ['W', 'UP', 'SPACE'])
      this.keys[key]!.on('down', () => (this.jumpPressed = true));
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const state = this.session.getState();
      if (
        !state.players[this.session.localPlayerId]?.alive ||
        state.now < GAME_CONFIG.matchCountdownMs + GAME_CONFIG.bombUnlockDelayMs
      )
        return;
      if (pointer.button === 0) this.chargingStartedAt = state.now;
      if (pointer.button === 2) this.detonatePressed = true;
    });
    const releaseThrow = (pointer: Phaser.Input.Pointer): void => {
      if (pointer.button !== 0 || this.chargingStartedAt === undefined) return;
      this.throwForce = chargedThrowForce(this.session.getState().now - this.chargingStartedAt);
      this.throwPressed = true;
      this.chargingStartedAt = undefined;
    };
    this.input.on('pointerup', releaseThrow);
    this.input.on('pointerupoutside', releaseThrow);
    const cancelCharge = (): void => {
      this.chargingStartedAt = undefined;
      this.throwPressed = false;
      this.detonatePressed = false;
      this.jumpPressed = false;
    };
    this.game.events.on(Phaser.Core.Events.BLUR, cancelCharge);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.game.events.off(Phaser.Core.Events.BLUR, cancelCharge),
    );
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
        y: 0,
      },
      jump: Boolean(
        this.jumpPressed || this.keys.SPACE?.isDown || this.keys.W?.isDown || this.keys.UP?.isDown,
      ),
      shrink: Boolean(this.keys.CTRL?.isDown),
      aim: player
        ? { x: world.x - player.position.x, y: world.y - player.position.y }
        : { x: 1, y: 0 },
      throwBomb: this.throwPressed,
      throwForce: this.throwForce,
      detonateBomb: this.detonatePressed,
    };
    this.jumpPressed = false;
    this.throwPressed = false;
    this.detonatePressed = false;
    const state = this.session.update(delta, input);
    this.renderState(state);
    const local = state.players[this.session.localPlayerId];
    if (!local?.alive) this.chargingStartedAt = undefined;
    const followed = local?.alive
      ? local
      : Object.values(state.players).find((entity) => entity.alive);
    if (followed) this.cameras.main.centerOn(followed.position.x, followed.position.y - 65);
    if (state.status === 'finished' && !this.finished) {
      this.finished = true;
      this.time.delayedCall(900, () => this.onFinished(state));
    }
  }

  private renderState(state: MatchState): void {
    const g = this.graphics.clear();
    const { width, height } = GAME_CONFIG.arena;
    g.fillStyle(0x0d1b30).fillRect(0, 0, width, height);
    g.fillStyle(0x132c40).fillRect(0, 420, width, height - 420);
    for (let x = 0; x < width; x += 380)
      g.fillStyle(0x1b3d4c).fillTriangle(x - 180, 940, x + 200, 460, x + 600, 940);
    g.lineStyle(1, 0x355264, 0.3);
    for (let y = 340; y < height; y += 150) g.lineBetween(0, y, width, y);

    const left = Math.max(0, state.zone.center.x - state.zone.radius);
    const right = Math.min(width, state.zone.center.x + state.zone.radius);
    g.fillStyle(0x501f50, 0.65)
      .fillRect(0, 0, left, height)
      .fillRect(right, 0, width - right, height);
    g.lineStyle(5, 0x62e6dc, 0.85)
      .lineBetween(left, 0, left, height)
      .lineBetween(right, 0, right, height);
    g.lineStyle(2, 0xf5d76e, 0.45)
      .lineBetween(
        state.zone.center.x - state.zone.nextRadius,
        0,
        state.zone.center.x - state.zone.nextRadius,
        height,
      )
      .lineBetween(
        state.zone.center.x + state.zone.nextRadius,
        0,
        state.zone.center.x + state.zone.nextRadius,
        height,
      );
    for (const platform of state.obstacles) {
      g.fillStyle(0x2d465e).fillRect(platform.x, platform.y, platform.width, platform.height);
      g.fillStyle(0x69bfae).fillRect(platform.x, platform.y, platform.width, 5);
      g.fillStyle(0x1d3146).fillRect(
        platform.x,
        platform.y + platform.height - 6,
        platform.width,
        6,
      );
      for (let x = platform.x + 20; x < platform.x + platform.width; x += 70)
        g.fillStyle(0x597a91).fillCircle(x, platform.y + 14, 3);
    }
    const local = state.players[this.session.localPlayerId];
    const weaponsLocked = state.now < GAME_CONFIG.matchCountdownMs + GAME_CONFIG.bombUnlockDelayMs;
    const force =
      this.chargingStartedAt === undefined
        ? 1
        : chargedThrowForce(state.now - this.chargingStartedAt);
    if (local?.alive && !weaponsLocked) this.renderThrowArc(state, force);
    for (const bomb of Object.values(state.bombs)) {
      if (bomb.exploded) {
        const age = state.now - (bomb.explodedAt ?? bomb.explodeAt);
        if (age < 350) {
          g.fillStyle(bomb.color, 0.3 * (1 - age / 350)).fillCircle(
            bomb.position.x,
            bomb.position.y,
            GAME_CONFIG.bombBlastRadius,
          );
          g.lineStyle(3, bomb.color, 0.8 * (1 - age / 350)).strokeCircle(
            bomb.position.x,
            bomb.position.y,
            GAME_CONFIG.bombBlastRadius,
          );
        }
        continue;
      }
      const lit = bombBlinkOn(bomb, state.now);
      g.fillStyle(bomb.color, lit ? 1 : 0.4).fillCircle(
        bomb.position.x,
        bomb.position.y,
        bomb.radius,
      );
      g.lineStyle(2, bomb.color, 0.95).strokeCircle(bomb.position.x, bomb.position.y, bomb.radius);
      g.lineStyle(3, 0xffffff, lit ? 0.95 : 0.1).strokeCircle(
        bomb.position.x,
        bomb.position.y,
        bomb.radius + 4,
      );
      g.lineStyle(2, bomb.color, lit ? 1 : 0.4).lineBetween(
        bomb.position.x,
        bomb.position.y - bomb.radius,
        bomb.position.x + 5,
        bomb.position.y - bomb.radius - 6,
      );
    }
    for (const entity of Object.values(state.players)) {
      if (!entity.alive) continue;
      const color = entity.color;
      const x = entity.position.x;
      const feet = entity.position.y + entity.radius;
      const scale = this.animatedPlayerScale(entity, state.now);
      const y = feet - GAME_CONFIG.playerRadius * scale;
      const r = GAME_CONFIG.playerRadius;
      const stride =
        entity.grounded && Math.abs(entity.velocity.x) > 1 ? Math.sin(state.now / 90) * 4 : 0;
      g.save().translateCanvas(x, y).scaleCanvas(scale, scale);
      g.fillStyle(color).fillRoundedRect(-r + 4, -8, r * 2 - 8, r + 8, 7);
      g.fillStyle(color).fillCircle(0, -12, 11);
      g.fillStyle(0x07111e).fillCircle(Math.sign(entity.aim.x) * 5, -14, 3);
      g.fillStyle(0xbfeaf0)
        .fillRect(-14 + stride, r - 7, 11, 7)
        .fillRect(3 - stride, r - 7, 11, 7);
      g.lineStyle(4, 0xffffff, 0.8).lineBetween(0, 0, entity.aim.x * 32, entity.aim.y * 32);
      g.restore();
      g.fillStyle(0x08111f).fillRect(x - 25, feet - 2 * r * scale - 18, 50, 6);
      g.fillStyle(entity.health <= GAME_CONFIG.bombDamage ? 0xff6f7d : 0x79ebae).fillRect(
        x - 25,
        feet - 2 * r * scale - 18,
        (50 * entity.health) / GAME_CONFIG.playerHealth,
        6,
      );
    }
    const phase = GAME_CONFIG.zonePhases[state.zone.phaseIndex];
    const phaseRemaining = phase
      ? Math.max(
          0,
          (state.zone.shrinking ? phase.waitMs + phase.shrinkMs : phase.waitMs) -
            (state.now - state.zone.phaseStartedAt),
        )
      : 0;
    const alive = Object.values(state.players).filter((entity) => entity.alive).length;
    const startRemaining = Math.max(0, GAME_CONFIG.matchCountdownMs - state.now);
    const weaponRemaining = Math.max(
      0,
      GAME_CONFIG.matchCountdownMs + GAME_CONFIG.bombUnlockDelayMs - state.now,
    );
    this.startCountdown.setVisible(Boolean(startRemaining));
    this.startCountdown.setPosition(this.scale.width / 2, this.scale.height * 0.3);
    this.startCountdown.setText(String(Math.ceil(startRemaining / 1000)));
    this.startHint.setVisible(Boolean(weaponRemaining));
    this.startHint.setPosition(this.scale.width / 2, this.scale.height * 0.3 + 65);
    this.startHint.setText(
      startRemaining
        ? 'GET READY · INVULNERABLE'
        : `MOVE! · BOMBS UNLOCK IN ${Math.ceil(weaponRemaining / 1000)}s`,
    );
    this.startHint.setScale(
      Math.min(1, (this.scale.width - 32) / Math.max(1, this.startHint.width)),
    );
    this.hud.setText([
      `${local?.alive ? 'PLATFORM ARENA' : 'ELIMINATED · SPECTATING'} · ${alive} / ${Object.keys(state.players).length} ALIVE`,
      `YOU: BLUE · HEALTH ${local?.health ?? 0} / ${GAME_CONFIG.playerHealth}`,
      local?.shrunk
        ? this.keys.CTRL?.isDown
          ? 'SHRUNK · ½ SIZE / SPEED · NO JUMP'
          : 'SHRUNK · NEED ROOM TO GROW'
        : 'NORMAL SIZE · HOLD CTRL TO SHRINK',
      `STORM ${state.zone.shrinking ? 'CLOSING' : 'HOLDING'}${phase ? ` · ${Math.ceil(phaseRemaining / 1000)}s` : ' · FINAL BOUNDARY'} · LETHAL`,
    ]);
    this.bombHud.renderState(
      state,
      this.session.localPlayerId,
      this.chargingStartedAt === undefined ? undefined : force,
    );
    // Keep the HUD inside the viewport when resized; gameplay remains in world coordinates.
    const maxWidth =
      this.scale.width >= 760
        ? this.scale.width - this.bombHud.displayWidth - 48
        : this.scale.width - 32;
    this.hud.setScale(Math.min(1, maxWidth / Math.max(1, this.hud.width)));
    this.controls.setScale(Math.min(1, maxWidth / Math.max(1, this.controls.width)));
    this.controls.setPosition(16, 28 + this.hud.displayHeight);
    this.controls.setVisible(this.scale.width >= 760 && this.scale.height >= 480);
  }

  private animatedPlayerScale(player: PlayerState, now: number): number {
    const target = player.radius / GAME_CONFIG.playerRadius;
    const animation = this.sizeAnimations.get(player.id);
    if (!animation) {
      this.sizeAnimations.set(player.id, { from: target, to: target, startedAt: now });
      return target;
    }
    const progress = Math.max(
      0,
      Math.min(1, (now - animation.startedAt) / GAME_CONFIG.playerShrinkAnimationMs),
    );
    const eased = progress * progress * (3 - 2 * progress);
    const scale = animation.from + (animation.to - animation.from) * eased;
    if (animation.to !== target) {
      animation.from = scale;
      animation.to = target;
      animation.startedAt = now;
    }
    return scale;
  }

  private renderThrowArc(state: MatchState, force: number): void {
    const local = state.players[this.session.localPlayerId];
    if (!local || availableBombCharges(local, state.now) === 0) return;
    const preview: BombState = {
      id: 'preview',
      ownerId: local.id,
      color: local.color,
      position: bombLaunchPosition(local),
      radius: GAME_CONFIG.bombRadius,
      velocity: bombLaunchVelocity(local.aim, force, local.velocity),
      thrownAt: state.now,
      explodeAt: state.now + GAME_CONFIG.bombFuseMs,
      exploded: false,
    };
    for (let i = 0; i < 180; i += 1) {
      moveBomb(preview, 1 / 60, state.players, state.obstacles);
      if (i % 4 === 0)
        this.graphics
          .fillStyle(local.color, 0.5)
          .fillCircle(preview.position.x, preview.position.y, 2);
      if (preview.attachment) break;
    }
  }
}
