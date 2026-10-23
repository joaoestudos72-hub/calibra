import { db } from '../db.js';
import { today, diffDays, addDays } from '../lib/dates.js';
import { syncUser, listNotifications } from './notifications.js';

const KINDS = ['maintenance', 'expenses', 'washes', 'fines'];

// Todos os gastos do usuário num formato único: (veículo, data, tipo, centavos)
const SPEND_CTE = `WITH s(vehicle_id, d, kind, cents) AS (
  SELECT vehicle_id, service_date, 'maintenance', cost FROM maintenances WHERE user_id = ?
  UNION ALL SELECT vehicle_id, expense_date, 'expenses', amount FROM expenses WHERE user_id = ?
  UNION ALL SELECT vehicle_id, wash_date, 'washes', cost FROM washes WHERE user_id = ?
  UNION ALL SELECT vehicle_id, COALESCE(paid_date, due_date, fine_date), 'fines', amount FROM fines WHERE user_id = ? AND status = 'paga'
)`;

function monthsBack(t, n) {
  const [y, m] = t.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

export function spending(userId, vehicleId = null) {
  const t = today();
  const months = monthsBack(t, 6);
  const rows = db.prepare(`${SPEND_CTE} SELECT substr(d,1,7) AS ym, kind, SUM(cents) AS total FROM s
    WHERE d >= ? ${vehicleId ? 'AND vehicle_id = ?' : ''} GROUP BY ym, kind`)
    .all(userId, userId, userId, userId, `${months[0]}-01`, ...(vehicleId ? [vehicleId] : []));
  const by_month = months.map((month) => {
    const e = { month, total: 0 };
    for (const k of KINDS) e[k] = 0;
    for (const r of rows) if (r.ym === month) { e[r.kind] = r.total / 100; e.total += r.total / 100; }
    return e;
  });
  const cur = by_month[by_month.length - 1], prev = by_month[by_month.length - 2];
  const year = db.prepare(`${SPEND_CTE} SELECT COALESCE(SUM(cents),0) AS t FROM s WHERE substr(d,1,4) = ? ${vehicleId ? 'AND vehicle_id = ?' : ''}`)
    .get(userId, userId, userId, userId, t.slice(0, 4), ...(vehicleId ? [vehicleId] : [])).t / 100;
  return { by_month, month_total: cur.total, prev_month_total: prev.total, year_total: year };
}

export function vehicleHistory(userId, vehicleId) {
  return db.prepare(`
    SELECT * FROM (
      SELECT 'maintenance' AS type, id, service_date AS date, title, workshop AS detail, cost / 100.0 AS amount, odometer FROM maintenances WHERE user_id = ?1 AND vehicle_id = ?2
      UNION ALL SELECT 'expense', id, expense_date, COALESCE(NULLIF(description,''), category), category, amount / 100.0, odometer FROM expenses WHERE user_id = ?1 AND vehicle_id = ?2
      UNION ALL SELECT 'wash', id, wash_date, 'Lavagem ' || kind, place, cost / 100.0, NULL FROM washes WHERE user_id = ?1 AND vehicle_id = ?2
      UNION ALL SELECT 'fine', id, fine_date, infraction, status, amount / 100.0, NULL FROM fines WHERE user_id = ?1 AND vehicle_id = ?2
    ) ORDER BY date DESC, id DESC LIMIT 100`).all(userId, vehicleId);
}

export function dashboard(userId) {
  syncUser(userId);
  const t = today();
  const horizon = addDays(t, 30);

  const vehicles = db.prepare(
    `SELECT v.*,
      (SELECT COUNT(*) FROM fines f WHERE f.vehicle_id = v.id AND f.status IN ('pendente','em_recurso','recurso_indeferido')) AS open_fines,
      (SELECT MAX(wash_date) FROM washes w WHERE w.vehicle_id = v.id) AS last_wash,
      (SELECT MAX(service_date) FROM maintenances m WHERE m.vehicle_id = v.id) AS last_maintenance
     FROM vehicles v WHERE v.user_id = ? ORDER BY v.nickname COLLATE NOCASE`).all(userId);

  // Próximos prazos: lembretes, manutenções e multas (atrasados + próximos 30 dias)
  const up = [];
  const add = (kind, id, title, due, vehicle_name, priority = 'media') => {
    if (due && due <= horizon) up.push({ kind, id, title, due_date: due, days_left: diffDays(due, t), vehicle_name, priority });
  };
  for (const r of db.prepare(`SELECT r.id, r.kind, r.title, r.due_date, r.priority, v.nickname FROM reminders r LEFT JOIN vehicles v ON v.id = r.vehicle_id WHERE r.user_id = ? AND r.status = 'active'`).all(userId))
    add(r.kind === 'wash' ? 'wash' : 'routine', r.id, r.title, r.due_date, r.nickname, r.priority);
  for (const m of db.prepare(`SELECT m.id, m.title, m.next_due_date, v.nickname FROM maintenances m JOIN vehicles v ON v.id = m.vehicle_id WHERE m.user_id = ? AND m.reminder_done = 0 AND m.next_due_date IS NOT NULL`).all(userId))
    add('maintenance', m.id, m.title, m.next_due_date, m.nickname);
  for (const f of db.prepare(`SELECT f.*, v.nickname FROM fines f JOIN vehicles v ON v.id = f.vehicle_id WHERE f.user_id = ?`).all(userId)) {
    if (['pendente', 'recurso_indeferido'].includes(f.status)) add('fine_due', f.id, `Pagar multa: ${f.infraction}`, f.due_date, f.nickname, 'alta');
    if (f.status === 'pendente') add('fine_appeal', f.id, `Recurso: ${f.infraction}`, f.appeal_deadline, f.nickname, 'alta');
  }
  up.sort((a, b) => a.due_date.localeCompare(b.due_date));

  const fines = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM fines WHERE user_id = ? AND status IN ('pendente','em_recurso','recurso_indeferido')`).get(userId);
  const notes = listNotifications(userId, 'active');

  return {
    vehicles,
    upcoming: up.slice(0, 8),
    pending: {
      overdue: up.filter((u) => u.days_left < 0).length,
      next_7_days: up.filter((u) => u.days_left >= 0 && u.days_left <= 7).length,
      open_fines: fines.c, open_fines_amount: fines.s / 100,
    },
    notifications: { items: notes.items.slice(0, 5), counts: notes.counts },
    spending: spending(userId),
  };
}
