import { describe, expect, it } from 'vitest';
import {
  attachedPosition,
  bombShouldExplode,
  firstImpact,
  isInBlastRange,
  isOutsideZone,
  selectWinner,
  type BombState,
  type MatchState,
  type PlayerState,
} from '../src/index.js';

const player = (id: string, x: number, y: number, alive = true): PlayerState => ({
  id,
  displayName: id,
  position: { x, y },
  radius: 25,
  velocity: { x: 0, y: 0 },
  aim: { x: 1, y: 0 },
  alive,
  isBot: false,
  score: 0,
  lastThrowAt: 0,
});
const bomb = (x = 0, y = 0): BombState => ({
  id: 'bomb',
  ownerId: 'owner',
  position: { x, y },
  radius: 12,
  velocity: { x: 1, y: 0 },
  thrownAt: 100,
  explodeAt: 3100,
  exploded: false,
});

describe('deterministic gameplay rules', () => {
  it('fires a three-second fuse at its deadline, not before', () => {
    const value = bomb();
    expect(bombShouldExplode(value, 3099)).toBe(false);
    expect(bombShouldExplode(value, 3100)).toBe(true);
  });
  it('attaches to the first impact along a throw', () => {
    const impact = firstImpact(
      { x: 0, y: 50 },
      { x: 500, y: 50 },
      10,
      [player('far', 350, 50)],
      [{ id: 'near-wall', x: 100, y: 0, width: 20, height: 100 }],
      500,
    );
    expect(impact?.kind).toBe('world');
    if (impact?.kind === 'world') expect(impact.position.x).toBeLessThan(120);
  });
  it('keeps an entity attachment offset when its target moves', () => {
    const attachment = { kind: 'entity' as const, entityId: 'target', offset: { x: 8, y: -4 } };
    expect(attachedPosition(attachment, { target: player('target', 70, 90) })).toEqual({
      x: 78,
      y: 86,
    });
  });
  it('includes a target edge in blast range and excludes farther targets', () => {
    expect(isInBlastRange(bomb(), player('edge', 215, 0))).toBe(true);
    expect(isInBlastRange(bomb(), player('outside', 216, 0))).toBe(false);
  });
  it('treats player radius crossing the safe boundary as zone exposure', () => {
    const zone = {
      center: { x: 0, y: 0 },
      radius: 100,
      nextRadius: 50,
      phaseIndex: 0,
      phaseStartedAt: 0,
      shrinking: false,
    };
    expect(isOutsideZone(player('safe', 75, 0), zone)).toBe(false);
    expect(isOutsideZone(player('fog', 76, 0), zone)).toBe(true);
  });
  it('selects exactly one living player as winner', () => {
    const state: MatchState = {
      id: 'test',
      now: 0,
      status: 'running',
      bombs: {},
      obstacles: [],
      zone: {
        center: { x: 0, y: 0 },
        radius: 100,
        nextRadius: 50,
        phaseIndex: 0,
        phaseStartedAt: 0,
        shrinking: false,
      },
      players: { a: player('a', 0, 0, false), b: player('b', 0, 0, true) },
    };
    expect(selectWinner(state)).toEqual({ survivors: ['b'], winnerId: 'b' });
  });
});
