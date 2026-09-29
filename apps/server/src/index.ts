import { Server } from 'colyseus';
import { createServer } from 'node:http';
import { ArenaRoom } from './rooms/ArenaRoom.js';
const port = Number(process.env.PORT ?? 2567);
const gameServer = new Server({ server: createServer() });
gameServer.define('arena', ArenaRoom);
gameServer
  .listen(port)
  .then(() =>
    console.info(`Future Colyseus scaffold listening on :${port}; local client is not connected.`),
  );
