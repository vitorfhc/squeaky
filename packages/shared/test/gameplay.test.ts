import { describe, expect, it } from 'vitest';
import {
  GAME_CONFIG,
  PLAYER_COLORS,
  applyBombDamage,
  availableBombCharges,
  bombLaunchVelocity,
  bombLaunchPosition,
  chargedThrowForce,
  detonateLatestBomb,
  bombBlinkOn,
  createMatch,
  explodeBomb,
  firstImpact,
  moveBomb,
  movePlayer,
  stepMatch,
  tryThrowBomb,
  zoneAtTime,
  type BombState,
  type PlayerInput,
  type PlayerState,
} from '../src/index.js';

const player = (id = 'local', x = 500, y = 918): PlayerState => ({
  ...createMatch(id, 0).players.local!,
  id,
  position: { x, y },
});
const floor = [{ id: 'floor', x: 0, y: 940, width: 2600, height: 60 }];
const bomb = (ownerId = 'enemy', x = 500, y = 918): BombState => ({
  id: `bomb-${ownerId}`,
  ownerId,
  color: ownerId === 'local' ? PLAYER_COLORS[0] : PLAYER_COLORS[1],
  position: { x, y },
  radius: GAME_CONFIG.bombRadius,
  velocity: { x: 0, y: 0 },
  thrownAt: 0,
  explodeAt: 3000,
  exploded: false,
});
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

const readyMatch = (name: string, bots = 11, id = 'local') => {
  const state = createMatch(name, bots, id);
  state.status = 'running';
  state.now = GAME_CONFIG.matchCountdownMs + GAME_CONFIG.bombUnlockDelayMs;
  state.zone.phaseStartedAt = state.now;
  return state;
};

// These boundaries specify behavior independently of the simulation's frame loop.
describe('health and blast ownership', () => {
  it('takes three enemy blasts to eliminate a healthy player', () => {
    const target = player();
    applyBombDamage(bomb(), target);
    expect(target.health).toBe(60);
    expect(target.alive).toBe(true);
    applyBombDamage(bomb(), target);
    expect(target.health).toBe(20);
    expect(target.alive).toBe(true);
    applyBombDamage(bomb(), target);
    expect(target.health).toBe(0);
    expect(target.alive).toBe(false);
    applyBombDamage(bomb(), target);
    expect(target.health).toBe(0);
  });
  it('never damages its owner, including an owner already at low health', () => {
    const owner = player();
    owner.health = 20;
    applyBombDamage(bomb(owner.id), owner);
    expect(owner.health).toBe(20);
    expect(owner.alive).toBe(true);
  });
  it('does no damage beyond the smaller blast edge', () => {
    const target = player('target', 613);
    applyBombDamage(bomb(), target);
    expect(target.health).toBe(100);
    target.position.x = 612;
    applyBombDamage(bomb(), target);
    expect(target.health).toBe(60);
  });
  it('resolves a three-bomb chain once each while keeping the owner immune', () => {
    const state = readyMatch('Owner', 1);
    state.players.local = player();
    state.players['bot-1'] = player('bot-1');
    const bombs = [0, 1, 2].map((i) => ({ ...bomb('local'), id: `chain-${i}`, explodeAt: 5000 }));
    state.bombs = Object.fromEntries(bombs.map((value) => [value.id, value]));
    state.now = 3000;
    explodeBomb(state, bombs[0]!);
    expect(bombs.every((value) => value.exploded && value.explodedAt === 3000)).toBe(true);
    expect(state.players.local.health).toBe(100);
    expect(state.players['bot-1']!.health).toBe(0);
    explodeBomb(state, bombs[0]!);
    expect(state.players.local.health).toBe(100);
  });
  it('uses each chained bomb owner when an enemy detonates your bomb', () => {
    const state = readyMatch('Owner', 1);
    state.players.local = player();
    state.players['bot-1'] = player('bot-1');
    const enemy = bomb('bot-1');
    const own = bomb('local');
    state.bombs = { enemy, own };
    explodeBomb(state, enemy);
    expect(state.players.local.health).toBe(60);
    expect(state.players['bot-1']!.health).toBe(60);
  });
});

describe('three independent charge slots and throw interval', () => {
  it('allows throws at 0, 500 and 1000ms, then reloads at 2000, 2500 and 3000ms', () => {
    const owner = player();
    expect(availableBombCharges(owner, 0)).toBe(3);
    expect(tryThrowBomb(owner, 'a', 0)).toBeDefined();
    const afterFirst = structuredClone(owner);
    expect(tryThrowBomb(owner, 'early', 499)).toBeUndefined();
    expect(owner).toEqual(afterFirst);
    expect(tryThrowBomb(owner, 'b', 500)).toBeDefined();
    expect(tryThrowBomb(owner, 'c', 1000)).toBeDefined();
    expect(owner.bombCharges).toEqual([2000, 2500, 3000]);
    expect(availableBombCharges(owner, 1999)).toBe(0);
    expect(tryThrowBomb(owner, 'empty', 1500)).toBeUndefined();
    expect(availableBombCharges(owner, 2000)).toBe(1);
    expect(availableBombCharges(owner, 2499)).toBe(1);
    expect(availableBombCharges(owner, 2500)).toBe(2);
    expect(availableBombCharges(owner, 2999)).toBe(2);
    expect(availableBombCharges(owner, 3000)).toBe(3);
  });
  it('reusing one reloaded slot does not reset the other reload deadlines', () => {
    const owner = player();
    for (const [i, time] of [0, 500, 1000].entries()) tryThrowBomb(owner, `initial-${i}`, time);
    expect(tryThrowBomb(owner, 'reloaded', 2000)).toBeDefined();
    expect(owner.bombCharges).toEqual([4000, 2500, 3000]);
    expect(availableBombCharges(owner, 2499)).toBe(0);
    expect(availableBombCharges(owner, 2500)).toBe(1);
    expect(availableBombCharges(owner, 3000)).toBe(2);
  });
  it('does not let eliminated players consume a charge', () => {
    const owner = player();
    owner.alive = false;
    expect(tryThrowBomb(owner, 'dead', 0)).toBeUndefined();
    expect(owner.bombCharges).toEqual([0, 0, 0]);
  });
});

describe('side-view player physics', () => {
  it('falls under gravity, lands on a solid platform, and stays grounded', () => {
    const falling = player('falling', 500, 500);
    falling.grounded = false;
    movePlayer(falling, 0, false, 1 / 60, floor);
    expect(falling.position.y).toBeGreaterThan(500);
    expect(falling.velocity.y).toBeGreaterThan(0);
    for (let i = 0; i < 120; i += 1) movePlayer(falling, 0, false, 1 / 60, floor);
    expect(falling.position.y).toBe(918);
    expect(falling.velocity.y).toBe(0);
    expect(falling.grounded).toBe(true);
  });
  it('jumps up to a platform 150px higher and cannot jump again in midair', () => {
    const jumper = player('jumper', 100);
    const platforms = [...floor, { id: 'step', x: 200, y: 790, width: 320, height: 26 }];
    movePlayer(jumper, 1, true, 1 / 60, platforms);
    const firstY = jumper.velocity.y;
    movePlayer(jumper, 1, false, 1 / 60, platforms);
    movePlayer(jumper, 1, true, 1 / 60, platforms);
    expect(jumper.velocity.y).toBeGreaterThan(firstY);
    let landed = false;
    for (let i = 0; i < 70; i += 1) {
      movePlayer(jumper, 1, false, 1 / 60, platforms);
      if (jumper.grounded) {
        landed = true;
        break;
      }
    }
    expect(landed).toBe(true);
    expect(jumper.position.y).toBe(768);
    expect(jumper.position.x).toBeGreaterThan(200);
  });
  it('holding jump does not auto-jump on landing; release allows the next jump', () => {
    const jumper = player();
    for (let i = 0; i < 120; i += 1) movePlayer(jumper, 0, true, 1 / 60, floor);
    expect(jumper.position.y).toBe(918);
    movePlayer(jumper, 0, false, 1 / 60, floor);
    movePlayer(jumper, 0, true, 1 / 60, floor);
    expect(jumper.position.y).toBeLessThan(918);
  });
  it('collides with the underside and side of solid platforms', () => {
    const ceiling = { id: 'ceiling', x: 200, y: 400, width: 300, height: 26 };
    const jumper = player('jumper', 300, 500);
    for (let i = 0; i < 5; i += 1) movePlayer(jumper, 0, i === 0, 1 / 60, [ceiling]);
    expect(jumper.position.y - jumper.radius).toBeGreaterThanOrEqual(426);
    expect(jumper.velocity.y).toBeGreaterThanOrEqual(0);
    const walker = player('walker', 100, 450);
    for (let i = 0; i < 20; i += 1)
      movePlayer(walker, 1, false, 1 / 60, [{ id: 'wall', x: 180, y: 0, width: 30, height: 1000 }]);
    expect(walker.position.x).toBe(158);
  });
  it('starts falling after walking off an edge and clamps arena bounds', () => {
    const walker = player('walker', 500, 768);
    const platform = [{ id: 'ledge', x: 200, y: 790, width: 320, height: 26 }];
    for (let i = 0; i < 15; i += 1) movePlayer(walker, 1, false, 1 / 60, platform);
    expect(walker.grounded).toBe(false);
    expect(walker.position.y).toBeGreaterThan(768);
    walker.position.x = GAME_CONFIG.arena.width - 10;
    movePlayer(walker, 1, false, 1 / 60, floor);
    expect(walker.position.x).toBe(GAME_CONFIG.arena.width - walker.radius);
  });
});

describe('held shrink mode', () => {
  it('halves size and horizontal speed, anchors the feet, and prevents jumping', () => {
    const small = player();
    for (let i = 0; i < 60; i += 1) movePlayer(small, 1, true, 1 / 60, floor, true);
    expect(small.shrunk).toBe(true);
    expect(small.radius).toBe(11);
    expect(small.position.x).toBeCloseTo(635);
    expect(small.velocity.x).toBe(135);
    expect(small.position.y).toBe(929);
    expect(small.position.y + small.radius).toBe(940);
    expect(small.grounded).toBe(true);
    expect(small.velocity.y).toBe(0);
  });

  it('restores normal size and speed on release without triggering a held jump', () => {
    const small = player();
    movePlayer(small, 0, true, 1 / 60, floor, true);
    movePlayer(small, 1, true, 1 / 60, floor, false);
    expect(small.shrunk).toBe(false);
    expect(small.radius).toBe(22);
    expect(small.velocity.x).toBe(270);
    expect(small.position.y + small.radius).toBe(940);
    expect(small.velocity.y).toBe(0);
    movePlayer(small, 0, false, 1 / 60, floor);
    movePlayer(small, 0, true, 1 / 60, floor);
    expect(small.velocity.y).toBeLessThan(0);
  });

  it('fits below a low ceiling and waits for clear space before growing', () => {
    const small = player('local', 150);
    const platforms = [...floor, { id: 'low-ceiling', x: 200, y: 905, width: 200, height: 8 }];
    for (let i = 0; i < 60; i += 1) movePlayer(small, 1, false, 1 / 60, platforms, true);
    expect(small.position.x).toBeCloseTo(285);
    expect(small.position.y - small.radius).toBeGreaterThanOrEqual(913);
    movePlayer(small, 0, true, 1 / 60, platforms, false);
    expect(small.shrunk).toBe(true);
    expect(small.radius).toBe(11);
    expect(small.velocity.y).toBe(0);
    for (let i = 0; i < 90; i += 1) movePlayer(small, 1, false, 1 / 60, platforms, false);
    expect(small.shrunk).toBe(false);
    expect(small.radius).toBe(22);
    expect(small.position.x - small.radius).toBeGreaterThanOrEqual(400);
    expect(small.position.y + small.radius).toBe(940);
  });

  it('keeps growth inside arena bounds and out of adjacent walls', () => {
    const corner = player('local', 22);
    movePlayer(corner, -1, false, 1 / 60, floor, true);
    for (let i = 0; i < 10; i += 1) movePlayer(corner, -1, false, 1 / 60, floor, true);
    expect(corner.position.x).toBe(11);
    movePlayer(corner, 0, false, 1 / 60, floor, false);
    expect(corner.position.x).toBe(22);
    expect(corner.radius).toBe(22);
    const small = player();
    const platforms = [...floor, { id: 'wall', x: 560, y: 850, width: 30, height: 90 }];
    for (let i = 0; i < 60; i += 1) movePlayer(small, 1, false, 1 / 60, platforms, true);
    expect(small.position.x).toBe(549);
    movePlayer(small, 0, false, 1 / 60, platforms, false);
    expect(small.shrunk).toBe(true);
    for (let i = 0; i < 10; i += 1) {
      movePlayer(small, -1, false, 1 / 60, platforms, false);
      expect(small.position.x + small.radius).toBeLessThanOrEqual(560);
    }
    expect(small.shrunk).toBe(false);
    expect(small.radius).toBe(22);
  });

  it('uses the smaller hitbox for bomb contact and blast range without granting immunity', () => {
    const small = player('small');
    movePlayer(small, 0, false, 0, floor, true);
    const full = player('full', small.position.x, small.position.y);
    const from = { x: 450, y: small.position.y + 25 };
    const to = { x: 550, y: from.y };
    expect(firstImpact(from, to, 12, [full], [], 100)?.kind).toBe('entity');
    expect(firstImpact(from, to, 12, [small], [], 100)).toBeUndefined();
    const near = bomb('enemy', 602, small.position.y);
    applyBombDamage(near, full);
    applyBombDamage(near, small);
    expect(full.health).toBe(60);
    expect(small.health).toBe(100);
    applyBombDamage(bomb('enemy', 601, small.position.y), small);
    expect(small.health).toBe(60);
    applyBombDamage(bomb(small.id, 500, small.position.y), small);
    expect(small.health).toBe(60);
  });

  it('applies shrink input in the match loop and keeps throwing at the scaled origin', () => {
    const state = readyMatch('Player', 1);
    state.obstacles = floor;
    state.players.local = player();
    state.players['bot-1'] = player('other', 2000);
    stepMatch(state, 1000 / 60, {
      local: { ...input, shrink: true, jump: true, movement: { x: 1, y: 0 }, throwBomb: true },
    });
    const small = state.players.local;
    expect(small.shrunk).toBe(true);
    expect(small.radius).toBe(11);
    expect(small.velocity).toEqual({ x: 135, y: 0 });
    expect(Object.values(state.bombs).filter((value) => value.ownerId === 'local')).toHaveLength(1);
    const thrown = tryThrowBomb(small, 'scaled-origin', state.now + 500)!;
    expect(thrown.position).toEqual({ x: small.position.x, y: small.position.y - 4 });
    expect(thrown.position).toEqual(bombLaunchPosition(small));
    expect(thrown.velocity.x).toBe(735);
  });
});

describe('heavy bomb physics', () => {
  it('rises, falls, and sticks nearby rather than flying across the arena', () => {
    const owner = player();
    const thrown = tryThrowBomb(owner, 'arc', 0)!;
    const startY = thrown.position.y;
    moveBomb(thrown, 1 / 60, { local: owner }, floor);
    expect(thrown.position.y).toBeLessThan(startY);
    for (let i = 0; i < 90; i += 1) moveBomb(thrown, 1 / 60, { local: owner }, floor);
    expect(thrown.attachment?.kind).toBe('world');
    expect(thrown.position.x - 500).toBeGreaterThan(40);
    expect(thrown.position.x - 500).toBeLessThan(320);
    expect(thrown.velocity).toEqual({ x: 0, y: 0 });
  });
  it('limits horizontal range even when dropped from a high platform', () => {
    const owner = player('local', 500, 100);
    const thrown = tryThrowBomb(owner, 'high', 0)!;
    for (let i = 0; i < 180; i += 1) moveBomb(thrown, 1 / 60, { local: owner }, floor);
    expect(thrown.position.x - 500).toBeLessThan(1000);
    expect(thrown.attachment?.kind).toBe('world');
  });
  it('attaches to opponents, follows them, and never attaches to its owner', () => {
    const owner = player();
    const target = player('target', 555, 895);
    const thrown = tryThrowBomb(owner, 'sticky', 0)!;
    for (let i = 0; i < 30 && !thrown.attachment; i += 1)
      moveBomb(thrown, 1 / 60, { local: owner, target }, floor);
    expect(thrown.attachment?.kind).toBe('entity');
    if (thrown.attachment?.kind !== 'entity') throw new Error('Expected sticky target');
    expect(thrown.attachment.entityId).toBe('target');
    const attachedX = thrown.position.x;
    target.position.x += 100;
    moveBomb(thrown, 1 / 60, { local: owner, target }, floor);
    expect(thrown.position.x).toBeCloseTo(attachedX + 100);
  });
});

describe('fixed-step match integration and zone progression', () => {
  it('applies the charge and cooldown rules to held input in a running match', () => {
    const state = readyMatch('Player', 1);
    state.obstacles = floor;
    state.players.local = player('local', 400);
    state.players['bot-1'] = player('other', 2000);
    for (let i = 0; i < 90; i += 1)
      stepMatch(state, 1000 / 60, { local: { ...input, throwBomb: true } });
    const thrown = Object.values(state.bombs);
    expect(thrown).toHaveLength(3);
    expect(availableBombCharges(state.players.local, state.now)).toBe(0);
    expect(thrown[1]!.thrownAt - thrown[0]!.thrownAt).toBeGreaterThanOrEqual(500);
    expect(thrown[2]!.thrownAt - thrown[1]!.thrownAt).toBeGreaterThanOrEqual(500);
    for (let i = 0; i < 40; i += 1)
      stepMatch(state, 1000 / 60, { local: { ...input, throwBomb: true } });
    expect(Object.values(state.bombs)).toHaveLength(4);
  });
  it('resolves a fuse, enemy damage, owner immunity and a winner through the match loop', () => {
    const state = readyMatch('Player', 1);
    state.obstacles = floor;
    state.players.local = player();
    state.players['bot-1'] = player('bot-1', 500);
    state.players['bot-1']!.health = 40;
    const value = {
      ...bomb('local'),
      explodeAt: 100,
      attachment: { kind: 'world' as const, position: { x: 500, y: 918 } },
    };
    state.bombs[value.id] = value;
    for (let i = 0; i < 6; i += 1) stepMatch(state, 1000 / 60, { local: input });
    expect(value.exploded).toBe(true);
    expect(state.players.local.health).toBe(100);
    expect(state.players['bot-1']!.alive).toBe(false);
    expect(state.winnerId).toBe('local');
    expect(state.status).toBe('finished');
  });
  it('shrinks linearly regardless of how often snapshots are updated', () => {
    const initial = createMatch('Player').zone;
    let incremental = initial;
    for (let time = 100; time <= 20000; time += 100) incremental = zoneAtTime(incremental, time);
    expect(incremental.radius).toBeCloseTo(3600);
    expect(incremental).toEqual(zoneAtTime(initial, 20000));
    expect(zoneAtTime(initial, 42000).radius).toBe(2400);
    expect(zoneAtTime(initial, 75000).radius).toBe(80);
    expect(zoneAtTime(initial, 87000).radius).toBe(0);
  });
  it('keeps zone damage lethal and clears health consistently', () => {
    const state = readyMatch('Player', 1);
    state.players.local!.position.x = 100;
    state.zone.radius = 900;
    state.zone.phaseStartRadius = 900;
    stepMatch(state, 1000 / 60, { local: input });
    expect(state.players.local!.health).toBe(0);
    expect(state.players.local!.alive).toBe(false);
  });
  it('eventually closes the storm even when survivors occupy different platform heights', () => {
    const state = readyMatch('Player', 1);
    state.players.local = player('local', GAME_CONFIG.arena.width / 2, 618);
    state.players['bot-1'] = player('bot-1', GAME_CONFIG.arena.width / 2, 918);
    for (let i = 0; i < 5100 && state.status === 'running'; i += 1)
      stepMatch(state, 1000 / 60, { local: input, 'bot-1': input });
    expect(state.status).toBe('finished');
    expect(Object.values(state.players).every((value) => !value.alive && value.health === 0)).toBe(
      true,
    );
  });
  it('creates at most twenty players on valid, separate platform surfaces', () => {
    const state = readyMatch('Player', 100);
    const participants = Object.values(state.players);
    expect(participants).toHaveLength(20);
    expect(
      new Set(participants.map((value) => `${value.position.x}:${value.position.y}`)).size,
    ).toBe(20);
    for (const value of participants) {
      expect(
        state.obstacles.some(
          (platform) =>
            value.position.y + value.radius === platform.y &&
            value.position.x - value.radius >= platform.x &&
            value.position.x + value.radius <= platform.x + platform.width,
        ),
      ).toBe(true);
    }
  });
  it('runs reproducibly through bot combat and match completion without invalid physics', () => {
    const a = readyMatch('Player', 11, 'test');
    const b = readyMatch('Player', 11, 'test');
    for (let i = 0; i < 7200 && a.status === 'running'; i += 1) {
      stepMatch(a, 1000 / 60, { local: input });
      stepMatch(b, 1000 / 60, { local: input });
      for (const value of Object.values(a.players)) {
        expect(Number.isFinite(value.position.x) && Number.isFinite(value.position.y)).toBe(true);
        expect(value.health).toBeGreaterThanOrEqual(0);
        expect(value.health).toBeLessThanOrEqual(100);
      }
    }
    expect(a).toEqual(b);
    expect(a.status).toBe('finished');
  });
});

describe('balanced randomized spawns', () => {
  it('spaces the actual participants evenly across the map with safe corner spawns', () => {
    for (const count of [2, 3, 12, 20]) {
      const state = createMatch('Player', count - 1, `spacing-${count}`);
      const players = Object.values(state.players).sort((a, b) => a.position.x - b.position.x);
      const first = players[0]!;
      const last = players.at(-1)!;
      expect(players).toHaveLength(count);
      expect(first.position.x).toBeLessThan(120);
      expect(GAME_CONFIG.arena.width - last.position.x).toBeLessThan(120);
      expect(first.position.y).toBe(918);
      expect(last.position.y).toBe(918);
      const gap = (last.position.x - first.position.x) / (count - 1);
      for (let i = 1; i < count; i += 1)
        expect(players[i]!.position.x - players[i - 1]!.position.x).toBeCloseTo(gap, 8);
      for (const participant of players) {
        expect(participant.position.x).toBeGreaterThanOrEqual(participant.radius);
        expect(participant.position.x).toBeLessThanOrEqual(
          GAME_CONFIG.arena.width - participant.radius,
        );
        expect(
          state.obstacles.some(
            (platform) =>
              participant.position.y + participant.radius === platform.y &&
              participant.position.x - participant.radius >= platform.x &&
              participant.position.x + participant.radius <= platform.x + platform.width,
          ),
        ).toBe(true);
      }
    }
  });

  it('randomizes player assignments between match IDs, including both corners for the local player', () => {
    const a = createMatch('Player', 11, 'repeatable-spawns');
    expect(createMatch('Player', 11, 'repeatable-spawns').players).toEqual(a.players);
    expect(createMatch('Player', 11, 'different-spawns').players).not.toEqual(a.players);
    const starts = Array.from(
      { length: 64 },
      (_, i) => createMatch('Player', 11, `random-spawns-${i}`).players.local!.position.x,
    );
    expect(starts.some((x) => x < 120)).toBe(true);
    expect(starts.some((x) => x > GAME_CONFIG.arena.width - 120)).toBe(true);
    expect(starts.some((x) => x > 2600 && x < 5200)).toBe(true);
  });
});

describe('expanded map and bomb presentation', () => {
  it('triples the arena area and populates all three sectors with platforms and spawns', () => {
    const state = readyMatch('Player', 19);
    expect(GAME_CONFIG.arena.width * GAME_CONFIG.arena.height).toBe(2600 * 1000 * 3);
    expect(state.obstacles.find((platform) => platform.id === 'ground')!.width).toBe(7800);
    expect(state.zone.center.x).toBe(3900);
    expect(state.zone.radius).toBe(3900);
    for (let sector = 0; sector < 3; sector += 1) {
      expect(
        state.obstacles.filter((platform) => platform.id.startsWith(`sector-${sector}-`)),
      ).toHaveLength(10);
      expect(
        Object.values(state.players).some(
          (participant) =>
            participant.position.x >= sector * 2600 && participant.position.x < (sector + 1) * 2600,
        ),
      ).toBe(true);
    }
  });

  it('assigns distinct player colors and preserves the owner color throughout a throw', () => {
    const state = readyMatch('Blue', 19);
    const players = Object.values(state.players);
    expect(new Set(players.map((participant) => participant.color)).size).toBe(20);
    expect(state.players.local!.color).toBe(0x4da3ff);
    expect(state.players['bot-1']!.color).toBe(0xff9f43);
    for (const owner of players) {
      const thrown = tryThrowBomb(owner, `color-${owner.id}`, 0)!;
      expect(thrown.color).toBe(owner.color);
      moveBomb(thrown, 1 / 60, state.players, state.obstacles);
      expect(thrown.color).toBe(owner.color);
      expect(JSON.parse(JSON.stringify(thrown)).color).toBe(owner.color);
    }
  });

  it('keeps immunity tied to ownership even if two players happen to share a color', () => {
    const owner = player();
    const sameColorEnemy = { ...bomb('other'), color: owner.color };
    applyBombDamage(sameColorEnemy, owner);
    expect(owner.health).toBe(60);
    applyBombDamage({ ...bomb(owner.id), color: owner.color }, owner);
    expect(owner.health).toBe(60);
  });

  it('travels farther than the prior launch speed while retaining gravity and drag', () => {
    const owner = player();
    const further = tryThrowBomb(owner, 'further', 0)!;
    const previous = { ...structuredClone(further), velocity: { x: 320, y: further.velocity.y } };
    for (let i = 0; i < 90; i += 1) {
      moveBomb(further, 1 / 60, {}, floor);
      moveBomb(previous, 1 / 60, {}, floor);
    }
    expect(further.attachment?.kind).toBe('world');
    expect(previous.attachment?.kind).toBe('world');
    expect(further.position.x - owner.position.x).toBeGreaterThan(
      (previous.position.x - owner.position.x) * 1.2,
    );
    expect(further.position.x - owner.position.x).toBeLessThan(
      (previous.position.x - owner.position.x) * 2,
    );
  });

  it('blinks more often near the fuse deadline without altering color or detonation time', () => {
    const value = bomb();
    const flashes = (from: number, to: number): number => {
      let prior = bombBlinkOn(value, from);
      let count = 0;
      for (let now = from + 1; now <= to; now += 1) {
        const lit = bombBlinkOn(value, now);
        if (lit && !prior) count += 1;
        prior = lit;
      }
      return count;
    };
    const before = structuredClone(value);
    expect(flashes(0, 1000)).toBeGreaterThan(0);
    expect(flashes(2000, 2999)).toBeGreaterThan(flashes(0, 1000) * 2);
    expect(value).toEqual(before);
    expect(bombBlinkOn(value, -100)).toBe(true);
  });
});

describe('charged throws and manual detonation', () => {
  it('charges from 1x to 1.6x in one second and clamps excess force', () => {
    expect(chargedThrowForce(-1)).toBe(1);
    expect(chargedThrowForce(0)).toBe(1);
    expect(chargedThrowForce(500)).toBe(1.3);
    expect(chargedThrowForce(1000)).toBe(1.6);
    expect(chargedThrowForce(5000)).toBe(1.6);
    const quick = bombLaunchVelocity({ x: 1, y: 0 }, 1);
    const full = bombLaunchVelocity({ x: 1, y: 0 }, 1.6);
    expect(full).toEqual({ x: quick.x * 1.6, y: quick.y * 1.6 });
    expect(bombLaunchVelocity({ x: 1, y: 0 }, 99)).toEqual(full);
    expect(bombLaunchVelocity({ x: 1, y: 0 }, Number.NaN)).toEqual(quick);
  });

  it('uses the same launch velocity for the charged trajectory and the actual bomb', () => {
    for (const force of [1, 1.3, 1.6]) {
      const owner = player();
      owner.aim = { x: 2, y: -1 };
      const thrown = tryThrowBomb(owner, `force-${force}`, 0, force)!;
      expect(thrown.velocity).toEqual(bombLaunchVelocity(owner.aim, force));
      expect(owner.bombCharges).toEqual([2000, 0, 0]);
    }
  });

  it('detonates only the latest owned bomb, including when the bombs are touching', () => {
    const state = readyMatch('Player', 1);
    const old = { ...bomb('local'), id: 'old', thrownAt: 4000, explodeAt: 7000 };
    const latest = { ...bomb('local'), id: 'latest', thrownAt: 4500, explodeAt: 7500 };
    const enemy = { ...bomb('bot-1'), id: 'enemy', thrownAt: 5000, explodeAt: 8000 };
    state.bombs = { old, latest, enemy };
    expect(detonateLatestBomb(state, 'local')?.id).toBe('latest');
    expect(latest.exploded).toBe(true);
    expect(old.exploded).toBe(false);
    expect(enemy.exploded).toBe(false);
    expect(detonateLatestBomb(state, 'local')).toBeUndefined();
    expect(old.exploded).toBe(false);
    expect(enemy.exploded).toBe(false);
  });

  it('enforces five seconds between successful detonations and keeps player cooldowns separate', () => {
    const state = readyMatch('Player', 1);
    const first = { ...bomb('local'), id: 'first', explodeAt: 9000 };
    state.bombs = { first };
    expect(detonateLatestBomb(state, 'local')?.id).toBe('first');
    expect(state.players.local!.detonationReadyAt).toBe(11000);
    const next = { ...bomb('local'), id: 'next', thrownAt: 10800, explodeAt: 13800 };
    const enemy = { ...bomb('bot-1'), id: 'enemy', thrownAt: 10800, explodeAt: 13800 };
    state.bombs = { next, enemy };
    state.now = 10999;
    expect(detonateLatestBomb(state, 'local')).toBeUndefined();
    expect(next.exploded).toBe(false);
    expect(state.players.local!.detonationReadyAt).toBe(11000);
    expect(detonateLatestBomb(state, 'bot-1')?.id).toBe('enemy');
    expect(next.exploded).toBe(false);
    state.now = 11000;
    expect(detonateLatestBomb(state, 'local')?.id).toBe('next');
    expect(state.players.local!.detonationReadyAt).toBe(16000);
  });

  it('does not consume a detonation cooldown when there is no active owned bomb', () => {
    const state = readyMatch('Player', 1);
    state.bombs = { enemy: { ...bomb('bot-1'), explodeAt: 9000 } };
    expect(detonateLatestBomb(state, 'local')).toBeUndefined();
    expect(state.players.local!.detonationReadyAt).toBe(0);
    const own = { ...bomb('local'), explodeAt: 9000 };
    state.bombs[own.id] = own;
    expect(detonateLatestBomb(state, 'local')?.id).toBe(own.id);
    expect(state.players.local!.detonationReadyAt).toBe(11000);
  });

  it('manual blasts damage opponents while preserving owner immunity', () => {
    const state = readyMatch('Player', 1);
    state.players.local = player();
    state.players['bot-1'] = player('bot-1');
    const latest = { ...bomb('local'), id: 'latest', thrownAt: 5500, explodeAt: 8500 };
    state.bombs = { latest };
    detonateLatestBomb(state, 'local');
    expect(state.players.local.health).toBe(100);
    expect(state.players['bot-1']!.health).toBe(60);
  });
});

describe('start countdown and weapon unlock', () => {
  it('freezes players for three seconds and allows movement before weapons unlock', () => {
    const waiting = createMatch('Player', 1);
    const initial = structuredClone(waiting.players);
    const shooting = {
      ...input,
      movement: { x: 1, y: 0 },
      jump: true,
      throwBomb: true,
      detonateBomb: true,
    };
    stepMatch(waiting, 2999, { local: shooting });
    expect(waiting.status).toBe('waiting');
    expect(waiting.players).toEqual(initial);
    expect(waiting.bombs).toEqual({});
    stepMatch(waiting, 1, { local: shooting });
    expect(waiting.status).toBe('running');
    expect(waiting.players.local!.position.x).toBeGreaterThan(initial.local!.position.x);
    expect(waiting.bombs).toEqual({});
    expect(waiting.players.local!.bombCharges).toEqual([0, 0, 0]);
    for (let i = 0; i < 299; i += 1)
      stepMatch(waiting, 10, { local: { ...input, throwBomb: true } });
    stepMatch(waiting, 9, { local: { ...input, throwBomb: true } });
    expect(waiting.now).toBe(5999);
    expect(waiting.bombs).toEqual({});
    stepMatch(waiting, 1, { local: { ...input, throwBomb: true } });
    expect(Object.values(waiting.bombs).filter((value) => value.ownerId === 'local')).toHaveLength(
      1,
    );
    expect(waiting.players.local!.bombCharges).toEqual([8000, 0, 0]);
  });

  it('makes everyone immune to explosions during the initial countdown', () => {
    const waiting = createMatch('Player', 1);
    waiting.players.local = player();
    waiting.players['bot-1'] = player('bot-1');
    waiting.now = 1000;
    const enemy = bomb('bot-1');
    explodeBomb(waiting, enemy);
    expect(
      Object.values(waiting.players).every((value) => value.health === 100 && value.alive),
    ).toBe(true);
  });
});

describe('rocket flight and running momentum', () => {
  it('flies mostly horizontally during the first quarter-second', () => {
    const owner = player('local', 500, 500);
    const value = tryThrowBomb(owner, 'rocket', 0)!;
    const start = { ...value.position };
    for (let i = 0; i < 15; i += 1) moveBomb(value, 1 / 60, {}, []);
    expect(value.position.x - start.x).toBeGreaterThan(140);
    expect(Math.abs(value.position.y - start.y)).toBeLessThan(10);
    expect(value.velocity.x).toBeGreaterThan(540);
  });

  it('adds running speed after charging and matches the trajectory preview velocity', () => {
    const stationary = bombLaunchVelocity({ x: 1, y: 0 }, 1.6);
    const moving = player();
    moving.velocity.x = GAME_CONFIG.movementSpeed;
    const value = tryThrowBomb(moving, 'moving', 0, 1.6)!;
    expect(value.velocity.x).toBe(stationary.x + GAME_CONFIG.movementSpeed);
    expect(value.velocity.y).toBe(stationary.y);
    expect(value.velocity).toEqual(bombLaunchVelocity(moving.aim, 1.6, moving.velocity));
    moving.velocity.x = -GAME_CONFIG.movementSpeed;
    expect(bombLaunchVelocity(moving.aim, 1.6, moving.velocity).x).toBe(
      stationary.x - GAME_CONFIG.movementSpeed,
    );
  });
});
