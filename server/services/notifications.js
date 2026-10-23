import { db, tx } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../lib/validate.js';
import { today, addDays, diffDays, isDate } from '../lib/dates.js';
import { completeReminder } from './reminders.js';

const OPEN_FINE = ['pendente', 'recurso_indeferido'];

/**
 * Recalcula as notificações do usuário a partir de lembretes, manutenções e multas.
 * - cria avisos quando a data entra na janela de antecedência;
 * - remove avisos pendentes cuja origem mudou ou deixou de existir;
 * - nunca recria avisos já concluídos.
 */
export function syncUser(userId) {
  const t = today();
  const user = db.prepare('SELECT notify_days FROM users WHERE id = ?').get(userId);
  if (!user) return;
  const lead = (own) => own ?? user.notify_days;
  const expected = [];
  const add = (e) => expected.push(e);

  for (const r of db.prepare(
    `SELECT r.*, v.nickname FROM reminders r LEFT JOIN vehicles v ON v.id = r.vehicle_id
     WHERE r.user_id = ? AND r.status = 'active'`).all(userId)) {
    if (diffDays(r.due_date, t) > lead(r.notify_days)) continue;
    add({ type: 'reminder', id: r.id, ref: `date:${r.due_date}`, kind: r.kind === 'wash' ? 'wash' : 'routine',
      title: r.title, message: r.nickname ? `Veículo: ${r.nickname}` : (r.notes || null), due: r.due_date,
      priority: r.priority, vehicle: r.vehicle_id });
  }

  for (const m of db.prepare(
    `SELECT m.*, v.nickname, v.odometer AS v_km FROM maintenances m JOIN vehicles v ON v.id = m.vehicle_id
     WHERE m.user_id = ? AND m.reminder_done = 0 AND (m.next_due_date IS NOT NULL OR m.next_due_km IS NOT NULL)`).all(userId)) {
    if (m.next_due_date && diffDays(m.next_due_date, t) <= lead(m.notify_days)) {
      add({ type: 'maintenance', id: m.id, ref: `date:${m.next_due_date}`, kind: 'maintenance', title: m.title,
        message: `Próxima manutenção do ${m.nickname}`, due: m.next_due_date, priority: 'media', vehicle: m.vehicle_id });
    }
    if (m.next_due_km && m.v_km >= m.next_due_km - config.kmWindow) {
      add({ type: 'maintenance', id: m.id, ref: `km:${m.next_due_km}`, kind: 'maintenance_km', title: m.title,
        message: `${m.nickname} está com ${m.v_km.toLocaleString('pt-BR')} km (meta: ${m.next_due_km.toLocaleString('pt-BR')} km)`,
        due: null, priority: 'media', vehicle: m.vehicle_id });
    }
  }

  for (const f of db.prepare(
    `SELECT f.*, v.nickname FROM fines f JOIN vehicles v ON v.id = f.vehicle_id WHERE f.user_id = ?`).all(userId)) {
    const l = lead(f.notify_days);
    if (f.due_date && OPEN_FINE.includes(f.status) && diffDays(f.due_date, t) <= l) {
      add({ type: 'fine', id: f.id, ref: `due:${f.due_date}`, kind: 'fine_due', title: `Pagar multa: ${f.infraction}`,
        message: f.nickname, due: f.due_date, priority: 'alta', vehicle: f.vehicle_id });
    }
    if (f.appeal_deadline && f.status === 'pendente' && diffDays(f.appeal_deadline, t) <= l) {
      add({ type: 'fine', id: f.id, ref: `appeal:${f.appeal_deadline}`, kind: 'fine_appeal', title: `Prazo de recurso: ${f.infraction}`,
        message: f.nickname, due: f.appeal_deadline, priority: 'alta', vehicle: f.vehicle_id });
    }
  }

  tx(() => {
    const key = (type, id, ref) => `${type}:${id}:${ref}`;
    const want = new Map(expected.map((e) => [key(e.type, e.id, e.ref), e]));
    const have = db.prepare(`SELECT id, source_type, source_id, ref FROM notifications WHERE user_id = ? AND status = 'pending'`).all(userId);
    const haveKeys = new Set();
    const del = db.prepare('DELETE FROM notifications WHERE id = ?');
    for (const n of have) {
      const k = key(n.source_type, n.source_id, n.ref);
      if (want.has(k)) haveKeys.add(k); else del.run(n.id);
    }
    // Remove avisos (de qualquer estado) cuja origem foi excluída
    for (const [type, table] of [['reminder', 'reminders'], ['maintenance', 'maintenances'], ['fine', 'fines']]) {
      db.prepare(`DELETE FROM notifications WHERE user_id = ? AND source_type = ? AND source_id NOT IN (SELECT id FROM ${table} WHERE user_id = ?)`)
        .run(userId, type, userId);
    }
    const ins = db.prepare(
      `INSERT OR IGNORE INTO notifications (user_id, source_type, source_id, ref, kind, title, message, due_date, priority, vehicle_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const upd = db.prepare('UPDATE notifications SET title=?, message=?, priority=?, vehicle_id=? WHERE user_id=? AND source_type=? AND source_id=? AND ref=?');
    for (const [k, e] of want) {
      if (haveKeys.has(k)) upd.run(e.title, e.message, e.priority, e.vehicle, userId, e.type, e.id, e.ref);
      else ins.run(userId, e.type, e.id, e.ref, e.kind, e.title, e.message, e.due, e.priority, e.vehicle);
    }
  });
}

export function syncAll() {
  for (const u of db.prepare('SELECT id FROM users').all()) {
    try { syncUser(u.id); } catch (e) { console.error('[sync]', u.id, e.message); }
  }
}

const stateOf = (n, t) => (n.status === 'done' ? 'done' : n.snoozed_until && n.snoozed_until > t ? 'snoozed' : 'active');

export function listNotifications(userId, state = 'active') {
  syncUser(userId);
  const t = today();
  const rows = db.prepare(
    `SELECT n.*, v.nickname AS vehicle_name FROM notifications n LEFT JOIN vehicles v ON v.id = n.vehicle_id
     WHERE n.user_id = ? ORDER BY COALESCE(n.due_date, '9999-12-31'), n.id`).all(userId);
  const items = rows.map((n) => ({
    ...n, state: stateOf(n, t), days_left: n.due_date ? diffDays(n.due_date, t) : null,
  }));
  const counts = { active: 0, snoozed: 0, done: 0, overdue: 0 };
  for (const n of items) { counts[n.state]++; if (n.state === 'active' && n.days_left !== null && n.days_left < 0) counts.overdue++; }
  let out = state === 'all' ? items : items.filter((n) => n.state === state);
  if (state === 'done') out = out.sort((a, b) => (b.resolved_at || '').localeCompare(a.resolved_at || '')).slice(0, 100);
  return { items: out, counts };
}

function own(userId, id) {
  const n = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(id, userId);
  if (!n) throw new HttpError(404, 'Notificação não encontrada.');
  return n;
}

export function snooze(userId, id, body) {
  const n = own(userId, id);
  if (n.status === 'done') throw new HttpError(409, 'Esta notificação já foi concluída.');
  const t = today();
  let until;
  if (body?.until) {
    if (!isDate(body.until) || body.until <= t || body.until > addDays(t, 365)) throw new HttpError(422, 'Escolha uma data futura (até 1 ano).');
    until = body.until;
  } else {
    const days = Number(body?.days);
    if (!Number.isInteger(days) || days < 1 || days > 90) throw new HttpError(422, 'Informe de 1 a 90 dias.');
    until = addDays(t, days);
  }
  db.prepare('UPDATE notifications SET snoozed_until = ? WHERE id = ?').run(until, id);
  return { ok: true, snoozed_until: until };
}

export function wake(userId, id) {
  own(userId, id);
  db.prepare('UPDATE notifications SET snoozed_until = NULL WHERE id = ?').run(id);
  return { ok: true };
}

export function complete(userId, id) {
  const n = own(userId, id);
  if (n.status === 'done') return { ok: true };
  if (n.source_type === 'reminder') {
    completeReminder(userId, n.source_id); // também marca o aviso como concluído
  } else if (n.source_type === 'maintenance') {
    db.prepare('UPDATE maintenances SET reminder_done = 1 WHERE id = ? AND user_id = ?').run(n.source_id, userId);
  }
  db.prepare(`UPDATE notifications SET status='done', resolved_at=datetime('now') WHERE id = ?`).run(id);
  return { ok: true };
}
