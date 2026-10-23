import { h, brl, brlShort, monthShort } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  kids.forEach((k) => el.append(k instanceof Node ? k : document.createTextNode(k)));
  return el;
};
export const SPEND_KINDS = [['maintenance', 'Manutenção'], ['expenses', 'Gastos'], ['washes', 'Lavagens'], ['fines', 'Multas']];

/** Barras empilhadas dos últimos meses (SVG puro, sem biblioteca). */
export function spendChart(byMonth) {
  const W = 540, H = 230, top = 26, bottom = 28, left = 6, right = 6;
  const max = Math.max(...byMonth.map((m) => m.total), 0);
  if (!max) return h('p', { class: 'muted', style: { padding: '28px 0', 'text-align': 'center' } }, 'Ainda não há gastos nos últimos 6 meses.');
  const nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p * 2) / 2 * p; })();
  const ch = H - top - bottom, band = (W - left - right) / byMonth.length, bw = Math.min(46, band * 0.58);
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Gastos por mês nos últimos 6 meses' });
  for (let i = 0; i <= 3; i++) { const y = top + ch - (ch * i) / 3; svg.append(s('line', { class: 'grid', x1: left, x2: W - right, y1: y, y2: y })); }
  byMonth.forEach((m, i) => {
    const x = left + band * i + (band - bw) / 2;
    let y = top + ch;
    const g = s('g', { class: 'col' }, s('title', {}, `${monthShort(m.month)}: ${brl(m.total)}`));
    for (const [k] of SPEND_KINDS) {
      const hgt = (m[k] / nice) * ch;
      if (hgt > 0) { y -= hgt; g.append(s('rect', { class: `bar k-${k}`, x, y, width: bw, height: Math.max(hgt, 1), rx: 3 })); }
    }
    if (m.total > 0) g.append(s('text', { class: 'tot', x: x + bw / 2, y: y - 7, 'text-anchor': 'middle' }, brlShort(m.total).replace('R$ ', '')));
    g.append(s('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle' }, monthShort(m.month)));
    svg.append(g);
  });
  return svg;
}

export const chartLegend = () => h('div', { class: 'legend' }, SPEND_KINDS.map(([k, t]) => h('span', null, h('i', { class: `k-${k}` }), t)));
