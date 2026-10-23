import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { HttpError } from './validate.js';

export const HANDLED = Symbol('handled');

export class Router {
  routes = [];
  add(method, pattern, handler, opts = {}) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handler, opts });
  }
  get(p, h, o) { this.add('GET', p, h, o); }
  post(p, h, o) { this.add('POST', p, h, o); }
  put(p, h, o) { this.add('PUT', p, h, o); }
  del(p, h, o) { this.add('DELETE', p, h, o); }
  find(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
    return { pathMatched };
  }
}

export function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(status === 204 ? undefined : payload);
}

export async function readJson(req, limit = 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'Requisição muito grande.');
    chunks.push(c);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'JSON inválido.'); }
}

export const idParam = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Registro não encontrado.');
  return n;
};

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (config.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método não permitido.');
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { throw new HttpError(400, 'URL inválida.'); }
  if (rel.endsWith('/')) rel += 'index.html';
  let full = path.normalize(path.join(config.publicDir, rel));
  if (!full.startsWith(config.publicDir + path.sep)) throw new HttpError(403, 'Acesso negado.');
  let st = await stat(full).catch(() => null);
  if (!st?.isFile()) {
    if (path.extname(rel)) throw new HttpError(404, 'Não encontrado.');
    full = path.join(config.publicDir, 'index.html'); // fallback da SPA
    st = await stat(full);
  }
  const etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}"`;
  if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
    'Content-Length': st.size, ETag: etag, 'Cache-Control': 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(full).pipe(res);
}

/** Monta o handler HTTP. `authenticate(req)` devolve o usuário (ou null). */
export function createHandler({ router, authenticate }) {
  return async (req, res) => {
    try {
      securityHeaders(res);
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) return await serveStatic(req, res, url.pathname);

      res.setHeader('Cache-Control', 'no-store');
      const { route, params, pathMatched } = router.find(req.method, url.pathname);
      if (!route) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Método não permitido.' : 'Rota não encontrada.');

      // Defesa CSRF: mutações exigem cabeçalho customizado e Origin coerente
      if (!['GET', 'HEAD'].includes(req.method)) {
        const origin = req.headers.origin;
        if (req.headers['x-requested-with'] !== 'calibra') throw new HttpError(403, 'Requisição não autorizada.');
        if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Origem não autorizada.');
      }

      const user = await authenticate(req);
      if (!route.opts.public && !user) throw new HttpError(401, 'Sessão expirada. Entre novamente.');

      const ip = config.trustProxy ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
      const ctx = {
        req, res, params, user, ip,
        query: Object.fromEntries(url.searchParams),
        body: () => readJson(req),
      };
      const result = await route.handler(ctx);
      if (result === HANDLED) return;
      if (result === undefined) return send(res, 204);
      send(res, 200, result);
    } catch (e) {
      if (res.headersSent) return res.destroy();
      if (e instanceof HttpError) {
        if (e.status === 413) res.setHeader('Connection', 'close');
        return send(res, e.status, { error: e.message, details: e.details });
      }
      console.error('[erro]', req.method, req.url, e);
      send(res, 500, { error: 'Erro interno. Tente novamente em instantes.' });
    }
  };
}
