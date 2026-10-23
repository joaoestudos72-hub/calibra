import { db, tx } from '../db.js';
import { HttpError, validate, invalid } from './validate.js';
import { idParam } from './http.js';
import { purgeAttachments } from '../services/files.js';

const esc = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * Fábrica de CRUD. Cada recurso declara seus campos (validação) e o resto é padronizado:
 * isolamento por user_id, busca, filtros, período, soma, anexos e verificação de posse de referências.
 */
export function defineResource(def) {
  const { table, fields, search = [], filters = [], dateField, sumField, order, entity,
    extraSelect = '', joinVehicle = true, before, after, beforeDelete, uniqueMessage } = def;
  const moneyCols = Object.keys(fields).filter((c) => fields[c].type === 'money');

  const FROM = `FROM ${table} t ${joinVehicle ? 'LEFT JOIN vehicles v ON v.id = t.vehicle_id' : ''}`;
  const SELECT = `SELECT t.*${joinVehicle ? ', v.nickname AS vehicle_name, v.plate AS vehicle_plate' : ''}${extraSelect ? ', ' + extraSelect : ''}` +
    (entity ? `, (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = '${entity}' AND a.entity_id = t.id) AS attachment_count` : '');

  const out = (row) => {
    if (!row) return row;
    const r = { ...row };
    for (const c of moneyCols) if (r[c] !== null && r[c] !== undefined) r[c] = r[c] / 100;
    return r;
  };

  function filterSql(userId, q) {
    const where = ['t.user_id = ?']; const args = [userId];
    for (const f of filters) {
      const v = q[f];
      if (v === undefined || v === '') continue;
      where.push(`t.${f} = ?`);
      args.push(['id', 'int'].includes(fields[f]?.type) ? Number(v) : v);
    }
    if (q.q?.trim()) {
      const cols = search.map((c) => `t.${c}`).concat(joinVehicle ? ['v.nickname', 'v.plate'] : []);
      where.push('(' + cols.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')');
      cols.forEach(() => args.push(`%${esc(q.q.trim().slice(0, 80))}%`));
    }
    if (dateField && /^\d{4}-\d{2}-\d{2}$/.test(q.from || '')) { where.push(`t.${dateField} >= ?`); args.push(q.from); }
    if (dateField && /^\d{4}-\d{2}-\d{2}$/.test(q.to || '')) { where.push(`t.${dateField} <= ?`); args.push(q.to); }
    return { where: where.join(' AND '), args };
  }

  const raw = (userId, id) => db.prepare(`SELECT t.* FROM ${table} t WHERE t.id = ? AND t.user_id = ?`).get(id, userId);
  const one = (userId, id) => {
    const row = db.prepare(`${SELECT} ${FROM} WHERE t.id = ? AND t.user_id = ?`).get(id, userId);
    if (!row) throw new HttpError(404, 'Registro não encontrado.');
    return out(row);
  };

  function prepare(userId, body, existing) {
    const { data, errors } = validate(fields, body);
    for (const [name, f] of Object.entries(fields)) {
      if (f.type === 'id' && f.ref && data[name] != null && !errors[name]) {
        const ok = db.prepare(`SELECT 1 FROM ${f.ref} WHERE id = ? AND user_id = ?`).get(data[name], userId);
        if (!ok) errors[name] = 'Registro não encontrado.';
      }
    }
    if (before) before(data, { userId, existing, errors });
    if (Object.keys(errors).length) throw invalid(errors);
    return data;
  }

  function guard(fn) {
    try { return fn(); } catch (e) {
      if (e instanceof HttpError) throw e;
      if (/UNIQUE constraint/.test(e.message)) throw new HttpError(409, uniqueMessage || 'Já existe um registro com estes dados.');
      if (/FOREIGN KEY/.test(e.message)) throw new HttpError(422, 'Referência inválida.');
      throw e;
    }
  }

  const api = {
    list(userId, q) {
      const { where, args } = filterSql(userId, q);
      const limit = clamp(parseInt(q.limit) || 50, 1, 200), offset = Math.max(parseInt(q.offset) || 0, 0);
      const items = db.prepare(`${SELECT} ${FROM} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, offset).map(out);
      const agg = db.prepare(`SELECT COUNT(*) AS c${sumField ? `, COALESCE(SUM(t.${sumField}), 0) AS s` : ''} ${FROM} WHERE ${where}`).get(...args);
      return { items, total: agg.c, sum: sumField ? agg.s / 100 : undefined };
    },
    get: one,
    create(userId, body) {
      const data = prepare(userId, body, null);
      const keys = Object.keys(data);
      const id = guard(() => tx(() => {
        const r = db.prepare(`INSERT INTO ${table} (user_id, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')})`)
          .run(userId, ...keys.map((k) => data[k]));
        const newId = Number(r.lastInsertRowid);
        after?.(userId, newId, data, null);
        return newId;
      }));
      return one(userId, id);
    },
    update(userId, id, body) {
      const existing = raw(userId, id);
      if (!existing) throw new HttpError(404, 'Registro não encontrado.');
      const data = prepare(userId, body, existing);
      const keys = Object.keys(data);
      guard(() => tx(() => {
        db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
          .run(...keys.map((k) => data[k]), id, userId);
        after?.(userId, id, data, existing);
      }));
      return one(userId, id);
    },
    remove(userId, id) {
      if (!raw(userId, id)) throw new HttpError(404, 'Registro não encontrado.');
      tx(() => {
        beforeDelete?.(userId, id);
        if (entity) purgeAttachments(userId, entity, [id]);
        db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(id, userId);
      });
    },
  };

  api.register = (router, path) => {
    router.get(path, ({ user, query }) => api.list(user.id, query));
    router.post(path, async ({ user, body }) => api.create(user.id, await body()));
    router.get(`${path}/:id`, ({ user, params }) => api.get(user.id, idParam(params.id)));
    router.put(`${path}/:id`, async ({ user, params, body }) => api.update(user.id, idParam(params.id), await body()));
    router.del(`${path}/:id`, ({ user, params }) => { api.remove(user.id, idParam(params.id)); });
  };
  return api;
}
