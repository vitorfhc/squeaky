import { describe, expect, it } from 'vitest';
import { GAME_CONFIG, type PlayerInput } from '@squeaky/shared';
import { LocalGameSession } from '../src/game/LocalGameSession';

const input: PlayerInput = {
  sequence: 0,
  movement: { x: 0, y: 0 },
  jump: false,
  shrink: false,
  aim: { x: 1, y: 0 },
  throwBomb: false,
  throwForce: 1,
  detonateBomb: false,
};

const readySession = (session: LocalGameSession) => {
  const state = session.start();
  state.now = GAME_CONFIG.matchCountdownMs + GAME_CONFIG.bombUnlockDelayMs;
  state.status = 'running';
  return state;
};

describe('render-to-simulation input adapter', () => {
  it('retains a quick jump and throw when a render frame is shorter than a fixed step', () => {
    const session = new LocalGameSession('Player', 1);
    const state = readySession(session);
    const startY = state.players.local!.position.y;
    const startTime = state.now;
    session.update(5, { ...input, jump: true, throwBomb: true });
    expect(state.now).toBe(startTime);
    session.update(12, input);
    expect(state.players.local!.position.y).toBeLessThan(startY);
    expect(state.players.local!.velocity.y).toBeLessThan(0);
    expect(Object.values(state.bombs).filter((bomb) => bomb.ownerId === 'local')).toHaveLength(1);
  });

  it('produces equivalent simulation results at 30 and 120 render frames per second', () => {
    const a = new LocalGameSession('Player', 1);
    const b = new LocalGameSession('Player', 1);
    // Compare the same randomized initial match at both render frame rates.
    Object.assign(readySession(b), structuredClone(readySession(a)));
    const held = { ...input, movement: { x: 1, y: 0 }, throwBomb: true };
    for (let i = 0; i < 60; i += 1) a.update(1000 / 30, held);
    for (let i = 0; i < 240; i += 1) b.update(1000 / 120, held);
    expect(a.getState().players).toEqual(b.getState().players);
    expect(a.getState().bombs).toEqual(b.getState().bombs);
    expect(a.getState().now).toBe(b.getState().now);
  });

  it('restarting a session resets elapsed time, resources and buffered actions', () => {
    const session = new LocalGameSession('Player', 1);
    session.start();
    session.update(5, { ...input, jump: true, throwBomb: true });
    session.start();
    const state = session.update(17, input);
    expect(state.players.local!.grounded).toBe(true);
    expect(state.players.local!.shrunk).toBe(false);
    expect(state.players.local!.radius).toBe(22);
    expect(state.players.local!.health).toBe(100);
    expect(state.players.local!.bombCharges).toEqual([0, 0, 0]);
    expect(Object.values(state.bombs).filter((bomb) => bomb.ownerId === 'local')).toHaveLength(0);
  });

  it('holds shrink consistently at different render rates and restores size on release', () => {
    const a = new LocalGameSession('Player', 1);
    const b = new LocalGameSession('Player', 1);
    const initial = readySession(a);
    initial.players.local!.position = { x: 500, y: 918 };
    Object.assign(readySession(b), structuredClone(initial));
    const feet = initial.players.local!.position.y + initial.players.local!.radius;
    const held = { ...input, shrink: true, jump: true, movement: { x: 1, y: 0 } };
    for (let i = 0; i < 30; i += 1) a.update(1000 / 30, held);
    for (let i = 0; i < 120; i += 1) b.update(1000 / 120, held);
    expect(a.getState().players).toEqual(b.getState().players);
    expect(a.getState().players.local!.shrunk).toBe(true);
    expect(a.getState().players.local!.radius).toBe(11);
    expect(a.getState().players.local!.velocity.x).toBe(135);
    expect(a.getState().players.local!.position.y + 11).toBe(feet);
    expect(a.getState().players.local!.position.x).toBeCloseTo(635);
    a.update(17, input);
    expect(a.getState().players.local!.shrunk).toBe(false);
    expect(a.getState().players.local!.radius).toBe(22);
    expect(a.getState().players.local!.velocity.x).toBe(0);
  });
});

describe('charged and detonation input buffering', () => {
  it('retains the released throw force across render frames with no simulation tick', () => {
    const session = new LocalGameSession('Player', 1);
    const state = readySession(session);
    session.update(5, { ...input, throwBomb: true, throwForce: 1.6 });
    session.update(12, input);
    const thrown = Object.values(state.bombs).find((value) => value.ownerId === 'local')!;
    expect(thrown).toBeDefined();
    expect(thrown.velocity.x).toBeGreaterThan(GAME_CONFIG.bombSpeed);
  });

  it('consumes a right-click once even when its render frame contains several simulation ticks', () => {
    const session = new LocalGameSession('Player', 1);
    const state = readySession(session);
    const owner = state.players.local!;
    state.bombs = Object.fromEntries(
      [0, 1].map((i) => [
        `owned-${i}`,
        {
          id: `owned-${i}`,
          ownerId: owner.id,
          color: owner.color,
          position: { ...owner.position },
          radius: GAME_CONFIG.bombRadius,
          velocity: { x: 0, y: 0 },
          thrownAt: state.now - 500 + i * 100,
          explodeAt: state.now + 3000,
          exploded: false,
          attachment: { kind: 'world' as const, position: { ...owner.position } },
        },
      ]),
    );
    session.update(5, { ...input, detonateBomb: true });
    session.update(95, input);
    expect(state.bombs['owned-1']!.exploded).toBe(true);
    expect(state.bombs['owned-0']!.exploded).toBe(false);
  });
});
