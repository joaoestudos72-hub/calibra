import { config } from '../config.js';

const toMs = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Data de hoje (YYYY-MM-DD) no fuso configurado. */
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(toMs(s)) === s;
export const addDays = (s, n) => fmt(toMs(s) + n * 864e5);
export const diffDays = (a, b) => Math.round((toMs(a) - toMs(b)) / 864e5);

export function addMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12), nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return fmt(Date.UTC(ny, nm, Math.min(d, last)));
}

/** Próxima ocorrência de uma recorrência (ou null se 'none'). */
export function advance(s, recurrence, n = 1) {
  switch (recurrence) {
    case 'daily': return addDays(s, n);
    case 'weekly': return addDays(s, 7 * n);
    case 'monthly': return addMonths(s, n);
    case 'yearly': return addMonths(s, 12 * n);
    default: return null;
  }
}
