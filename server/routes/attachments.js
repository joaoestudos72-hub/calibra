import { createReadStream } from 'node:fs';
import { rmSync } from 'node:fs';
import { db } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../lib/validate.js';
import { HANDLED, idParam } from '../lib/http.js';
import { readMultipart } from '../lib/multipart.js';
import { ENTITY_TABLES, detectType, cleanName, storeFile, filePath, userUsage } from '../services/files.js';

const MAX_PER_ENTITY = 10;
const pub = (a) => ({ id: a.id, original_name: a.original_name, mime: a.mime, size: a.size, created_at: a.created_at });

function assertEntity(userId, type, id) {
  const table = ENTITY_TABLES[type];
  if (!table || !Number.isInteger(id) || id < 1) throw new HttpError(422, 'Registro inválido para anexo.');
  if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND user_id = ?`).get(id, userId)) throw new HttpError(404, 'Registro não encontrado.');
}

export function register(router) {
  router.get('/api/attachments', ({ user, query }) => {
    assertEntity(user.id, query.entity_type, Number(query.entity_id));
    return { items: db.prepare('SELECT * FROM attachments WHERE user_id = ? AND entity_type = ? AND entity_id = ? ORDER BY id')
      .all(user.id, query.entity_type, Number(query.entity_id)).map(pub) };
  });

  router.post('/api/attachments', async ({ user, req }) => {
    const { fields, file } = await readMultipart(req, config.maxUploadBytes);
    const entityId = Number(fields.entity_id);
    assertEntity(user.id, fields.entity_type, entityId);
    if (!file) throw new HttpError(422, 'Selecione um arquivo.');
    if (file.data.length > config.maxUploadBytes) throw new HttpError(413, `O arquivo excede ${config.maxUploadBytes / 1048576} MB.`);
    const type = detectType(file.data);
    if (!type) throw new HttpError(415, 'Formato não aceito. Envie PDF, JPG, PNG ou WebP.');
    const count = db.prepare('SELECT COUNT(*) AS c FROM attachments WHERE user_id = ? AND entity_type = ? AND entity_id = ?').get(user.id, fields.entity_type, entityId).c;
    if (count >= MAX_PER_ENTITY) throw new HttpError(422, `Limite de ${MAX_PER_ENTITY} anexos por registro.`);
    if (userUsage(user.id) + file.data.length > config.userQuotaBytes) throw new HttpError(413, 'Limite de armazenamento da conta atingido.');

    const stored = storeFile(user.id, file.data, type.ext);
    try {
      const r = db.prepare(`INSERT INTO attachments (user_id, entity_type, entity_id, original_name, stored_name, mime, size)
                            VALUES (?, ?, ?, ?, ?, ?, ?)`).run(user.id, fields.entity_type, entityId, cleanName(file.filename), stored, type.mime, file.data.length);
      return pub(db.prepare('SELECT * FROM attachments WHERE id = ?').get(Number(r.lastInsertRowid)));
    } catch (e) { rmSync(filePath(stored), { force: true }); throw e; }
  });

  router.get('/api/attachments/:id/file', ({ user, params, query, res }) => {
    const a = db.prepare('SELECT * FROM attachments WHERE id = ? AND user_id = ?').get(idParam(params.id), user.id);
    if (!a) throw new HttpError(404, 'Anexo não encontrado.');
    const disp = query.download ? 'attachment' : 'inline';
    res.writeHead(200, {
      'Content-Type': a.mime, 'Content-Length': a.size,
      'Content-Disposition': `${disp}; filename*=UTF-8''${encodeURIComponent(a.original_name)}`,
      'Cache-Control': 'private, max-age=300',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    });
    const stream = createReadStream(filePath(a.stored_name));
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    return HANDLED;
  });

  router.del('/api/attachments/:id', ({ user, params }) => {
    const a = db.prepare('SELECT * FROM attachments WHERE id = ? AND user_id = ?').get(idParam(params.id), user.id);
    if (!a) throw new HttpError(404, 'Anexo não encontrado.');
    db.prepare('DELETE FROM attachments WHERE id = ?').run(a.id);
    rmSync(filePath(a.stored_name), { force: true });
  });
}
