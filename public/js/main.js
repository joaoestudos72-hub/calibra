import { api } from './api.js';
import { state, subscribe, emit, applyTheme, effectiveTheme, refreshVehicles, refreshNotifCount } from './state.js';
import { h, icon, logoSvg, skeleton, empty } from './ui.js';
import { authView } from './views/auth.js';
import { dashboardView } from './views/dashboard.js';
import { vehiclesView, vehicleDetailView } from './views/vehicles.js';
import { maintenancePage, expensesPage, finesPage, routinePage, washesPage } from './views/pages.js';
import { notificationsView } from './views/notifications.js';
import { settingsView, saveProfile } from './views/settings.js';

const root = document.getElementById('root');
let seq = 0;

const NAV = [
  ['/', 'Painel', 'home', 'Painel'], ['/vehicles', 'Veículos', 'car', 'Veículos'], ['/maintenance', 'Manutenções', 'wrench', 'Manutenções'],
  ['/expenses', 'Gastos', 'wallet', 'Gastos'], ['/washes', 'Lavagens', 'drop', 'Lavagens'], ['/fines', 'Multas', 'alert', 'Multas'],
  ['/routine', 'Rotina', 'calendar', 'Rotina'], ['/notifications', 'Notificações', 'bell', 'Notificações'],
];

// [padrão, título, função que devolve o Node (ou Promise<Node>)]
const ROUTES = [
  [/^\/$/, 'Painel', () => dashboardView()],
  [/^\/vehicles$/, 'Veículos', () => vehiclesView()],
  [/^\/vehicles\/(\d+)(?:\/(\w+))?$/, 'Veículo', (m) => vehicleDetailView({ id: m[1], tab: m[2] || '' })],
  [/^\/maintenance$/, 'Manutenções', () => maintenancePage()],
  [/^\/expenses$/, 'Gastos', () => expensesPage()],
  [/^\/washes(?:\/(reminders))?$/, 'Lavagens', (m) => washesPage(m[1])],
  [/^\/fines$/, 'Multas', () => finesPage()],
  [/^\/routine$/, 'Rotina', () => routinePage()],
  [/^\/notifications$/, 'Notificações', () => notificationsView()],
  [/^\/settings$/, 'Configurações', () => settingsView(logout)],
];

let shell = null;

function buildShell() {
  const badge = () => h('span', { class: 'badge', hidden: true });
  const navLinks = NAV.map(([path, text, ic]) => h('a', { href: `#${path}`, 'data-path': path }, icon(ic), h('span', null, text), path === '/notifications' ? badge() : null));
  const side = h('aside', { class: 'side', id: 'side', 'aria-label': 'Menu principal' },
    h('a', { class: 'brand', href: '#/', style: { 'text-decoration': 'none' } }, logoSvg(), h('span', null, 'Calibra')),
    h('nav', { class: 'nav' }, navLinks, h('hr'), h('a', { href: '#/settings', 'data-path': '/settings' }, icon('sliders'), h('span', null, 'Configurações'))),
    h('div', { class: 'me' }, h('div', { class: 'avatar', id: 'avatar' }), h('div', { class: 'who' }, h('b', { id: 'who-name' }), h('span', { id: 'who-mail' })),
      h('button', { type: 'button', 'aria-label': 'Sair', title: 'Sair', onclick: logout }, icon('logout'))));
  const scrim = h('div', { class: 'scrim', onclick: () => side.classList.remove('open') });

  const themeBtn = () => h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Alternar tema', onclick: async () => {
    try { await saveProfile({ theme: effectiveTheme() === 'dark' ? 'light' : 'dark' }); } catch { /* ignora */ }
  } }, icon('moon', 'theme-ic'));
  const bell = () => h('a', { class: 'icon-btn', href: '#/notifications', 'aria-label': 'Notificações' }, icon('bell'), h('span', { class: 'pip', hidden: true }));

  const content = h('div', { class: 'content', id: 'content' });
  const main = h('div', { class: 'main' },
    h('header', { class: 'topbar' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Abrir menu', onclick: () => side.classList.add('open') }, icon('menu')),
      h('div', { class: 'brand' }, logoSvg(), 'Calibra'), bell(), themeBtn()),
    h('div', { class: 'tools' }, bell(), themeBtn()),
    h('main', null, content));

  const dot = h('span', { class: 'dot', hidden: true });
  const bottom = h('nav', { class: 'bottomnav', 'aria-label': 'Atalhos' },
    ...[['/', 'Painel', 'home'], ['/vehicles', 'Veículos', 'car'], ['/notifications', 'Avisos', 'bell'], ['/routine', 'Rotina', 'calendar']].map(([p, t, ic]) =>
      h('a', { href: `#${p}`, 'data-path': p }, icon(ic), t, p === '/notifications' ? dot : null)),
    h('button', { type: 'button', onclick: () => side.classList.add('open') }, icon('menu'), 'Menu'));

  const el = h('div', { class: 'app' }, side, main, scrim);
  document.body.append(bottom);

  const paint = () => {
    const n = state.notif.active;
    for (const b of el.querySelectorAll('.badge, .pip')) { b.hidden = !n; b.textContent = n > 99 ? '99+' : n; }
    dot.hidden = !n; dot.textContent = n > 99 ? '99+' : n;
    document.getElementById('who-name').textContent = state.user.name;
    document.getElementById('who-mail').textContent = state.user.email;
    document.getElementById('avatar').textContent = state.user.name.trim().charAt(0).toUpperCase();
    const dark = effectiveTheme() === 'dark';
    for (const i of el.querySelectorAll('.theme-ic')) i.replaceWith(icon(dark ? 'sun' : 'moon', 'theme-ic'));
  };
  const unsub = subscribe(paint);
  return { el, content, side, bottom, paint, destroy: () => { unsub(); bottom.remove(); } };
}

async function route() {
  if (!state.user || !shell) return;
  const path = (location.hash.slice(1) || '/').split('?')[0];
  const my = ++seq;
  shell.side.classList.remove('open');
  for (const a of document.querySelectorAll('[data-path]')) {
    const p = a.dataset.path;
    const on = p === '/' ? path === '/' : path === p || path.startsWith(p + '/');
    a.classList.toggle('active', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  }
  const found = ROUTES.map(([re, title, fn]) => [re.exec(path), title, fn]).find(([m]) => m);
  shell.content.replaceChildren(skeleton(3));
  let node;
  try {
    if (!found) node = h('div', { class: 'card' }, empty({ iconName: 'alert', title: 'Página não encontrada', text: 'O endereço não existe.', action: h('a', { class: 'btn', href: '#/' }, 'Ir para o painel') }));
    else { if (!state.vehicles.length && path !== '/vehicles' && !/^\/vehicles\//.test(path)) await refreshVehicles().catch(() => {}); node = await found[2](found[0]); }
  } catch (e) {
    if (e.status === 401) return;
    node = h('div', { class: 'card' }, empty({ iconName: 'alert', title: e.status === 404 ? 'Não encontrado' : 'Não foi possível carregar', text: e.message, action: h('button', { class: 'btn ghost', onclick: route }, 'Tentar novamente') }));
  }
  if (my !== seq) return;
  node.classList.add('view-enter');
  shell.content.replaceChildren(node);
  document.title = `${found ? found[1] : 'Calibra'} · Calibra`;
  window.scrollTo(0, 0);
}

function showApp() {
  root.replaceChildren();
  shell?.destroy();
  shell = buildShell();
  root.append(shell.el);
  applyTheme(state.user.theme);
  emit();
  refreshVehicles().catch(() => {}); refreshNotifCount();
  route();
}

function showAuth() {
  shell?.destroy(); shell = null;
  state.user = null; state.vehicles = []; state.notif = { active: 0, overdue: 0 };
  applyTheme('system');
  document.title = 'Entrar · Calibra';
  root.replaceChildren(authView((user) => { state.user = user; location.hash = '#/'; showApp(); }));
}

async function logout() {
  try { await api.post('/auth/logout'); } catch { /* sessão já encerrada */ }
  showAuth();
}

window.addEventListener('hashchange', route);
window.addEventListener('calibra:unauth', () => { if (state.user) showAuth(); });
setInterval(() => { if (state.user && !document.hidden) refreshNotifCount(); }, 60_000);
document.addEventListener('visibilitychange', () => { if (state.user && !document.hidden) refreshNotifCount(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.user) emit(); });

(async function boot() {
  try {
    const { user } = await api.get('/auth/me');
    state.user = user;
  } catch { state.user = null; }
  state.user ? showApp() : showAuth();
})();
