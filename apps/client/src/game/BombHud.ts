import Phaser from 'phaser';
import { GAME_CONFIG, availableBombCharges, type MatchState } from '@squeaky/shared';

const panelWidth = 316;
const panelHeight = 228;
const seconds = (ms: number): string => `${(Math.ceil(ms / 100) / 10).toFixed(1)}s`;

export class BombHud extends Phaser.GameObjects.Container {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly heading: Phaser.GameObjects.Text;
  private readonly slots: Phaser.GameObjects.Text[];
  private readonly throwStatus: Phaser.GameObjects.Text;
  private readonly detonationStatus: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setScrollFactor(0).setDepth(25).setSize(panelWidth, panelHeight);
    this.graphics = scene.add.graphics();
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#ffffff',
      resolution: 2,
    };
    this.heading = scene.add.text(16, 12, '', { ...style, fontSize: '18px' });
    const subtitle = scene.add.text(
      16,
      38,
      `EACH CHARGE RELOADS IN ${GAME_CONFIG.bombReloadMs / 1000}s`,
      { ...style, fontSize: '12px', color: '#d0dfec' },
    );
    this.slots = Array.from({ length: GAME_CONFIG.bombCharges }, (_, i) =>
      scene.add.text(60 + i * 98, 110, '', style).setOrigin(0.5, 0),
    );
    this.throwStatus = scene.add.text(16, 163, '', style);
    this.detonationStatus = scene.add.text(16, 189, '', style);
    this.add([
      this.graphics,
      this.heading,
      subtitle,
      ...this.slots,
      this.throwStatus,
      this.detonationStatus,
    ]);
  }

  renderState(state: MatchState, localPlayerId: string, chargeForce: number | undefined): void {
    const local = state.players[localPlayerId];
    const alive = Boolean(local?.alive);
    const ready = alive && local ? availableBombCharges(local, state.now) : 0;
    const weaponRemaining = Math.max(
      0,
      GAME_CONFIG.matchCountdownMs + GAME_CONFIG.bombUnlockDelayMs - state.now,
    );
    const throwRemaining = local
      ? Math.max(0, GAME_CONFIG.bombCooldownMs - (state.now - local.lastThrowAt))
      : 0;
    const detonationRemaining = local ? Math.max(0, local.detonationReadyAt - state.now) : 0;
    const activeBomb = Object.values(state.bombs).some(
      (bomb) => bomb.ownerId === localPlayerId && !bomb.exploded,
    );
    this.heading.setText(`BOMBS · ${ready} / ${GAME_CONFIG.bombCharges} READY`);
    const g = this.graphics.clear();
    g.fillStyle(0x06111f).fillRoundedRect(0, 0, panelWidth, panelHeight, 14);
    g.lineStyle(2, 0x7c99b8).strokeRoundedRect(0, 0, panelWidth, panelHeight, 14);
    for (let i = 0; i < GAME_CONFIG.bombCharges; i += 1) {
      const x = 16 + i * 98;
      const remaining = Math.max(0, (local?.bombCharges[i] ?? 0) - state.now);
      const available = alive && remaining === 0;
      const progress = alive ? Math.max(0, 1 - remaining / GAME_CONFIG.bombReloadMs) : 0;
      const color = available ? 0x8effc6 : 0xffd782;
      g.fillStyle(available ? 0x122d45 : 0x17202f).fillRoundedRect(x, 60, 88, 90, 8);
      g.lineStyle(1, available ? 0x7bafd9 : 0x8a785e).strokeRoundedRect(x, 60, 88, 90, 8);
      g.fillStyle(available ? (local?.color ?? 0x4da3ff) : 0x536982).fillCircle(x + 44, 88, 12);
      g.lineStyle(2, 0xffffff).strokeCircle(x + 44, 88, 12);
      g.lineStyle(3, 0xffffff).lineBetween(x + 44, 76, x + 49, 70);
      g.fillStyle(0x06111f).fillRoundedRect(x + 8, 135, 72, 5, 2);
      g.fillStyle(color).fillRoundedRect(x + 8, 135, 72 * progress, 5, 2);
      this.slots[i]!.setText(!alive ? '—' : available ? 'READY' : seconds(remaining)).setColor(
        available ? '#8effc6' : '#ffd782',
      );
    }
    this.throwStatus
      .setText(
        !alive
          ? 'LEFT · THROW UNAVAILABLE'
          : weaponRemaining
            ? `LEFT · LOCKED ${Math.ceil(weaponRemaining / 1000)}s`
            : chargeForce !== undefined
              ? `LEFT · CHARGING ${chargeForce.toFixed(1)}×`
              : throwRemaining
                ? `LEFT · THROW IN ${seconds(throwRemaining)}`
                : ready === 0
                  ? 'LEFT · RELOADING'
                  : 'LEFT · THROW READY',
      )
      .setColor(weaponRemaining || chargeForce !== undefined ? '#ffd782' : '#ffffff');
    this.detonationStatus
      .setText(
        !alive
          ? 'RIGHT · EXPLODE UNAVAILABLE'
          : weaponRemaining
            ? `RIGHT · LOCKED ${Math.ceil(weaponRemaining / 1000)}s`
            : detonationRemaining
              ? `RIGHT · EXPLODE IN ${seconds(detonationRemaining)}`
              : activeBomb
                ? 'RIGHT · EXPLODE NOW READY'
                : 'RIGHT · NO ACTIVE BOMB',
      )
      .setColor(detonationRemaining || weaponRemaining ? '#ffd782' : '#ffffff');
    g.fillStyle(0x273a50).fillRoundedRect(16, 216, panelWidth - 32, 5, 2);
    if (alive && !weaponRemaining) {
      const progress = 1 - detonationRemaining / GAME_CONFIG.bombDetonationCooldownMs;
      g.fillStyle(detonationRemaining ? 0xffd782 : 0x8effc6).fillRoundedRect(
        16,
        216,
        (panelWidth - 32) * progress,
        5,
        2,
      );
    }
    const scale = Math.min(
      1,
      (this.scene.scale.width - 32) / panelWidth,
      (this.scene.scale.height - 32) / panelHeight,
    );
    this.setScale(scale).setPosition(
      this.scene.scale.width - 16 - panelWidth * scale,
      this.scene.scale.width >= 760 ? 16 : this.scene.scale.height - 16 - panelHeight * scale,
    );
  }
}
