import { api } from './api.js';
import { h, icon, toast, confirmDialog } from './ui.js';

const ALLOWED = /\.(pdf|jpe?g|png|webp)$/i;
const MAX = 10 * 1024 * 1024;
const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Bloco de anexos do formulário: lista os existentes, permite remover e enfileira novos arquivos. */
export function attachmentsWidget({ entity, id }) {
  const pending = [];
  const existing = h('div');
  const queued = h('div');
  const input = h('input', { type: 'file', accept: '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*', multiple: true, class: 'sr-only', id: `file-${Math.random().toString(36).slice(2)}` });

  const fileRow = (name, meta, thumb, actions) =>
    h('div', { class: 'file' }, thumb, h('div', { class: 'nm' }, name, meta ? h('div', { class: 'sz' }, meta) : null), actions);

  async function loadExisting() {
    if (!id) return;
    try {
      const { items } = await api.get(`/attachments?entity_type=${entity}&entity_id=${id}`);
      existing.replaceChildren(...items.map((a) => {
        const url = `/api/attachments/${a.id}/file`;
        const thumb = a.mime === 'application/pdf' ? h('div', { class: 'ico' }, 'PDF') : h('img', { src: url, alt: '', loading: 'lazy' });
        const del = h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': `Remover ${a.original_name}`, onclick: async () => {
          if (!(await confirmDialog({ title: 'Remover anexo', message: `Remover "${a.original_name}"? Esta ação não pode ser desfeita.`, confirmLabel: 'Remover', danger: true }))) return;
          try { await api.del(`/attachments/${a.id}`); toast('Anexo removido'); loadExisting(); } catch (e) { toast(e.message, 'err'); }
        } }, icon('trash'));
        return fileRow(h('a', { href: url, target: '_blank', rel: 'noopener' }, a.original_name), size(a.size), thumb, del);
      }));
    } catch (e) { existing.replaceChildren(h('p', { class: 'small muted' }, e.message)); }
  }

  function renderQueue() {
    queued.replaceChildren(...pending.map((f, i) => fileRow(f.name, `${size(f.size)} · será enviado ao salvar`,
      f.type === 'application/pdf' ? h('div', { class: 'ico' }, 'PDF') : h('div', { class: 'ico' }, 'IMG'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remover da fila', onclick: () => { pending.splice(i, 1); renderQueue(); } }, icon('x')))));
  }

  input.addEventListener('change', () => {
    for (const f of input.files) {
      if (!ALLOWED.test(f.name)) { toast(`"${f.name}": envie PDF, JPG, PNG ou WebP.`, 'err'); continue; }
      if (f.size > MAX) { toast(`"${f.name}" passa de 10 MB.`, 'err'); continue; }
      pending.push(f);
    }
    input.value = ''; renderQueue();
  });

  loadExisting();
  const el = h('div', { class: 'attach full' },
    h('h4', null, 'Notas fiscais e comprovantes'),
    existing, queued,
    h('label', { class: 'btn ghost sm', for: input.id }, icon('upload'), 'Adicionar PDF ou imagem'), input,
    h('p', { class: 'small muted', style: { 'margin-top': '8px' } }, 'PDF, JPG, PNG ou WebP, até 10 MB cada.'));

  async function uploadPending(entityId) {
    let failed = 0;
    for (const f of pending) {
      const fd = new FormData();
      fd.append('entity_type', entity); fd.append('entity_id', String(entityId)); fd.append('file', f, f.name);
      try { await api.upload('/attachments', fd); } catch (e) { failed++; toast(`${f.name}: ${e.message}`, 'err'); }
    }
    pending.length = 0;
    return failed;
  }
  return { el, uploadPending, hasPending: () => pending.length > 0 };
}
