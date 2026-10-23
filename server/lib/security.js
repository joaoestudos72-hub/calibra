import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from './validate.js';

const scryptAsync = promisify(scrypt);
const N = 16384, R = 8, P = 1, KEYLEN = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [alg, n, r, p, salt, hash] = stored.split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64');
    const key = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +r, p: +p });
    return timingSafeEqual(key, expected);
  } catch { return false; }
}

export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Limitador simples em memória (suficiente para uma instância; use Redis se escalar horizontalmente).
const hits = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || rec.reset < now) { hits.set(key, { count: 1, reset: now + windowMs }); return; }
  if (++rec.count > max) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
}
export const clearRateLimit = (key) => hits.delete(key);
setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (v.reset < n) hits.delete(k); }, 600000).unref();
