import { Schema, MapSchema, type } from '@colyseus/schema';

export class PlayerSchema extends Schema {
  @type('string') displayName = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('boolean') alive = true;
}
export class MatchSchema extends Schema {
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type('string') status = 'waiting';
  @type('number') serverTime = 0;
}
