import { api } from '../api.js';
import { h, icon, logoSvg, setBusy } from '../ui.js';
import { buildForm } from '../form.js';

const NS = 'http://www.w3.org/2000/svg';
function dial() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'dial'); svg.setAttribute('viewBox', '0 0 420 420'); svg.setAttribute('aria-hidden', 'true');
  const add = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); svg.append(e); return e; };
  add('circle', { cx: 210, cy: 210, r: 190, fill: 'none', stroke: '#1f2f36', 'stroke-width': 2 });
  for (let i = 0; i <= 54; i++) {
    const a = (-225 + (i * 270) / 54) * (Math.PI / 180), major = i % 9 === 0, r1 = major ? 150 : 164, r2 = 178;
    add('line', { x1: 210 + r1 * Math.cos(a), y1: 210 + r1 * Math.sin(a), x2: 210 + r2 * Math.cos(a), y2: 210 + r2 * Math.sin(a), stroke: major ? '#4fd1b5' : '#2b3e46', 'stroke-width': major ? 3 : 2, 'stroke-linecap': 'round' });
  }
  const g = add('g', { class: 'needle' });
  const l = document.createElementNS(NS, 'line');
  for (const [k, v] of Object.entries({ x1: 210, y1: 210, x2: 210, y2: 62, stroke: '#f0a43a', 'stroke-width': 5, 'stroke-linecap': 'round' })) l.setAttribute(k, v);
  g.append(l);
  add('circle', { cx: 210, cy: 210, r: 12, fill: '#f0a43a' });
  return svg;
}

export function authView(onAuth) {
  let mode = 'login';
  const formBox = h('div');
  const root = h('div', { class: 'auth' },
    h('aside', { class: 'auth-art' },
      h('div', { class: 'brand' }, logoSvg(), 'Calibra'),
      h('div', null, h('h2', null, 'Seu veículo e sua rotina, sempre no ponto.'),
        h('p', null, 'Manutenções, lavagens, multas e compromissos com avisos na hora certa e tudo guardado no mesmo lugar.')),
      dial()),
    h('main', { class: 'auth-form' }, formBox));

  function render() {
    const reg = mode === 'register';
    const f = buildForm([
      reg ? { name: 'name', label: 'Nome', type: 'text', required: true, max: 80, full: true } : null,
      { name: 'email', label: 'E-mail', type: 'text', required: true, max: 254, full: true },
      { name: 'password', label: 'Senha', type: 'text', required: true, max: 128, full: true, help: reg ? 'Mínimo de 8 caracteres, com letras e números.' : null },
    ].filter(Boolean), {});
    const inputs = f.el.querySelectorAll('input');
    inputs.forEach((i) => {
      if (i.id.endsWith('email')) { i.type = 'email'; i.autocomplete = 'email'; }
      if (i.id.endsWith('password')) { i.type = 'password'; i.autocomplete = reg ? 'new-password' : 'current-password'; }
      if (i.id.endsWith('name')) i.autocomplete = 'name';
    });
    const banner = h('div', { class: 'form-error', role: 'alert', hidden: true });
    const btn = h('button', { class: 'btn block', type: 'submit', form: f.id }, reg ? 'Criar conta' : 'Entrar');
    f.el.addEventListener('submit', async (e) => {
      e.preventDefault(); banner.hidden = true;
      const { payload, errors } = f.read();
      if (!errors.email && payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) errors.email = 'Informe um e-mail válido.';
      if (Object.keys(errors).length) return void f.showErrors(errors);
      setBusy(btn, true, reg ? 'Criando conta…' : 'Entrando…');
      try { const { user } = await api.post(reg ? '/auth/register' : '/auth/login', payload); onAuth(user); }
      catch (err) { setBusy(btn, false); if (!f.showErrors(err.details)) { banner.textContent = err.message; banner.hidden = false; } }
    });
    formBox.replaceChildren(h('div', { class: 'auth-box' },
      h('div', { class: 'brand', style: { color: 'var(--ink)', 'padding-left': '0' } }, logoSvg(), 'Calibra'),
      h('h1', { style: { 'margin-top': '22px' } }, reg ? 'Crie sua conta' : 'Bem-vindo de volta'),
      h('p', { class: 'lead' }, reg ? 'Leva menos de um minuto. Sem cartão de crédito.' : 'Entre para ver seus veículos e avisos.'),
      h('div', { class: 'stack' }, banner, f.el, btn),
      h('p', { class: 'alt' }, reg ? 'Já tem conta? ' : 'Ainda não tem conta? ',
        h('a', { href: '#', onclick: (e) => { e.preventDefault(); mode = reg ? 'login' : 'register'; render(); } }, reg ? 'Entrar' : 'Criar conta grátis'))));
    setTimeout(() => f.focus(), 30);
  }
  render();
  void icon;
  return root;
}
