// Utilitários de interface: criação de DOM segura (sem innerHTML com dados), ícones, formatação, modal e toast.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') continue;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  if (props && props.value !== undefined && props.value !== null) el.value = props.value;
  return el;
}

const ICONS = {
  home: '<rect x="3" y="3" width="7" height="9" rx="1.8"/><rect x="14" y="3" width="7" height="5" rx="1.8"/><rect x="14" y="12" width="7" height="9" rx="1.8"/><rect x="3" y="16" width="7" height="5" rx="1.8"/>',
  car: '<path d="M3 13l2-6a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 7l2 6v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h18"/><circle cx="7.5" cy="15.5" r=".5"/><circle cx="16.5" cy="15.5" r=".5"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1"/>',
  drop: '<path d="M12 3s6 6.2 6 10.5a6 6 0 0 1-12 0C6 9.2 12 3 12 3z"/>',
  alert: '<path d="M10.3 3.9L2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 3v3M16 3v3M9 15l2 2 4-4"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a2 2 0 0 0 3.4 0"/>',
  sliders: '<path d="M4 6h8M16 6h4M4 12h4M12 12h8M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>', pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  clip: '<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  logout: '<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M15 8l4 4-4 4M19 12H9"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>', upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>', download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  repeat: '<path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4"/>',
  gauge: '<path d="M4.5 18a9 9 0 1 1 15 0"/><path d="M12 14l4-5"/>', pin: '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.4 0-2.5.7-2.5 1.800 0 2.600 5 1.300 5 3.900 0 1.100-1.100 1.800-2.500 1.800-1.100 0-2.100-.5-2.600-1.300M12 6.500v1.500M12 16v1.500"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', tool: '<path d="M4 20l6-6M14 4l6 6-3 3-6-6z"/>', shield: '<path d="M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6z"/>',
};
export function icon(name, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return t.content.firstChild;
}
export const logoSvg = () => {
  const t = document.createElement('template');
  t.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7.500 24.500a11.500 11.500 0 1 1 17 0" fill="none" stroke="#4fd1b5" stroke-width="3" stroke-linecap="round"/><path d="M16 19l5.500-7.500" stroke="#f0a43a" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="19" r="2.400" fill="#f0a43a"/></svg>';
  return t.content.firstChild;
};

// ---------- Formatação ----------
const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (n) => brlFmt.format(n || 0);
export const brlShort = (n) => (n >= 1000 ? `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brlFmt.format(n || 0).replace(/,00$/, ''));
export const km = (n) => (n == null ? '' : `${Number(n).toLocaleString('pt-BR')} km`);
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const monthShort = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1];
export function dateBR(iso, withYear = true) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const thisYear = new Date().getFullYear();
  return `${d} ${MONTHS[m - 1]}${withYear && y !== thisYear ? ' ' + y : ''}`;
}
export const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export function dueText(days) {
  if (days == null) return '';
  if (days < -1) return `atrasado há ${-days} dias`;
  if (days === -1) return 'atrasado desde ontem';
  if (days === 0) return 'vence hoje';
  if (days === 1) return 'vence amanhã';
  return `em ${days} dias`;
}
export const dueTone = (days) => (days == null ? '' : days < 0 ? 'danger' : days <= 3 ? 'warn' : '');
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------- Componentes visuais ----------
export const plate = (p) => h('span', { class: 'plate', title: 'Placa' }, h('i', null, 'BRASIL'), h('b', null, p.length === 7 ? `${p.slice(0, 3)}${p[3]}${p.slice(4)}` : p));
export function odometer(value) {
  const digits = String(Math.min(Number(value) || 0, 999999)).padStart(6, '0').split('');
  return h('span', { class: 'odo num', title: `${km(value)}`, 'aria-label': km(value) }, digits.map((d) => h('span', null, d)), h('em', null, 'km'));
}
export const chip = (text, tone = '', ic) => h('span', { class: `chip ${tone}` }, ic ? icon(ic) : null, text);
export function empty({ iconName = 'list', title, text, action }) {
  return h('div', { class: 'empty' }, h('div', { class: 'tile' }, icon(iconName, '')), h('h3', null, title), text ? h('p', null, text) : null, action || null);
}
export const skeleton = (n = 4) => h('div', null, Array.from({ length: n }, () => h('div', { class: 'skeleton' })));

// ---------- Toast ----------
export function toast(message, type = 'ok') {
  const box = document.getElementById('toasts');
  const el = h('div', { class: `toast ${type === 'err' ? 'err' : ''}`, role: type === 'err' ? 'alert' : 'status' }, icon(type === 'err' ? 'alert' : 'check'), message);
  box.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, type === 'err' ? 5500 : 3200);
}

// ---------- Modal (<dialog> nativo: foco preso, ESC fecha) ----------
export function openModal({ title, body, footer, narrow = false, onClose }) {
  const dlg = h('dialog', { class: `modal ${narrow ? 'narrow' : ''}`, 'aria-label': title });
  const close = () => dlg.close();
  dlg.append(
    h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar', onclick: close }, icon('x'))),
    body,
  );
  if (footer) dlg.append(footer);
  dlg.addEventListener('close', () => { dlg.remove(); onClose?.(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
  return { el: dlg, close };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const cancel = h('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Cancelar');
    const ok = h('button', { class: `btn ${danger ? 'danger' : ''}`, type: 'button', onclick: () => { result = true; m.close(); } }, confirmLabel);
    const m = openModal({
      title, narrow: true, onClose: () => resolve(result),
      body: h('div', { class: 'modal-body' }, h('p', null, message)),
      footer: h('div', { class: 'modal-foot' }, cancel, ok),
    });
    cancel.focus();
  });
}

export function setBusy(btn, busy, label) {
  if (busy) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.replaceChildren(h('span', { class: 'spin' }), label || 'Salvando…'); }
  else { btn.disabled = false; btn.replaceChildren(btn.dataset.label || ''); }
}

export function daysUntil(iso) {
  if (!iso) return null;
  const p = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(iso) - p(todayISO())) / 864e5);
}
