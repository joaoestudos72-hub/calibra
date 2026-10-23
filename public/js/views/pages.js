import { h } from '../ui.js';
import { mountModule } from '../module.js';
import * as M from '../modules.js';

const head = (title, text, extra) => h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), h('p', null, text)), extra);

export const maintenancePage = () => h('div', null, head('Manutenções', 'Serviços realizados, custos e avisos da próxima revisão de cada veículo.'), mountModule(M.maintenance));
export const expensesPage = () => h('div', null, head('Gastos', 'Combustível, seguro, IPVA e outras despesas dos seus veículos.'), mountModule(M.expenses));
export const finesPage = () => h('div', null, head('Multas', 'Acompanhe vencimentos, prazos de recurso e a situação de cada multa.'), mountModule(M.fines));
export const routinePage = () => h('div', null, head('Rotina', 'Lembretes pessoais avulsos ou recorrentes, com categoria e prioridade.'), mountModule(M.routine, { fixed: M.routine.fixed }));

export function washesPage(sub) {
  const reminders = sub === 'reminders';
  return h('div', null,
    head('Lavagens', 'Histórico de lavagens e lembretes recorrentes para manter o veículo limpo.'),
    h('nav', { class: 'tabs', 'aria-label': 'Seções de lavagens' },
      h('a', { href: '#/washes', class: reminders ? '' : 'active' }, 'Registros'),
      h('a', { href: '#/washes/reminders', class: reminders ? 'active' : '' }, 'Lembretes recorrentes')),
    reminders ? mountModule(M.washReminders, { fixed: M.washReminders.fixed }) : mountModule(M.washes));
}
