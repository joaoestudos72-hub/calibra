import http from 'node:http';
import { config } from './config.js';
import './db.js';
import { buildApp } from './app.js';
import { syncAll } from './services/notifications.js';
import { purgeExpiredSessions } from './services/sessions.js';

const server = http.createServer(buildApp());
server.requestTimeout = 60_000;
server.headersTimeout = 20_000;

// Tarefa periódica: gera notificações para todos os usuários e limpa sessões vencidas.
const job = () => { try { purgeExpiredSessions(); syncAll(); } catch (e) { console.error('[job]', e); } };
job();
setInterval(job, 30 * 60_000).unref();

server.listen(config.port, config.host, () => console.log(`Calibra rodando em http://localhost:${config.port}`));

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
