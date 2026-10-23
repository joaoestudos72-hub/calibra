// Configuração declarativa de cada módulo: campos do formulário, filtros e aparência das linhas.
import { api } from './api.js';
import { L, label } from './labels.js';
import { h, chip, brl, km, dateBR, todayISO, daysUntil, dueText, dueTone, toast } from './ui.js';

const V = { name: 'vehicle_id', label: 'Veículo', type: 'vehicle', required: true };
const NOTIFY = { name: 'notify_days', label: 'Avisar com antecedência', type: 'select', options: L.notifyDays.slice(1), placeholder: 'Padrão da conta', numeric: true, help: 'Quando começar a avisar sobre esta data.' };
const vehicleFilter = { name: 'vehicle_id', type: 'vehicle', all: 'Todos os veículos' };
const m = (icon, text) => (text ? { icon, text } : null);
const ppl = (n) => (n > 0 ? chip(`${n}`, '') : null);

export const maintenance = {
  key: 'maintenance', endpoint: '/maintenances', entity: 'maintenance', icon: 'wrench', title: 'Manutenções',
  singular: 'manutenção', singularFull: 'registro de manutenção', addLabel: 'Registrar manutenção', needsVehicle: true, sumField: true, dateField: true,
  emptyTitle: 'Nenhuma manutenção registrada', emptyText: 'Registre trocas de óleo, revisões e reparos para acompanhar custos e receber avisos do próximo serviço.',
  defaults: () => ({ service_date: todayISO(), category: 'revisao' }),
  fields: [
    V,
    { name: 'title', label: 'Serviço realizado', type: 'text', required: true, max: 120, full: true, placeholder: 'Ex.: Troca de óleo e filtro' },
    { name: 'category', label: 'Categoria', type: 'select', required: true, options: L.maintCat },
    { name: 'service_date', label: 'Data do serviço', type: 'date', required: true },
    { name: 'odometer', label: 'Quilometragem', type: 'int', max: 9999999, placeholder: 'km no momento' },
    { name: 'cost', label: 'Valor pago', type: 'money' },
    { name: 'workshop', label: 'Oficina', type: 'text', max: 120, full: true },
    { name: 'description', label: 'Detalhes', type: 'textarea', full: true, placeholder: 'Peças trocadas, observações do mecânico…' },
    { type: 'heading', text: 'Próxima revisão', help: 'Preencha para receber um aviso quando chegar a hora.' },
    { name: 'next_due_date', label: 'Data prevista', type: 'date' },
    { name: 'next_due_km', label: 'Quilometragem prevista', type: 'int', max: 9999999 },
    NOTIFY,
  ],
  filters: [vehicleFilter, { name: 'category', options: L.maintCat, all: 'Todas as categorias' }],
  row(i) {
    const due = !i.reminder_done && i.next_due_date ? daysUntil(i.next_due_date) : null;
    return {
      title: i.title, amount: i.cost ? brl(i.cost) : null,
      meta: [m('car', i.vehicle_name), m('calendar', dateBR(i.service_date)), m('gauge', i.odometer != null ? km(i.odometer) : ''), m('tool', i.workshop)],
      tags: [chip(label('maintCat', i.category), 'accent'),
        due !== null ? chip(`Próxima: ${dateBR(i.next_due_date)}`, dueTone(due) || 'info', 'clock') : null,
        !i.reminder_done && i.next_due_km ? chip(`Aos ${km(i.next_due_km)}`, 'info', 'gauge') : null],
    };
  },
};

export const expenses = {
  key: 'expenses', endpoint: '/expenses', entity: 'expense', icon: 'wallet', title: 'Gastos',
  singular: 'gasto', addLabel: 'Registrar gasto', needsVehicle: true, sumField: true, dateField: true,
  emptyTitle: 'Nenhum gasto registrado', emptyText: 'Combustível, seguro, IPVA, pedágios e outras despesas do veículo ficam aqui.',
  defaults: () => ({ expense_date: todayISO(), category: 'combustivel' }),
  fields: [
    V,
    { name: 'category', label: 'Categoria', type: 'select', required: true, options: L.expCat },
    { name: 'amount', label: 'Valor', type: 'money', required: true },
    { name: 'description', label: 'Descrição', type: 'text', max: 160, full: true, placeholder: 'Ex.: Abastecimento posto Shell' },
    { name: 'expense_date', label: 'Data', type: 'date', required: true },
    { name: 'odometer', label: 'Quilometragem', type: 'int', max: 9999999 },
  ],
  filters: [vehicleFilter, { name: 'category', options: L.expCat, all: 'Todas as categorias' }],
  row: (i) => ({
    icon: 'wallet', title: i.description || label('expCat', i.category), amount: brl(i.amount),
    meta: [m('car', i.vehicle_name), m('calendar', dateBR(i.expense_date)), m('gauge', i.odometer != null ? km(i.odometer) : '')],
    tags: [chip(label('expCat', i.category), 'accent')],
  }),
};

export const washes = {
  key: 'washes', endpoint: '/washes', entity: 'wash', icon: 'drop', title: 'Lavagens',
  singular: 'lavagem', addLabel: 'Registrar lavagem', needsVehicle: true, sumField: true, dateField: true,
  emptyTitle: 'Nenhuma lavagem registrada', emptyText: 'Registre cada lavagem para saber quanto gasta e quando foi a última.',
  defaults: () => ({ wash_date: todayISO(), kind: 'simples' }),
  fields: [
    V,
    { name: 'wash_date', label: 'Data', type: 'date', required: true },
    { name: 'kind', label: 'Tipo de lavagem', type: 'select', required: true, options: L.washKind },
    { name: 'cost', label: 'Valor', type: 'money' },
    { name: 'place', label: 'Local', type: 'text', max: 120, full: true },
    { name: 'notes', label: 'Observações', type: 'textarea', max: 500, full: true },
  ],
  filters: [vehicleFilter, { name: 'kind', options: L.washKind, all: 'Todos os tipos' }],
  row: (i) => ({
    icon: 'drop', tone: 'info', title: `Lavagem ${label('washKind', i.kind).toLowerCase()}`, amount: i.cost ? brl(i.cost) : null,
    meta: [m('car', i.vehicle_name), m('calendar', dateBR(i.wash_date)), m('pin', i.place)],
  }),
};

const recurText = (i) => (i.recurrence === 'none' ? null : m('repeat', i.recurrence_interval > 1 ? `A cada ${i.recurrence_interval} ${L.recUnit[i.recurrence]}` : label('recurrence', i.recurrence)));
const complete = {
  icon: 'check', label: 'Concluir', show: (i) => i.status === 'active',
  async run(i) {
    const r = await api.post(`/reminders/${i.id}/complete`);
    toast(r.status === 'done' ? 'Lembrete concluído' : `Concluído. Próximo aviso em ${dateBR(r.due_date)}`);
  },
};
const recurrenceFields = [
  { name: 'due_date', label: 'Data', type: 'date', required: true },
  { name: 'recurrence', label: 'Repetição', type: 'select', required: true, options: L.recurrence },
  { name: 'recurrence_interval', label: 'Repetir a cada', type: 'int', min: 1, max: 365, showIf: (v) => v.recurrence && v.recurrence !== 'none', hiddenValue: 1, help: 'Ex.: 2 com repetição semanal = a cada 2 semanas.' },
  NOTIFY,
];
const statusFilter = { name: 'status', options: [['active', 'Ativos'], ['done', 'Concluídos']], all: 'Todos', default: 'active' };

export const washReminders = {
  key: 'wash-reminders', endpoint: '/reminders', icon: 'repeat', title: 'Lembretes de lavagem',
  singular: 'lembrete', singularFull: 'lembrete de lavagem', addLabel: 'Novo lembrete', needsVehicle: true, dateField: false, pluralText: 'lembretes de lavagem',
  emptyTitle: 'Nenhum lembrete de lavagem', emptyText: 'Crie um lembrete recorrente, como "lavar a cada 15 dias", e o Calibra avisa na hora certa.',
  deleteMessage: 'O lembrete será excluído e não gerará mais avisos.',
  defaults: () => ({ title: 'Lavar o veículo', recurrence: 'weekly', recurrence_interval: 2, due_date: todayISO() }),
  fixed: { kind: 'wash' },
  fields: [V, { name: 'title', label: 'Título', type: 'text', required: true, max: 120, full: true }, ...recurrenceFields,
    { name: 'notes', label: 'Observações', type: 'textarea', max: 1000, full: true }],
  filters: [vehicleFilter, statusFilter],
  actions: [complete],
  row: (i) => {
    const d = daysUntil(i.due_date);
    return {
      icon: 'repeat', tone: 'info', title: i.title, done: i.status === 'done',
      meta: [m('car', i.vehicle_name), m('calendar', dateBR(i.due_date)), recurText(i)],
      tags: [i.status === 'done' ? chip('Concluído', 'ok', 'check') : chip(dueText(d), dueTone(d) || '', 'clock')],
    };
  },
};

export const routine = {
  key: 'routine', endpoint: '/reminders', icon: 'calendar', title: 'Rotina',
  singular: 'lembrete', singularFull: 'lembrete', addLabel: 'Novo lembrete', dateField: false, pluralText: 'lembretes',
  emptyTitle: 'Sua rotina está em dia', emptyText: 'Crie lembretes para consultas, contas, renovações e tudo que você não quer esquecer.',
  deleteMessage: 'O lembrete será excluído e não gerará mais avisos.',
  defaults: () => ({ priority: 'media', category: 'pessoal', recurrence: 'none', due_date: todayISO() }),
  fixed: { kind: 'routine' },
  fields: [
    { name: 'title', label: 'O que você precisa lembrar?', type: 'text', required: true, max: 120, full: true },
    { name: 'category', label: 'Categoria', type: 'select', required: true, options: L.routineCat },
    { name: 'priority', label: 'Prioridade', type: 'select', required: true, options: L.priority },
    ...recurrenceFields,
    { name: 'vehicle_id', label: 'Veículo (opcional)', type: 'vehicle' },
    { name: 'notes', label: 'Observações', type: 'textarea', max: 1000, full: true },
  ],
  filters: [{ name: 'category', options: L.routineCat, all: 'Todas as categorias' }, { name: 'priority', options: L.priority, all: 'Qualquer prioridade' }, statusFilter],
  actions: [complete],
  row: (i) => {
    const d = daysUntil(i.due_date);
    const pt = { alta: 'danger', media: 'warn', baixa: '' }[i.priority];
    return {
      icon: 'calendar', tone: pt === 'danger' ? 'danger' : pt === 'warn' ? 'warn' : '', title: i.title, done: i.status === 'done', priority: i.status === 'active' ? i.priority : null,
      meta: [m('calendar', dateBR(i.due_date)), m('car', i.vehicle_name), recurText(i)],
      tags: [chip(label('routineCat', i.category), 'accent'), i.priority !== 'media' ? chip(`Prioridade ${label('priority', i.priority).toLowerCase()}`, pt) : null,
        i.status === 'done' ? chip('Concluído', 'ok', 'check') : chip(dueText(d), dueTone(d) || '', 'clock')],
    };
  },
};

const fineTone = { pendente: 'warn', paga: 'ok', em_recurso: 'info', recurso_deferido: 'ok', recurso_indeferido: 'danger', cancelada: '' };
export const fines = {
  key: 'fines', endpoint: '/fines', entity: 'fine', icon: 'alert', title: 'Multas',
  singular: 'multa', addLabel: 'Registrar multa', needsVehicle: true, sumField: true, dateField: true,
  emptyTitle: 'Nenhuma multa registrada', emptyText: 'Cadastre multas com vencimento e prazo de recurso para não perder nenhuma data.',
  defaults: () => ({ fine_date: todayISO(), status: 'pendente' }),
  fields: [
    V,
    { name: 'infraction', label: 'Infração', type: 'text', required: true, max: 160, full: true, placeholder: 'Ex.: Excesso de velocidade até 20%' },
    { name: 'fine_date', label: 'Data da infração', type: 'date', required: true },
    { name: 'amount', label: 'Valor', type: 'money', required: true },
    { name: 'location', label: 'Local', type: 'text', max: 160, full: true },
    { name: 'ticket_number', label: 'Nº do auto de infração', type: 'text', max: 40 },
    { name: 'status', label: 'Situação', type: 'select', required: true, options: L.fineStatus },
    { name: 'due_date', label: 'Vencimento', type: 'date' },
    { name: 'appeal_deadline', label: 'Prazo para recurso', type: 'date' },
    { name: 'paid_date', label: 'Data do pagamento', type: 'date', showIf: (v) => v.status === 'paga', help: 'Se vazio, usamos a data de hoje.' },
    NOTIFY,
    { name: 'notes', label: 'Observações', type: 'textarea', max: 1000, full: true },
  ],
  filters: [vehicleFilter, { name: 'status', options: L.fineStatus, all: 'Todas as situações' }],
  row(i) {
    const open = ['pendente', 'recurso_indeferido'].includes(i.status);
    const dd = open && i.due_date ? daysUntil(i.due_date) : null;
    const ad = i.status === 'pendente' && i.appeal_deadline ? daysUntil(i.appeal_deadline) : null;
    return {
      icon: 'alert', tone: i.status === 'paga' || i.status === 'cancelada' ? '' : (fineTone[i.status] || 'warn'), title: i.infraction, amount: brl(i.amount),
      meta: [m('car', i.vehicle_name), m('calendar', dateBR(i.fine_date)), m('pin', i.location), m('flag', i.ticket_number)],
      tags: [chip(label('fineStatus', i.status), fineTone[i.status]),
        dd !== null ? chip(`Vence ${dateBR(i.due_date)}`, dueTone(dd) || 'info', 'clock') : null,
        ad !== null ? chip(`Recurso até ${dateBR(i.appeal_deadline)}`, dueTone(ad) || 'info', 'shield') : null],
    };
  },
};
void h; void ppl;
