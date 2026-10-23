import { db, tx } from '../db.js';
import { HttpError } from '../lib/validate.js';
import { today, advance } from '../lib/dates.js';

/** Conclui um lembrete: recorrente avança para a próxima data; avulso vira "done". */
export function completeReminder(userId, id) {
  return tx(() => {
    const r = db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?').get(id, userId);
    if (!r) throw new HttpError(404, 'Lembrete não encontrado.');
    if (r.status === 'done') return r;
    db.prepare(`UPDATE notifications SET status='done', resolved_at=datetime('now')
                WHERE user_id=? AND source_type='reminder' AND source_id=? AND status='pending'`).run(userId, id);
    let next = advance(r.due_date, r.recurrence, r.recurrence_interval);
    if (next) {
      const t = today();
      while (next < t) next = advance(next, r.recurrence, r.recurrence_interval);
      db.prepare(`UPDATE reminders SET due_date=?, updated_at=datetime('now') WHERE id=?`).run(next, id);
    } else {
      db.prepare(`UPDATE reminders SET status='done', updated_at=datetime('now') WHERE id=?`).run(id);
    }
    return db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
  });
}
