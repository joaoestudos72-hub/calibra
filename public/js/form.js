import { h, icon } from './ui.js';
import { state } from './state.js';

let uid = 0;

/**
 * Gera um formulário a partir da lista de campos.
 * fields: [{ name, label, type, required, options, max, min, full, help, placeholder, showIf }]
 * Tipos: text, plate, textarea, int, money, date, select, vehicle, heading
 */
export function buildForm(fields, values = {}, fixed = {}) {
  const id = `f${++uid}`;
  const ctrls = {}, wraps = {}, errs = {};
  const grid = h('div', { class: 'form-grid' });

  const cur = () => ({ ...Object.fromEntries(Object.entries(ctrls).map(([k, c]) => [k, c.value])), ...fixed });
  const refresh = () => { const c = cur(); for (const f of fields) if (f.showIf && wraps[f.name]) wraps[f.name].hidden = !f.showIf(c); };

  for (const f of fields) {
    if (f.name in fixed) continue;
    if (f.type === 'heading') { grid.append(h('div', { class: 'field heading' }, h('h3', null, f.text), f.help ? h('p', null, f.help) : null)); continue; }
    const v = values[f.name];
    const cid = `${id}-${f.name}`;
    let c;
    if (f.type === 'textarea') c = h('textarea', { class: 'textarea', id: cid, maxlength: f.max || 2000, placeholder: f.placeholder }, v ?? '');
    else if (f.type === 'select' || f.type === 'vehicle') {
      const opts = f.type === 'vehicle' ? state.vehicles.map((x) => [String(x.id), `${x.nickname} (${x.plate})`]) : f.options;
      let sel = v == null ? '' : String(v);
      if (f.type === 'vehicle' && !sel && state.vehicles.length === 1 && f.required) sel = String(state.vehicles[0].id);
      const ph = f.placeholder ?? (f.required ? (f.type === 'vehicle' ? 'Selecione o veículo' : 'Selecione') : (f.type === 'vehicle' ? 'Nenhum' : 'Não informado'));
      c = h('select', { class: 'select', id: cid }, (!f.required || !sel) ? h('option', { value: '' }, ph) : null,
        opts.map(([val, text]) => h('option', { value: val }, text)));
      c.value = sel;
    } else if (f.type === 'money') {
      c = h('input', { class: 'input num', id: cid, inputmode: 'decimal', placeholder: '0,00', autocomplete: 'off', value: v != null ? Number(v).toFixed(2).replace('.', ',') : '' });
    } else {
      const type = f.type === 'int' ? 'number' : f.type === 'date' ? 'date' : 'text';
      c = h('input', { class: 'input' + (f.type === 'int' ? ' num' : ''), id: cid, type, maxlength: f.max && type === 'text' ? f.max : null,
        min: f.type === 'int' ? (f.min ?? 0) : null, max: f.type === 'int' ? f.max : null, step: f.type === 'int' ? 1 : null,
        inputmode: f.type === 'int' ? 'numeric' : null, placeholder: f.placeholder, autocomplete: 'off', value: v ?? '' });
      if (f.type === 'plate') { c.addEventListener('input', () => { c.value = c.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); }); c.maxLength = 8; }
    }
    if (f.type === 'date' && v) c.value = String(v).slice(0, 10);
    c.addEventListener('input', () => { refresh(); wraps[f.name].classList.remove('invalid'); errs[f.name].textContent = ''; });
    c.addEventListener('change', refresh);
    const err = h('div', { class: 'err', role: 'alert' });
    ctrls[f.name] = c; errs[f.name] = err;
    wraps[f.name] = h('div', { class: `field ${f.full ? 'full' : ''}` },
      h('label', { for: cid }, f.label, f.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, '*') : null),
      f.type === 'money' ? h('div', { class: 'input-affix' }, h('span', null, 'R$'), c) : c,
      f.help ? h('div', { class: 'help' }, f.help) : null, err);
    grid.append(wraps[f.name]);
  }
  refresh();

  const form = h('form', { id, novalidate: true }, grid);

  function showErrors(errors = {}) {
    let first = null;
    for (const [name, msg] of Object.entries(errors)) {
      if (!wraps[name]) continue;
      wraps[name].classList.add('invalid'); errs[name].textContent = msg;
      first ||= ctrls[name];
    }
    first?.focus();
    return !!first;
  }

  function read() {
    const payload = { ...fixed }, errors = {};
    const c = cur();
    for (const f of fields) {
      if (f.name in fixed || f.type === 'heading') continue;
      if (f.showIf && !f.showIf(c)) { payload[f.name] = f.hiddenValue ?? null; continue; }
      const ctl = ctrls[f.name];
      const raw = ctl.type === 'password' ? String(ctl.value) : String(ctl.value ?? '').trim();
      if (!raw) { if (f.required) errors[f.name] = 'Campo obrigatório.'; payload[f.name] = null; continue; }
      if (f.type === 'int') {
        const n = Number(raw);
        if (!Number.isInteger(n)) errors[f.name] = 'Informe um número inteiro.';
        else if (n < (f.min ?? 0)) errors[f.name] = `Valor mínimo: ${f.min ?? 0}.`;
        else if (f.max != null && n > f.max) errors[f.name] = `Valor máximo: ${f.max}.`;
        payload[f.name] = n;
      } else if (f.type === 'money') {
        const n = Number(raw.replace(/\./g, '').replace(',', '.'));
        if (!Number.isFinite(n) || n < 0) errors[f.name] = 'Informe um valor válido.';
        payload[f.name] = n;
      } else if (f.type === 'plate') {
        const p = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p)) errors[f.name] = 'Placa inválida. Use AAA1234 ou AAA1B23.';
        payload[f.name] = p;
      } else if (f.type === 'select' || f.type === 'vehicle') {
        payload[f.name] = f.type === 'vehicle' || f.numeric ? Number(raw) : raw;
      } else payload[f.name] = raw;
    }
    return { payload, errors };
  }

  const firstInput = Object.values(ctrls)[0];
  return { el: form, id, read, showErrors, focus: () => firstInput?.focus() };
}

export const fieldIcon = icon;
