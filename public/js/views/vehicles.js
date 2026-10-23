import { api } from '../api.js';
import { state, refreshVehicles, refreshNotifCount } from '../state.js';
import { L, label } from '../labels.js';
import { h, icon, chip, empty, plate, odometer, brl, dateBR, daysUntil, toast, confirmDialog } from '../ui.js';
import { openForm, mountModule } from '../module.js';
import * as M from '../modules.js';
import { spendChart, chartLegend } from '../charts.js';

const year = new Date().getFullYear();
export const vehicleCfg = {
  endpoint: '/vehicles', singular: 'veículo', icon: 'car',
  defaults: () => ({ type: 'carro' }),
  fields: [
    { name: 'nickname', label: 'Apelido', type: 'text', required: true, max: 60, placeholder: 'Ex.: Civic da família' },
    { name: 'plate', label: 'Placa', type: 'plate', required: true, placeholder: 'AAA1B23' },
    { name: 'model', label: 'Modelo', type: 'text', required: true, max: 80, placeholder: 'Ex.: Honda Civic EXL' },
    { name: 'year', label: 'Ano', type: 'int', required: true, min: 1950, max: year + 1 },
    { name: 'type', label: 'Tipo', type: 'select', required: true, options: L.vehicleType },
    { name: 'odometer', label: 'Quilometragem atual', type: 'int', max: 9999999, help: 'Atualizamos automaticamente quando você registra um serviço com km maior.' },
  ],
};

export function openVehicleForm(item, onSaved) {
  openForm(vehicleCfg, item, { onSaved: async (saved) => {
    await refreshVehicles(); refreshNotifCount();
    if (onSaved) onSaved(saved); else location.hash = `#/vehicles/${saved.id}`;
  } });
}

const since = (iso) => { const d = -daysUntil(iso); return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`; };

export function vehicleCard(v) {
  return h('a', { class: 'card vcard', href: `#/vehicles/${v.id}` },
    h('div', { class: 'top' }, h('div', null, h('h3', null, v.nickname), h('div', { class: 'sub' }, `${v.model}, ${v.year}`)), plate(v.plate)),
    odometer(v.odometer),
    h('div', { class: 'foot' },
      v.open_fines ? chip(`${v.open_fines} multa${v.open_fines > 1 ? 's' : ''} em aberto`, 'danger', 'alert') : chip('Sem multas abertas', 'ok', 'check'),
      v.last_wash ? chip(`Lavado ${since(v.last_wash)}`, '', 'drop') : null,
      v.last_maintenance ? chip(`Revisão ${since(v.last_maintenance)}`, '', 'wrench') : null));
}

export async function vehiclesView() {
  await refreshVehicles();
  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Veículos'), h('p', null, 'Cadastre seus carros e motos e acompanhe tudo de cada um.')),
      h('button', { class: 'btn', onclick: () => openVehicleForm(null) }, icon('plus'), 'Novo veículo')),
    state.vehicles.length ? h('div', { class: 'vehicles-grid' }, state.vehicles.map(vehicleCard))
      : h('div', { class: 'card' }, empty({ iconName: 'car', title: 'Nenhum veículo cadastrado', text: 'Informe apelido, placa, modelo, ano, tipo e quilometragem para começar.', action: h('button', { class: 'btn', onclick: () => openVehicleForm(null) }, icon('plus'), 'Adicionar veículo') })));
}

const TABS = [['', 'Resumo'], ['maintenance', 'Manutenções', M.maintenance], ['expenses', 'Gastos', M.expenses], ['washes', 'Lavagens', M.washes], ['fines', 'Multas', M.fines]];
const HIST = { maintenance: ['wrench', ''], expense: ['wallet', ''], wash: ['drop', 'info'], fine: ['alert', 'danger'] };

export async function vehicleDetailView({ id, tab = '' }) {
  const root = h('div');
  const head = h('div');
  const body = h('div');
  let data = await api.get(`/vehicles/${id}/summary`);

  function renderHead() {
    const v = data.vehicle;
    head.replaceChildren(
      h('a', { href: '#/vehicles', class: 'small muted' }, '← Veículos'),
      h('div', { class: 'card vhead', style: { 'margin-top': '10px' } },
        h('div', { class: 'grow' }, h('h1', null, v.nickname), h('div', { class: 'meta' }, `${v.model}, ${v.year}, ${label('vehicleType', v.type)}`),
          h('div', { class: 'row wrap', style: { 'margin-top': '14px' } }, plate(v.plate), odometer(v.odometer))),
        h('div', { class: 'row wrap' },
          h('div', { style: { 'margin-right': '10px' } }, h('div', { class: 'small muted' }, 'Gasto no mês'), h('div', { class: 'num', style: { font: '700 1.35rem var(--font-display)' } }, brl(data.spending.month_total))),
          h('div', { style: { 'margin-right': '14px' } }, h('div', { class: 'small muted' }, 'No ano'), h('div', { class: 'num', style: { font: '700 1.35rem var(--font-display)' } }, brl(data.spending.year_total))),
          h('button', { class: 'btn ghost', onclick: () => openVehicleForm(v, async () => { await reloadData(); }) }, icon('pencil'), 'Editar'),
          h('button', { class: 'btn ghost danger', onclick: async () => {
            const ok = await confirmDialog({ title: 'Excluir veículo', message: `Excluir "${v.nickname}" também apaga manutenções, gastos, lavagens, multas e anexos deste veículo. Esta ação não pode ser desfeita.`, confirmLabel: 'Excluir veículo', danger: true });
            if (!ok) return;
            try { await api.del(`/vehicles/${v.id}`); toast('Veículo excluído'); await refreshVehicles(); refreshNotifCount(); location.hash = '#/vehicles'; } catch (e) { toast(e.message, 'err'); }
          } }, icon('trash'), 'Excluir'))),
      h('nav', { class: 'tabs', 'aria-label': 'Seções do veículo' }, TABS.map(([key, text]) => h('a', { href: `#/vehicles/${id}${key ? '/' + key : ''}`, class: key === tab ? 'active' : '' }, text))));
  }

  async function reloadData() { data = await api.get(`/vehicles/${id}/summary`); renderHead(); if (!tab) renderSummary(); }

  function renderSummary() {
    const hist = data.history;
    body.replaceChildren(h('div', { class: 'grid-2' },
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Histórico')),
        hist.length ? h('div', { class: 'timeline' }, hist.map((e) => {
          const [ic, tone] = HIST[e.type];
          return h('div', { class: 'tl' }, h('div', { class: 'when' }, dateBR(e.date)), h('div', { class: `tile ${tone}`, style: { width: '34px', height: '34px' } }, icon(ic)),
            h('div', { class: 'grow' }, h('div', { class: 't', style: { 'font-weight': '600' } }, e.title), h('div', { class: 'small muted' }, [e.detail && (e.type === 'fine' ? label('fineStatus', e.detail) : e.type === 'expense' ? label('expCat', e.detail) : e.detail), e.odometer != null ? `${e.odometer.toLocaleString('pt-BR')} km` : ''].filter(Boolean).join(' · '))),
            e.amount ? h('div', { class: 'amt num', style: { font: '650 1rem var(--font-display)' } }, brl(e.amount)) : null);
        })) : empty({ iconName: 'list', title: 'Sem registros ainda', text: 'Manutenções, gastos, lavagens e multas deste veículo aparecem aqui em ordem cronológica.' })),
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Gastos por mês')), h('div', { class: 'chart-wrap' }, spendChart(data.spending.by_month), chartLegend()))));
  }

  renderHead();
  const t = TABS.find(([k]) => k === tab);
  if (!t) return empty({ iconName: 'alert', title: 'Seção não encontrada' });
  if (!tab) renderSummary(); else body.replaceChildren(mountModule(t[2], { fixed: { vehicle_id: Number(id) }, onChange: reloadData }));
  root.append(head, body);
  return root;
}
