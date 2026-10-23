import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { config } from '../config.js';

export const ENTITY_TABLES = { maintenance: 'maintenances', expense: 'expenses', wash: 'washes', fine: 'fines' };

/** Identifica o tipo real do arquivo pelos primeiros bytes (ignora nome/Content-Type enviados). */
export function detectType(b) {
  if (b.length < 12) return null;
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export const cleanName = (n) =>
  (String(n || 'arquivo').split(/[\\/]/).pop().replace(/[\u0000-\u001F\u007F"<>|*?:]/g, '').trim().slice(0, 120)) || 'arquivo';

export function storeFile(userId, buf, ext) {
  const rel = `${userId}/${randomUUID()}.${ext}`;
  const full = path.join(config.uploadDir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, buf, { flag: 'wx' });
  return rel;
}

export function filePath(stored) {
  const full = path.resolve(config.uploadDir, stored);
  if (!full.startsWith(path.resolve(config.uploadDir) + path.sep)) throw new Error('Caminho inválido');
  return full;
}

/** Remove anexos (arquivos + linhas) de registros que serão excluídos. */
export function purgeAttachments(userId, entityType, ids) {
  if (!ids.length) return;
  const q = `SELECT id, stored_name FROM attachments WHERE user_id = ? AND entity_type = ? AND entity_id IN (${ids.map(() => '?').join(',')})`;
  for (const a of db.prepare(q).all(userId, entityType, ...ids)) {
    try { rmSync(filePath(a.stored_name), { force: true }); } catch { /* arquivo já removido */ }
    db.prepare('DELETE FROM attachments WHERE id = ?').run(a.id);
  }
}

export function purgeUserFiles(userId) {
  const dir = path.join(config.uploadDir, String(userId));
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

export const userUsage = (userId) =>
  db.prepare('SELECT COALESCE(SUM(size),0) AS s FROM attachments WHERE user_id = ?').get(userId).s;
