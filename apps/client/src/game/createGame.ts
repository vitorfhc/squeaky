import Phaser from 'phaser';
import type { MatchState } from '@squeaky/shared';
import { ArenaScene } from './ArenaScene';
import type { GameSession } from './GameSession';

export const createGame = (
  parent: HTMLElement,
  session: GameSession,
  onFinished: (state: MatchState) => void,
): Phaser.Game =>
  new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#08111f',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    render: { antialias: true },
    scene: new ArenaScene(session, onFinished),
  });
