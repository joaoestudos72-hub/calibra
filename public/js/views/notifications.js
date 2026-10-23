import { api } from '../api.js';
import { refreshNotifCount } from '../state.js';
import { h, icon, chip, empty, skeleton, toast, openModal, dateBR, dueText, dueTone, todayISO } from '../ui.js';
import { kindOf } from '../kinds.js';

const TABS = [['active', 'Ativas'], ['snoozed', 'Adiadas'], ['done', 'Concluídas']];

function snoozeDialog(n, done) {
  const run = async (body) => {
    try { await api.post(`/notifications/${n.id}/snooze`, body); toast('Notificação adiada'); m.close(); done(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const date = h('input', { class: 'input', type: 'date', min: new Date(Date.now() + 864e5).toISOString().slice(0, 10), 'aria-label': 'Escolher data' });
  const presets = [[1, 'Amanhã'], [3, 'Em 3 dias'], [7, 'Em 1 semana'], [14, 'Em 2 semanas']];
  const m = openModal({
    title: 'Adiar notificação', narrow: true,
    body: h('div', { class: 'modal-body stack' },
      h('p', { class: 'muted' }, `"${n.title}" volta a aparecer na data escolhida.`),
      h('div', { class: 'stack', style: { gap: '8px' } }, presets.map(([d, t]) => h('button', { class: 'btn ghost block', type: 'button', onclick: () => run({ days: d }) }, icon('clock'), t))),
      h('div', { class: 'field' }, h('label', null, 'Ou escolha uma data'), h('div', { class: 'row' }, date,
        h('button', { class: 'btn', type: 'button', onclick: () => (date.value ? run({ until: date.value }) : toast('Escolha uma data.', 'err')) }, 'Adiar')))),
  });
}

export async function notificationsView() {
  let tab = 'active';
  const root = h('div');
  const tabsEl = h('nav', { class: 'tabs', 'aria-label': 'Estado das notificações' });
  const list = h('div');
  let counts = { active: 0, snoozed: 0, done: 0 };

  async function load() {
    list.replaceChildren(skeleton(3));
    try {
      const res = await api.get(`/notifications?state=${tab}`);
      const all = await api.get('/notifications?state=all');
      counts = all.counts;
      refreshNotifCount();
      renderTabs(); renderList(res.items);
    } catch (e) { list.replaceChildren(h('div', { class: 'card' }, empty({ iconName: 'alert', title: 'Não foi possível carregar', text: e.message, action: h('button', { class: 'btn ghost', onclick: load }, 'Tentar novamente') }))); }
  }
  const renderTabs = () => tabsEl.replaceChildren(...TABS.map(([k, t]) => h('button', { type: 'button', class: k === tab ? 'active' : '', onclick: () => { tab = k; load(); } }, `${t} `, h('span', { class: 'chip', style: { 'margin-left': '4px' } }, counts[k]))));

  function item(n) {
    const k = kindOf(n.kind);
    const tone = n.state === 'done' ? 'ok' : k.tone;
    const act = async (path, msg) => { try { await api.post(`/notifications/${n.id}/${path}`); toast(msg); load(); } catch (e) { toast(e.message, 'err'); } };
    const when = n.due_date ? h('span', { class: `due-note ${dueTone(n.days_left)}` }, dueText(n.days_left)) : h('span', { class: 'due-note warn' }, 'Meta de quilometragem');
    const meta = [when, n.due_date ? h('span', null, icon('calendar'), dateBR(n.due_date)) : null, n.message ? h('span', null, n.message) : null,
      n.state === 'snoozed' ? h('span', null, icon('clock'), `Adiada até ${dateBR(n.snoozed_until)}`) : null,
      n.state === 'done' && n.resolved_at ? h('span', null, icon('check'), `Concluída em ${dateBR(n.resolved_at)}`) : null];
    return h('div', { class: 'item notif', 'data-pr': n.state === 'active' && n.priority === 'alta' ? 'alta' : null },
      h('div', { class: `tile ${tone}` }, icon(n.state === 'done' ? 'check' : k.icon)),
      h('div', { class: 'grow' }, h('a', { class: 't', href: k.href, style: { color: 'inherit', 'font-weight': '600' } }, n.title), h('div', { class: 'meta' }, meta)),
      h('div', { class: 'acts' },
        n.state === 'active' ? [h('button', { class: 'btn soft sm', onclick: () => act('complete', 'Notificação concluída') }, icon('check'), 'Concluir'), h('button', { class: 'btn ghost sm', onclick: () => snoozeDialog(n, load) }, icon('clock'), 'Adiar')] : null,
        n.state === 'snoozed' ? [h('button', { class: 'btn soft sm', onclick: () => act('complete', 'Notificação concluída') }, icon('check'), 'Concluir'), h('button', { class: 'btn ghost sm', onclick: () => act('wake', 'Notificação reativada') }, 'Reativar')] : null));
  }

  function renderList(items) {
    const msgs = {
      active: ['Tudo em dia', 'Nenhuma notificação ativa. Avisos aparecem aqui conforme os prazos se aproximam.'],
      snoozed: ['Nada adiado', 'Notificações adiadas ficam aqui até a data escolhida.'],
      done: ['Nada concluído ainda', 'Seu histórico de avisos concluídos aparece aqui.'],
    }[tab];
    list.replaceChildren(items.length ? h('div', { class: 'card list-card' }, h('div', { class: 'list' }, items.map(item)))
      : h('div', { class: 'card' }, empty({ iconName: 'bell', title: msgs[0], text: msgs[1] })));
  }

  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Notificações'),
      h('p', null, 'Avisos gerados a partir de lembretes, próximas manutenções e prazos de multas.')),
      h('a', { class: 'btn ghost', href: '#/settings' }, icon('sliders'), 'Configurar antecedência')),
    tabsEl, list);
  await load();
  void chip; void todayISO;
  return root;
}
