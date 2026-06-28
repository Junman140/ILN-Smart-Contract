import { createServer } from 'node:http';
import { config } from './config.js';
import { getDb } from './database/db.js';
import { createApp } from './app.js';
import { EventWebSocketEndpoint } from './api/websocket.js';

const db = getDb(config.dbPath);
const app = createApp(db);

const httpServer = createServer(app);
const wsEndpoint = new EventWebSocketEndpoint({ server: httpServer, path: '/events' });
wsEndpoint.start();

httpServer.listen(config.port, () => {
  console.log(`ILN Indexer API running on port ${config.port} (HTTP + WebSocket /events)`);
});

export { wsEndpoint };
