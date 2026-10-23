import { db } from '../db.js';
import { defineResource } from '../lib/resource.js';
import { today } from '../lib/dates.js';
import { purgeAttachments } from '../services/files.js';

export const VEHICLE_TYPES = ['carro', 'moto', 'caminhonete', 'van', 'caminhao', 'outro'];
const MAINT_CATS = ['revisao', 'oleo', 'pneus', 'freios', 'suspensao', 'eletrica', 'bateria', 'funilaria', 'outros'];
const EXP_CATS = ['combustivel', 'seguro', 'ipva', 'licenciamento', 'estacionamento', 'pedagio', 'acessorios', 'outros'];
const WASH_KINDS = ['simples', 'completa', 'interna', 'a_seco', 'polimento'];
const FINE_STATUS = ['pendente', 'paga', 'em_recurso', 'recurso_deferido', 'recurso_indeferido', 'cancelada'];
const ROUTINE_CATS = ['saude', 'financas', 'casa', 'trabalho', 'estudos', 'pessoal', 'outros'];
const RECURRENCE = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

const bumpOdometer = (userId, vehicleId, km) => {
  if (km != null) db.prepare('UPDATE vehicles SET odometer = ? WHERE id = ? AND user_id = ? AND odometer < ?').run(km, vehicleId, userId, km);
};

export const vehicles = defineResource({
  table: 'vehicles', joinVehicle: false,
  fields: {
    nickname: { type: 'string', required: true, max: 60 },
    plate: { type: 'plate', required: true },
    model: { type: 'string', required: true, max: 80 },
    year: { type: 'int', required: true, min: 1950, max: new Date().getFullYear() + 1 },
    type: { type: 'enum', required: true, values: VEHICLE_TYPES },
    odometer: { type: 'int', default: 0, max: 9999999 },
  },
  search: ['nickname', 'plate', 'model'],
  order: 't.nickname COLLATE NOCASE',
  uniqueMessage: 'Você já cadastrou um veículo com esta placa.',
  extraSelect: `
    (SELECT COUNT(*) FROM fines f WHERE f.vehicle_id = t.id AND f.status IN ('pendente','em_recurso','recurso_indeferido')) AS open_fines,
    (SELECT MAX(wash_date) FROM washes w WHERE w.vehicle_id = t.id) AS last_wash,
    (SELECT MAX(service_date) FROM maintenances m WHERE m.vehicle_id = t.id) AS last_maintenance`,
  beforeDelete(userId, id) {
    for (const [type, table] of [['maintenance', 'maintenances'], ['expense', 'expenses'], ['wash', 'washes'], ['fine', 'fines']]) {
      const ids = db.prepare(`SELECT id FROM ${table} WHERE vehicle_id = ? AND user_id = ?`).all(id, userId).map((r) => r.id);
      purgeAttachments(userId, type, ids);
    }
  },
});

export const maintenances = defineResource({
  table: 'maintenances', entity: 'maintenance', sumField: 'cost', dateField: 'service_date',
  fields: {
    vehicle_id: { type: 'id', ref: 'vehicles', required: true },
    title: { type: 'string', required: true, max: 120 },
    category: { type: 'enum', required: true, values: MAINT_CATS },
    service_date: { type: 'date', required: true },
    odometer: { type: 'int', max: 9999999 },
    cost: { type: 'money', default: 0 },
    workshop: { type: 'string', max: 120 },
    description: { type: 'text' },
    next_due_date: { type: 'date' },
    next_due_km: { type: 'int', max: 9999999 },
    notify_days: { type: 'int', max: 90 },
  },
  search: ['title', 'workshop', 'description'], filters: ['vehicle_id', 'category'],
  order: 't.service_date DESC, t.id DESC',
  before(data, { existing }) {
    // Mudou a meta de data/km? Reativa o lembrete.
    const changed = !existing || existing.next_due_date !== data.next_due_date || existing.next_due_km !== data.next_due_km;
    data.reminder_done = changed ? 0 : existing.reminder_done;
  },
  after(userId, id, data) {
    bumpOdometer(userId, data.vehicle_id, data.odometer);
    // Um novo serviço da mesma categoria encerra os lembretes anteriores dessa categoria
    if (data.category !== 'outros') {
      db.prepare(`UPDATE maintenances SET reminder_done = 1 WHERE user_id = ? AND vehicle_id = ? AND category = ?
                  AND id <> ? AND reminder_done = 0 AND service_date <= ?`).run(userId, data.vehicle_id, data.category, id, data.service_date);
    }
  },
});

export const expenses = defineResource({
  table: 'expenses', entity: 'expense', sumField: 'amount', dateField: 'expense_date',
  fields: {
    vehicle_id: { type: 'id', ref: 'vehicles', required: true },
    category: { type: 'enum', required: true, values: EXP_CATS },
    description: { type: 'string', max: 160 },
    amount: { type: 'money', required: true },
    expense_date: { type: 'date', required: true },
    odometer: { type: 'int', max: 9999999 },
  },
  search: ['description'], filters: ['vehicle_id', 'category'],
  order: 't.expense_date DESC, t.id DESC',
  after: (userId, id, d) => bumpOdometer(userId, d.vehicle_id, d.odometer),
});

export const washes = defineResource({
  table: 'washes', entity: 'wash', sumField: 'cost', dateField: 'wash_date',
  fields: {
    vehicle_id: { type: 'id', ref: 'vehicles', required: true },
    wash_date: { type: 'date', required: true },
    kind: { type: 'enum', required: true, values: WASH_KINDS },
    place: { type: 'string', max: 120 },
    cost: { type: 'money', default: 0 },
    notes: { type: 'text', max: 500 },
  },
  search: ['place', 'notes'], filters: ['vehicle_id', 'kind'],
  order: 't.wash_date DESC, t.id DESC',
});

export const fines = defineResource({
  table: 'fines', entity: 'fine', sumField: 'amount', dateField: 'fine_date',
  fields: {
    vehicle_id: { type: 'id', ref: 'vehicles', required: true },
    fine_date: { type: 'date', required: true },
    location: { type: 'string', max: 160 },
    infraction: { type: 'string', required: true, max: 160 },
    ticket_number: { type: 'string', max: 40 },
    amount: { type: 'money', required: true },
    due_date: { type: 'date' },
    appeal_deadline: { type: 'date' },
    status: { type: 'enum', values: FINE_STATUS, default: 'pendente' },
    paid_date: { type: 'date' },
    notes: { type: 'text', max: 1000 },
    notify_days: { type: 'int', max: 90 },
  },
  search: ['infraction', 'location', 'ticket_number', 'notes'], filters: ['vehicle_id', 'status'],
  order: 't.fine_date DESC, t.id DESC',
  before(data) {
    if (data.status === 'paga') data.paid_date = data.paid_date || today();
    else data.paid_date = null;
  },
});

export const reminders = defineResource({
  table: 'reminders', sumField: undefined, dateField: 'due_date',
  fields: {
    kind: { type: 'enum', required: true, values: ['wash', 'routine'] },
    vehicle_id: { type: 'id', ref: 'vehicles' },
    title: { type: 'string', required: true, max: 120 },
    category: { type: 'enum', values: ROUTINE_CATS },
    priority: { type: 'enum', values: ['baixa', 'media', 'alta'], default: 'media' },
    due_date: { type: 'date', required: true },
    recurrence: { type: 'enum', values: RECURRENCE, default: 'none' },
    recurrence_interval: { type: 'int', min: 1, max: 365, default: 1 },
    notify_days: { type: 'int', max: 90 },
    notes: { type: 'text', max: 1000 },
    status: { type: 'enum', values: ['active', 'done'], default: 'active' },
  },
  search: ['title', 'notes'], filters: ['kind', 'vehicle_id', 'category', 'priority', 'status'],
  order: `CASE t.status WHEN 'active' THEN 0 ELSE 1 END, t.due_date ASC, t.id`,
  before(data, { errors }) {
    if (data.kind === 'wash' && !data.vehicle_id) errors.vehicle_id = 'Escolha o veículo.';
    if (data.kind === 'wash') data.category = null;
    if (data.recurrence === 'none') data.recurrence_interval = 1;
  },
});
