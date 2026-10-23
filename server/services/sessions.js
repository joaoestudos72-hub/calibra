import { db } from '../db.js';
import { config } from '../config.js';
import { newToken, sha256, parseCookies } from '../lib/security.js';

export const COOKIE = 'calibra_sid';

export const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, theme: u.theme, notify_days: u.notify_days });

export function createSession(res, userId) {
  const token = newToken();
  const maxAge = config.sessionDays * 86400;
  const expires = new Date(Date.now() + maxAge * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
  setCookie(res, token, maxAge);
}

function setCookie(res, value, maxAge) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (config.cookieSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  setCookie(res, '', 0);
}

export async function authenticate(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  return db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  ).get(sha256(token), new Date().toISOString()) || null;
}

export const purgeExpiredSessions = () =>
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
