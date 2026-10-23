import { api } from '../api.js';
import { state, applyTheme, emit } from '../state.js';
import { L } from '../labels.js';
import { h, icon, toast, setBusy, confirmDialog, openModal } from '../ui.js';
import { buildForm } from '../form.js';

const THEMES = [['light', 'Claro', 'sun'], ['dark', 'Escuro', 'moon'], ['system', 'Sistema', 'gauge']];

export async function saveProfile(patch) {
  const u = state.user;
  const { user } = await api.put('/auth/profile', { name: u.name, theme: u.theme, notify_days: u.notify_days, ...patch });
  state.user = user; applyTheme(user.theme); emit();
  return user;
}

export function settingsView(onLogout) {
  const u = state.user;

  // Perfil
  const profile = buildForm([{ name: 'name', label: 'Nome', type: 'text', required: true, max: 80, full: true }], { name: u.name });
  const saveBtn = h('button', { class: 'btn', type: 'submit', form: profile.id }, 'Salvar perfil');
  profile.el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { payload, errors } = profile.read();
    if (Object.keys(errors).length) return void profile.showErrors(errors);
    setBusy(saveBtn, true);
    try { await saveProfile({ name: payload.name }); toast('Perfil atualizado'); } catch (err) { toast(err.message, 'err'); }
    setBusy(saveBtn, false);
  });

  // Tema
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Tema' });
  const drawSeg = () => seg.replaceChildren(...THEMES.map(([k, t, ic]) => h('button', { type: 'button', 'aria-pressed': String(state.user.theme === k), onclick: async () => {
    try { await saveProfile({ theme: k }); drawSeg(); } catch (e) { toast(e.message, 'err'); }
  } }, icon(ic), t)));
  drawSeg();

  // Antecedência padrão
  const lead = h('select', { class: 'select', 'aria-label': 'Antecedência padrão', style: { 'max-width': '240px' }, value: String(u.notify_days), onchange: async (e) => {
    try { await saveProfile({ notify_days: Number(e.target.value) }); toast('Antecedência atualizada'); } catch (err) { toast(err.message, 'err'); }
  } }, L.notifyDefault.map(([v, t]) => h('option', { value: v }, t)));

  // Senha
  const pw = buildForm([
    { name: 'current', label: 'Senha atual', type: 'text', required: true, max: 128, full: true },
    { name: 'next', label: 'Nova senha', type: 'text', required: true, max: 128, full: true, help: 'Mínimo de 8 caracteres, com letras e números.' },
  ], {});
  pw.el.querySelectorAll('input').forEach((i) => { i.type = 'password'; i.autocomplete = i.id.endsWith('current') ? 'current-password' : 'new-password'; });
  const pwBtn = h('button', { class: 'btn', type: 'submit', form: pw.id }, 'Alterar senha');
  pw.el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { payload, errors } = pw.read();
    if (Object.keys(errors).length) return void pw.showErrors(errors);
    setBusy(pwBtn, true);
    try { await api.put('/auth/password', payload); toast('Senha alterada. Entre novamente.'); onLogout(); }
    catch (err) { setBusy(pwBtn, false); if (!pw.showErrors(err.details)) toast(err.message, 'err'); }
  });

  async function deleteAccount() {
    const f = buildForm([{ name: 'password', label: 'Confirme sua senha', type: 'text', required: true, max: 128, full: true }], {});
    f.el.querySelector('input').type = 'password';
    const go = h('button', { class: 'btn danger', type: 'submit', form: f.id }, 'Excluir conta definitivamente');
    const m = openModal({ title: 'Excluir conta', narrow: true,
      body: h('div', { class: 'modal-body stack' }, h('p', null, 'Todos os seus veículos, registros e anexos serão apagados para sempre. Considere exportar seus dados antes.'), f.el),
      footer: h('div', { class: 'modal-foot' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Cancelar'), go) });
    f.el.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { payload, errors } = f.read();
      if (Object.keys(errors).length) return void f.showErrors(errors);
      setBusy(go, true, 'Excluindo…');
      try { await api.del('/auth/account', payload); m.close(); onLogout(); }
      catch (err) { setBusy(go, false); if (!f.showErrors(err.details)) toast(err.message, 'err'); }
    });
  }

  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Configurações'), h('p', null, 'Perfil, aparência, avisos e segurança da sua conta.'))),
    h('div', { class: 'settings' },
      h('section', { class: 'card card-pad' }, h('h2', null, 'Perfil'), h('p', { class: 'muted' }, u.email), profile.el, h('div', { class: 'row', style: { 'margin-top': '14px' } }, saveBtn)),
      h('section', { class: 'card card-pad' }, h('h2', null, 'Aparência'), h('p', { class: 'muted' }, 'Escolha o tema da interface.'), seg),
      h('section', { class: 'card card-pad' }, h('h2', null, 'Antecedência dos avisos'),
        h('p', { class: 'muted' }, 'Quanto tempo antes de cada data o Calibra começa a avisar. Você pode ajustar item a item nos formulários.'), lead),
      h('section', { class: 'card card-pad' }, h('h2', null, 'Senha'), h('p', { class: 'muted' }, 'Ao trocar a senha, você será desconectado de todos os dispositivos.'), pw.el, h('div', { class: 'row', style: { 'margin-top': '14px' } }, pwBtn)),
      h('section', { class: 'card card-pad' }, h('h2', null, 'Seus dados'),
        h('p', { class: 'muted' }, 'Baixe uma cópia de tudo que você cadastrou ou exclua sua conta.'),
        h('div', { class: 'row wrap' }, h('a', { class: 'btn ghost', href: '/api/auth/export', download: 'calibra-meus-dados.json' }, icon('download'), 'Exportar meus dados'),
          h('button', { class: 'btn ghost danger', type: 'button', onclick: deleteAccount }, icon('trash'), 'Excluir conta')))));
}
void confirmDialog;
