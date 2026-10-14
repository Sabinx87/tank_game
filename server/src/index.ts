import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import type { IO } from './io';
import { RoomManager } from './RoomManager';
import { registerSocketHandlers } from './socketHandlers';

export function createGameServer() {
  const app = express();
  const httpServer = createServer(app);
  const io: IO = new Server(httpServer, {
    // In dev the Vite server proxies /socket.io, so same-origin is enough.
    cors: process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(',') } : undefined,
  });
  const rooms = new RoomManager(io);
  registerSocketHandlers(io, rooms);

  app.get('/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  // Production: serve the built client from the same origin.
  const clientDist = process.env.CLIENT_DIST ?? path.resolve(__dirname, '../../client/dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/socket\.io).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  return { app, httpServer, io, rooms };
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 3000);
  const { httpServer, io, rooms } = createGameServer();
  httpServer.listen(port, () => {
    console.log(`Tank server listening on http://localhost:${port}`);
  });
  const shutdown = () => {
    rooms.closeAll();
    io.close();
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
