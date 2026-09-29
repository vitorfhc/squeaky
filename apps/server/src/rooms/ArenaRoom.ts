import { Room, type Client } from 'colyseus';
import { GAME_CONFIG, type PlayerInput } from '@squeaky/shared';
import { MatchSchema } from '../schema/MatchSchema.js';

/**
 * Future authoritative boundary only. Before public multiplayer, this room must own
 * movement validation, bomb collision/fuses, zone progression, damage, and results.
 */
export class ArenaRoom extends Room<MatchSchema> {
  maxClients = GAME_CONFIG.maxPlayers;
  onCreate(): void {
    this.setState(new MatchSchema());
    this.onMessage('input', (_client: Client, _input: PlayerInput) => {
      // Intentionally not simulated: input sequencing/validation belongs here later.
    });
  }
  onJoin(client: Client): void {
    console.info(`Future room join: ${client.sessionId}`);
  }
  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
  }
}
