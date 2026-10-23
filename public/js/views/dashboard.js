import { api } from '../api.js';
import { state, emit } from '../state.js';
import { h, icon, chip, empty, brl, dateBR, dueText, dueTone, plate, odometer } from '../ui.js';
import { kindOf } from '../kinds.js';
import { spendChart, chartLegend } from '../charts.js';
import { vehicleCard, openVehicleForm } from './vehicles.js';

const greeting = () => { const hr = new Date().getHours(); return hr < 5 ? 'Boa madrugada' : hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite'; };

function stat(href, label, ic, value, sub, bad) {
  return h('a', { href }, h('div', { class: 'lbl' }, icon(ic), label), h('div', { class: `val num ${bad ? 'bad' : ''}` }, value), h('div', { class: 'sub' }, sub));
}

export async function dashboardView() {
  const d = await api.get('/dashboard');
  state.vehicles = d.vehicles; state.notif = { active: d.notifications.counts.active, overdue: d.notifications.counts.overdue }; emit();
  const first = state.user.name.split(' ')[0];
  const p = d.pending, sp = d.spending;
  const diff = sp.prev_month_total ? Math.round(((sp.month_total - sp.prev_month_total) / sp.prev_month_total) * 100) : null;
  const headline = p.overdue ? `${p.overdue} ${p.overdue === 1 ? 'prazo vencido precisa' : 'prazos vencidos precisam'} da sua atenção.`
    : p.next_7_days ? `${p.next_7_days} ${p.next_7_days === 1 ? 'compromisso' : 'compromissos'} nos próximos 7 dias.` : 'Tudo em dia por aqui.';

  const notifItems = d.notifications.items.map((n) => {
    const k = kindOf(n.kind);
    return h('a', { class: 'up-item', href: '#/notifications', style: { color: 'inherit', 'text-decoration': 'none' } },
      h('div', { class: `tile ${k.tone}` }, icon(k.icon)),
      h('div', { class: 'grow' }, h('div', { class: 't' }, n.title), h('div', { class: 's' }, n.vehicle_name || n.message || '')),
      n.due_date ? h('span', { class: `chip ${dueTone(n.days_left)}` }, dueText(n.days_left)) : h('span', { class: 'chip warn' }, 'Meta de km'));
  });
  const upcoming = d.upcoming.map((u) => {
    const k = kindOf(u.kind);
    return h('a', { class: 'up-item', href: k.href, style: { color: 'inherit', 'text-decoration': 'none' } },
      h('div', { class: `tile ${k.tone}` }, icon(k.icon)),
      h('div', { class: 'grow' }, h('div', { class: 't' }, u.title), h('div', { class: 's' }, [dateBR(u.due_date), u.vehicle_name].filter(Boolean).join(' · '))),
      h('span', { class: `chip ${dueTone(u.days_left)}` }, dueText(u.days_left)));
  });

  return h('div', null,
    h('div', { class: 'hello' }, h('h1', null, `${greeting()}, ${first}`), h('p', null, headline)),
    h('div', { class: 'card strip' },
      stat('#/notifications', 'Pendências', 'clock', p.overdue, p.overdue ? 'prazos vencidos' : `${p.next_7_days} nos próximos 7 dias`, p.overdue > 0),
      stat('#/notifications', 'Notificações', 'bell', d.notifications.counts.active, d.notifications.counts.snoozed ? `${d.notifications.counts.snoozed} adiada(s)` : 'ativas agora'),
      stat('#/expenses', 'Gasto no mês', 'wallet', brl(sp.month_total), diff === null ? `${brl(sp.year_total)} no ano` : `${Math.abs(diff)}% ${diff >= 0 ? 'a mais' : 'a menos'} que o mês anterior`),
      stat('#/fines', 'Multas em aberto', 'alert', p.open_fines, p.open_fines ? brl(p.open_fines_amount) + ' a resolver' : 'nenhuma pendente', p.open_fines > 0)),

    h('div', { class: 'grid-2' },
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, 'Seus veículos'), h('a', { href: '#/vehicles' }, 'Gerenciar')),
        h('div', { class: 'card-pad' }, d.vehicles.length
          ? h('div', { class: 'vehicles-grid' }, d.vehicles.map(vehicleCard))
          : empty({ iconName: 'car', title: 'Cadastre seu primeiro veículo', text: 'Com um veículo cadastrado você já pode registrar manutenções, lavagens e multas.',
            action: h('button', { class: 'btn', onclick: () => openVehicleForm(null) }, icon('plus'), 'Adicionar veículo') }))),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, 'Notificações'), h('a', { href: '#/notifications' }, 'Ver todas')),
        notifItems.length ? h('div', { style: { 'padding-bottom': '8px' } }, notifItems) : empty({ iconName: 'bell', title: 'Nenhum aviso agora', text: 'Quando um prazo estiver chegando, ele aparece aqui.' }))),

    h('div', { class: 'grid-2' },
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, 'Gastos dos últimos 6 meses'), h('span', { class: 'muted small' }, `${brl(sp.year_total)} no ano`)),
        h('div', { class: 'chart-wrap' }, spendChart(sp.by_month), h('div', null, chartLegend()))),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, 'Próximos prazos')),
        upcoming.length ? h('div', { style: { 'padding-bottom': '8px' } }, upcoming) : empty({ iconName: 'calendar', title: 'Sem prazos nos próximos 30 dias', text: 'Cadastre lembretes, próximas revisões e multas para acompanhar aqui.' }))));
}
void chip; void plate; void odometer;
