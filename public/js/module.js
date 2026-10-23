import { api, qs } from './api.js';
import { state, refreshVehicles, refreshNotifCount } from './state.js';
import { buildForm } from './form.js';
import { attachmentsWidget } from './attachments.js';
import { h, icon, chip, empty, skeleton, toast, openModal, confirmDialog, setBusy, brl, debounce, todayISO } from './ui.js';

const PERIODS = [['', 'Todo o período'], ['month', 'Este mês'], ['3m', 'Últimos 3 meses'], ['year', 'Este ano']];
function periodRange(p) {
  const t = todayISO();
  if (p === 'month') return { from: t.slice(0, 8) + '01' };
  if (p === 'year') return { from: t.slice(0, 4) + '-01-01' };
  if (p === '3m') { const d = new Date(t + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 3); return { from: d.toISOString().slice(0, 10) }; }
  return {};
}

/** Abre o formulário de criação/edição de qualquer recurso configurado. */
export function openForm(cfg, item, { fixed = {}, onSaved } = {}) {
  const isEdit = !!item;
  const values = isEdit ? item : { ...(cfg.defaults?.() || {}), ...fixed };
  const form = buildForm(cfg.fields, values, fixed);
  const att = cfg.entity ? attachmentsWidget({ entity: cfg.entity, id: item?.id }) : null;
  const banner = h('div', { class: 'form-error', role: 'alert', hidden: true });
  const save = h('button', { class: 'btn', type: 'submit', form: form.id }, isEdit ? 'Salvar alterações' : `Adicionar ${cfg.singular}`);
  const cancel = h('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Cancelar');

  const m = openModal({
    title: isEdit ? `Editar ${cfg.singular}` : `Novo ${cfg.singularFull || cfg.singular}`,
    body: h('div', { class: 'modal-body stack' }, banner, form.el, att?.el),
    footer: h('div', { class: 'modal-foot' }, cancel, save),
  });

  form.el.addEventListener('submit', async (e) => {
    e.preventDefault();
    banner.hidden = true;
    const { payload, errors } = form.read();
    if (Object.keys(errors).length) { form.showErrors(errors); return; }
    setBusy(save, true);
    try {
      const saved = isEdit ? await api.put(`${cfg.endpoint}/${item.id}`, payload) : await api.post(cfg.endpoint, payload);
      let failed = 0;
      if (att?.hasPending()) failed = await att.uploadPending(saved.id);
      toast(isEdit ? 'Alterações salvas' : `${cap(cfg.singular)} adicionado`);
      m.close();
      onSaved?.(saved, failed);
    } catch (err) {
      setBusy(save, false);
      if (!form.showErrors(err.details) || !Object.keys(err.details || {}).length) { banner.textContent = err.message; banner.hidden = false; }
    }
  });
  setTimeout(() => form.focus(), 50);
  return m;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export async function deleteItem(cfg, item) {
  const ok = await confirmDialog({ title: `Excluir ${cfg.singular}`, message: cfg.deleteMessage || 'Esta ação não pode ser desfeita. Anexos deste registro também serão removidos.', confirmLabel: 'Excluir', danger: true });
  if (!ok) return false;
  try { await api.del(`${cfg.endpoint}/${item.id}`); toast('Registro excluído'); return true; }
  catch (e) { toast(e.message, 'err'); return false; }
}

/** Lista paginada com busca, filtros, soma e ações — usada por todas as telas de registros. */
export function mountModule(cfg, { fixed = {}, onChange } = {}) {
  const filters = { q: '', period: '' };
  for (const f of cfg.filters || []) if (!(f.name in fixed)) filters[f.name] = f.default ?? '';
  let items = [], total = 0, sum, seq = 0, loading = true;

  const root = h('div');
  const listBox = h('div');
  const summary = h('div', { class: 'summary' });

  const reload = () => load(true);
  const changed = async () => { await reload(); refreshVehicles(); refreshNotifCount(); onChange?.(); };
  const add = h('button', { class: 'btn', type: 'button', onclick: () => {
    if (cfg.needsVehicle && !state.vehicles.length) { location.hash = '#/vehicles'; toast('Cadastre um veículo primeiro.', 'err'); return; }
    openForm(cfg, null, { fixed, onSaved: changed });
  } }, icon('plus'), cfg.addLabel || `Novo ${cfg.singularFull || cfg.singular}`);

  const toolbar = h('div', { class: 'toolbar' },
    h('div', { class: 'search' }, icon('search'), h('input', { class: 'input', type: 'search', placeholder: 'Buscar…', 'aria-label': 'Buscar', oninput: debounce((e) => { filters.q = e.target.value; reload(); }, 300) })));
  for (const f of cfg.filters || []) {
    if (f.name in fixed) continue;
    const opts = f.type === 'vehicle' ? state.vehicles.map((v) => [String(v.id), v.nickname]) : f.options;
    toolbar.append(h('select', { class: 'select', 'aria-label': f.all, value: filters[f.name], onchange: (e) => { filters[f.name] = e.target.value; reload(); } },
      h('option', { value: '' }, f.all), opts.map(([v, t]) => h('option', { value: v }, t))));
    toolbar.lastChild.value = filters[f.name];
  }
  if (cfg.dateField) toolbar.append(h('select', { class: 'select', 'aria-label': 'Período', onchange: (e) => { filters.period = e.target.value; reload(); } }, PERIODS.map(([v, t]) => h('option', { value: v }, t))));
  toolbar.append(add);

  function rowEl(item) {
    const r = cfg.row(item);
    const acts = [];
    for (const a of cfg.actions || []) if (!a.show || a.show(item)) acts.push(h('button', { class: 'icon-btn', type: 'button', title: a.label, 'aria-label': a.label, onclick: async (e) => { e.stopPropagation(); await a.run(item); changed(); } }, icon(a.icon)));
    acts.push(h('button', { class: 'icon-btn', type: 'button', title: 'Editar', 'aria-label': 'Editar', onclick: (e) => { e.stopPropagation(); openForm(cfg, item, { fixed, onSaved: changed }); } }, icon('pencil')));
    acts.push(h('button', { class: 'icon-btn danger', type: 'button', title: 'Excluir', 'aria-label': 'Excluir', onclick: async (e) => { e.stopPropagation(); if (await deleteItem(cfg, item)) changed(); } }, icon('trash')));
    const meta = (r.meta || []).filter(Boolean).map((m) => (m instanceof Node ? m : h('span', null, m.icon ? icon(m.icon) : null, m.text)));
    return h('div', { class: `item ${r.done ? 'done' : ''}`, 'data-pr': r.priority || null, role: 'button', tabindex: 0,
      onclick: () => openForm(cfg, item, { fixed, onSaved: changed }),
      onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openForm(cfg, item, { fixed, onSaved: changed }); } },
      h('div', { class: `tile ${r.tone || ''}` }, icon(r.icon || cfg.icon)),
      h('div', { class: 'grow' }, h('div', { class: 't' }, r.title), h('div', { class: 'meta' }, meta, r.tags)),
      item.attachment_count ? h('span', { class: 'faint', title: `${item.attachment_count} anexo(s)` }, icon('clip')) : null,
      r.amount ? h('div', { class: 'amt num' }, r.amount) : null,
      h('div', { class: 'acts' }, acts));
  }

  function render() {
    summary.replaceChildren();
    if (loading && !items.length) { listBox.replaceChildren(skeleton(4)); return; }
    const hasFilter = Object.entries(filters).some(([k, v]) => v && !(cfg.filters || []).find((f) => f.name === k && f.default === v));
    if (!items.length) {
      const noVehicle = cfg.needsVehicle && !state.vehicles.length;
      listBox.replaceChildren(h('div', { class: 'card' }, hasFilter ? empty({ iconName: 'search', title: 'Nada encontrado', text: 'Tente outros termos ou limpe os filtros.' })
        : noVehicle ? empty({ iconName: 'car', title: 'Cadastre um veículo primeiro', text: `Para registrar ${cfg.pluralText || cfg.title.toLowerCase()}, você precisa ter ao menos um veículo.`, action: h('a', { class: 'btn', href: '#/vehicles' }, icon('plus'), 'Cadastrar veículo') })
        : empty({ iconName: cfg.icon, title: cfg.emptyTitle, text: cfg.emptyText, action: h('button', { class: 'btn', type: 'button', onclick: () => add.click() }, icon('plus'), cfg.addLabel || `Novo ${cfg.singularFull || cfg.singular}`) })));
      return;
    }
    summary.append(h('span', null, h('b', { class: 'num' }, total), total === 1 ? ' registro' : ' registros'));
    if (cfg.sumField && sum !== undefined) summary.append(h('span', null, '· Total ', h('b', { class: 'num' }, brl(sum))));
    listBox.replaceChildren(h('div', { class: 'card list-card' }, h('div', { class: 'list' }, items.map(rowEl)),
      items.length < total ? h('div', { class: 'more-row' }, h('button', { class: 'btn ghost sm', type: 'button', onclick: () => load(false) }, `Mostrar mais (${total - items.length})`)) : null));
  }

  async function load(reset) {
    const my = ++seq;
    if (reset) { loading = true; }
    const { period, ...rest } = filters;
    try {
      const res = await api.get(cfg.endpoint + qs({ ...rest, ...periodRange(period), ...fixed, limit: 30, offset: reset ? 0 : items.length }));
      if (my !== seq) return;
      items = reset ? res.items : items.concat(res.items); total = res.total; sum = res.sum; loading = false; render();
    } catch (e) {
      if (my !== seq) return;
      loading = false; listBox.replaceChildren(h('div', { class: 'card' }, empty({ iconName: 'alert', title: 'Não foi possível carregar', text: e.message, action: h('button', { class: 'btn ghost', onclick: reload }, 'Tentar novamente') })));
    }
  }

  root.append(toolbar, summary, listBox);
  render(); load(true);
  return root;
}

export { chip };
