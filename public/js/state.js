import { api } from './api.js';

// Estado global mínimo: usuário logado, lista de veículos (usada em selects) e contador de notificações.
export const state = { user: null, vehicles: [], notif: { active: 0, overdue: 0 } };
const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const emit = () => listeners.forEach((fn) => fn(state));

export async function refreshVehicles() {
  state.vehicles = (await api.get('/vehicles?limit=200')).items;
  emit();
}
export async function refreshNotifCount() {
  try { state.notif = await api.get('/notifications/count'); emit(); } catch { /* ignora falhas silenciosas do polling */ }
}

export function applyTheme(pref) {
  document.documentElement.dataset.theme = pref || 'system';
  const dark = pref === 'dark' || (pref !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a1013' : '#0f1a1f');
}
export const effectiveTheme = () => {
  const t = state.user?.theme || 'system';
  return t === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
};
