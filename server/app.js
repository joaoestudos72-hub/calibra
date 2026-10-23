import { Router, createHandler } from './lib/http.js';
import { buildRouter } from './routes/index.js';
import { authenticate } from './services/sessions.js';

export function buildApp() {
  const router = new Router();
  buildRouter(router);
  return createHandler({ router, authenticate });
}
