import { db, tx } from '../db.js';
import { config } from '../config.js';
import { HttpError, validate, invalid } from '../lib/validate.js';
import { hashPassword, verifyPassword, rateLimit, clearRateLimit } from '../lib/security.js';
import { createSession, destroySession, publicUser } from '../services/sessions.js';
import { purgeUserFiles } from '../services/files.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

function checkPassword(pw, errors, field = 'password') {
  if (typeof pw !== 'string' || pw.length < 8) errors[field] = 'Use pelo menos 8 caracteres.';
  else if (pw.length > 128) errors[field] = 'Use no máximo 128 caracteres.';
  else if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) errors[field] = 'Combine letras e números.';
}

export function register(router) {
  router.post('/api/auth/register', async ({ body, res, ip }) => {
    if (!config.allowRegistration) throw new HttpError(403, 'Cadastros estão desativados.');
    rateLimit(`reg:${ip}`, 10, 3600_000);
    const b = await body();
    const { data, errors } = validate({ name: { type: 'string', required: true, max: 80 } }, b);
    const email = String(b.email || '').trim().toLowerCase();
    if (!EMAIL.test(email)) errors.email = 'Informe um e-mail válido.';
    checkPassword(b.password, errors);
    if (Object.keys(errors).length) throw invalid(errors);
    const hash = await hashPassword(b.password);
    let user;
    try {
      const r = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(data.name, email, hash);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid));
    } catch (e) {
      if (/UNIQUE/.test(e.message)) throw invalid({ email: 'Este e-mail já está cadastrado.' });
      throw e;
    }
    createSession(res, user.id);
    return { user: publicUser(user) };
  }, { public: true });

  router.post('/api/auth/login', async ({ body, res, ip }) => {
    const b = await body();
    const email = String(b.email || '').trim().toLowerCase();
    const key = `login:${ip}:${email}`;
    rateLimit(key, 8, 15 * 60_000);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const ok = await verifyPassword(String(b.password || ''), user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'E-mail ou senha incorretos.');
    clearRateLimit(key);
    createSession(res, user.id);
    return { user: publicUser(user) };
  }, { public: true });

  router.post('/api/auth/logout', ({ req, res }) => { destroySession(req, res); }, { public: true });
  router.get('/api/auth/me', ({ user }) => ({ user: user ? publicUser(user) : null }), { public: true });

  router.put('/api/auth/profile', async ({ user, body }) => {
    const { data, errors } = validate({
      name: { type: 'string', required: true, max: 80 },
      theme: { type: 'enum', values: ['system', 'light', 'dark'], default: 'system' },
      notify_days: { type: 'int', min: 0, max: 90, default: 3 },
    }, await body());
    if (Object.keys(errors).length) throw invalid(errors);
    db.prepare('UPDATE users SET name = ?, theme = ?, notify_days = ? WHERE id = ?').run(data.name, data.theme, data.notify_days, user.id);
    return { user: publicUser({ ...user, ...data }) };
  });

  router.put('/api/auth/password', async ({ user, body, req, res }) => {
    const b = await body();
    const errors = {};
    if (!(await verifyPassword(String(b.current || ''), user.password_hash))) errors.current = 'Senha atual incorreta.';
    checkPassword(b.next, errors, 'next');
    if (Object.keys(errors).length) throw invalid(errors);
    const hash = await hashPassword(b.next);
    tx(() => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id); // força novo login em todos os dispositivos
    });
    destroySession(req, res);
    return { ok: true };
  });

  router.get('/api/auth/export', ({ user, res }) => {
    const dump = { exported_at: new Date().toISOString(), user: publicUser(user) };
    for (const t of ['vehicles', 'maintenances', 'expenses', 'washes', 'fines', 'reminders', 'notifications']) {
      dump[t] = db.prepare(`SELECT * FROM ${t} WHERE user_id = ?`).all(user.id);
    }
    dump.attachments = db.prepare('SELECT id, entity_type, entity_id, original_name, mime, size, created_at FROM attachments WHERE user_id = ?').all(user.id);
    res.setHeader('Content-Disposition', 'attachment; filename="calibra-meus-dados.json"');
    return dump;
  });

  router.del('/api/auth/account', async ({ user, body, req, res }) => {
    const b = await body();
    if (!(await verifyPassword(String(b.password || ''), user.password_hash))) throw invalid({ password: 'Senha incorreta.' });
    purgeUserFiles(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id); // cascata remove todo o resto
    destroySession(req, res);
  });
}
