import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');

/** Executa fn dentro de uma transação (rollback em caso de erro). */
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Migrações sequenciais. Para evoluir o banco, adicione um novo item ao final.
const MIGRATIONS = [`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'system',
  notify_days INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE vehicles (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  plate TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  type TEXT NOT NULL,
  odometer INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, plate)
);

CREATE TABLE maintenances (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  service_date TEXT NOT NULL,
  odometer INTEGER,
  cost INTEGER NOT NULL DEFAULT 0,
  workshop TEXT,
  description TEXT,
  next_due_date TEXT,
  next_due_km INTEGER,
  notify_days INTEGER,
  reminder_done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_maint_user_vehicle ON maintenances(user_id, vehicle_id, service_date);

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  expense_date TEXT NOT NULL,
  odometer INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_exp_user_vehicle ON expenses(user_id, vehicle_id, expense_date);

CREATE TABLE washes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  wash_date TEXT NOT NULL,
  kind TEXT NOT NULL,
  place TEXT,
  cost INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_wash_user_vehicle ON washes(user_id, vehicle_id, wash_date);

CREATE TABLE fines (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  fine_date TEXT NOT NULL,
  location TEXT,
  infraction TEXT NOT NULL,
  ticket_number TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  appeal_deadline TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  paid_date TEXT,
  notes TEXT,
  notify_days INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_fines_user_vehicle ON fines(user_id, vehicle_id, fine_date);

CREATE TABLE reminders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  priority TEXT NOT NULL DEFAULT 'media',
  due_date TEXT NOT NULL,
  recurrence TEXT NOT NULL DEFAULT 'none',
  recurrence_interval INTEGER NOT NULL DEFAULT 1,
  notify_days INTEGER,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_rem_user ON reminders(user_id, kind, status, due_date);

CREATE TABLE attachments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_att_entity ON attachments(user_id, entity_type, entity_id);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  ref TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'media',
  vehicle_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  snoozed_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  UNIQUE (user_id, source_type, source_id, ref)
);
CREATE INDEX idx_notif_user ON notifications(user_id, status);
`];

const current = db.prepare('PRAGMA user_version').get().user_version;
for (let v = current; v < MIGRATIONS.length; v++) {
  tx(() => { db.exec(MIGRATIONS[v]); db.exec(`PRAGMA user_version = ${v + 1}`); });
}
