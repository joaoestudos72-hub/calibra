import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'calibra-'));
process.env.DATABASE_PATH = path.join(tmp, 't.db');
process.env.UPLOAD_DIR = path.join(tmp, 'up');
process.env.NODE_ENV = 'test';

let server, base;
before(async () => {
  const { buildApp } = await import('../server/app.js');
  server = http.createServer(buildApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); rmSync(tmp, { recursive: true, force: true }); });

class Client {
  cookie = '';
  async req(method, url, body, extra = {}) {
    const headers = { 'X-Requested-With': 'calibra', ...(this.cookie && { Cookie: this.cookie }), ...extra };
    let payload = body;
    if (body && !(body instanceof Buffer) && !extra['Content-Type']) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers, body: payload });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  }
}
const ymd = (offset) => { const d = new Date(Date.now() + offset * 864e5); return d.toISOString().slice(0, 10); };

function multipart(fields, file) {
  const b = '----t' + Math.random().toString(16).slice(2);
  const parts = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`), file.data, Buffer.from(`\r\n--${b}--\r\n`));
  return { body: Buffer.concat(parts), type: `multipart/form-data; boundary=${b}` };
}

const ana = new Client(), bruno = new Client();
let vid, mid;

test('cadastro, validação e sessão', async () => {
  let r = await ana.req('POST', '/api/auth/register', { name: 'Ana', email: 'ana@x.com', password: 'curta' });
  assert.equal(r.status, 422); assert.ok(r.data.details.password);
  r = await ana.req('POST', '/api/auth/register', { name: 'Ana', email: 'ana@x.com', password: 'senha1234' });
  assert.equal(r.status, 200); assert.equal(r.data.user.email, 'ana@x.com');
  r = await ana.req('GET', '/api/auth/me'); assert.equal(r.data.user.name, 'Ana');
  r = await bruno.req('POST', '/api/auth/register', { name: 'Bruno', email: 'bruno@x.com', password: 'senha1234' });
  assert.equal(r.status, 200);
  r = await new Client().req('GET', '/api/vehicles'); assert.equal(r.status, 401);
  r = await new Client().req('POST', '/api/auth/login', { email: 'ana@x.com', password: 'errada123' }); assert.equal(r.status, 401);
});

test('CSRF: mutação sem cabeçalho é bloqueada', async () => {
  const res = await fetch(base + '/api/vehicles', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ana.cookie }, body: '{}' });
  assert.equal(res.status, 403);
});

test('veículos: CRUD, validação de placa e duplicidade', async () => {
  let r = await ana.req('POST', '/api/vehicles', { nickname: 'Civic', plate: 'xx', model: 'Honda Civic', year: 2020, type: 'carro' });
  assert.equal(r.status, 422); assert.ok(r.data.details.plate);
  r = await ana.req('POST', '/api/vehicles', { nickname: 'Civic', plate: 'abc-1d23', model: 'Honda Civic', year: 2020, type: 'carro', odometer: 40000 });
  assert.equal(r.status, 200); assert.equal(r.data.plate, 'ABC1D23'); vid = r.data.id;
  r = await ana.req('POST', '/api/vehicles', { nickname: 'Outro', plate: 'ABC1D23', model: 'X', year: 2021, type: 'carro' });
  assert.equal(r.status, 409);
  r = await ana.req('PUT', `/api/vehicles/${vid}`, { nickname: 'Civic G10', plate: 'ABC1D23', model: 'Honda Civic', year: 2020, type: 'carro', odometer: 41000 });
  assert.equal(r.data.nickname, 'Civic G10');
});

test('isolamento entre usuários', async () => {
  let r = await bruno.req('GET', `/api/vehicles/${vid}`); assert.equal(r.status, 404);
  r = await bruno.req('PUT', `/api/vehicles/${vid}`, { nickname: 'x', plate: 'AAA1234', model: 'x', year: 2000, type: 'carro' }); assert.equal(r.status, 404);
  r = await bruno.req('DELETE', `/api/vehicles/${vid}`); assert.equal(r.status, 404);
  r = await bruno.req('POST', '/api/maintenances', { vehicle_id: vid, title: 'Hack', category: 'oleo', service_date: ymd(0) });
  assert.equal(r.status, 422);
  r = await bruno.req('GET', '/api/vehicles'); assert.equal(r.data.total, 0);
});

test('manutenção atualiza km, gera notificação e conclui', async () => {
  let r = await ana.req('POST', '/api/maintenances', { vehicle_id: vid, title: 'Troca de óleo', category: 'oleo', service_date: ymd(-30), odometer: 45000, cost: '250,90',
    next_due_date: ymd(2), next_due_km: 50000 });
  assert.equal(r.status, 200); assert.equal(r.data.cost, 250.9); mid = r.data.id;
  r = await ana.req('GET', `/api/vehicles/${vid}`); assert.equal(r.data.odometer, 45000);
  r = await ana.req('GET', '/api/notifications');
  const n = r.data.items.find((i) => i.kind === 'maintenance');
  assert.ok(n, 'deve notificar manutenção por data'); assert.equal(n.days_left, 2);
  assert.ok(!r.data.items.find((i) => i.kind === 'maintenance_km'));
  r = await ana.req('POST', `/api/notifications/${n.id}/snooze`, { days: 3 }); assert.equal(r.status, 200);
  r = await ana.req('GET', '/api/notifications'); assert.equal(r.data.items.length, 0); assert.equal(r.data.counts.snoozed, 1);
  r = await ana.req('POST', `/api/notifications/${n.id}/wake`); r = await ana.req('GET', '/api/notifications');
  r = await ana.req('POST', `/api/notifications/${r.data.items[0].id}/complete`);
  r = await ana.req('GET', '/api/notifications?state=done'); assert.equal(r.data.items.length, 1);
  r = await ana.req('GET', '/api/notifications'); assert.equal(r.data.items.length, 0, 'concluída não reaparece');
});

test('aviso por km quando o hodômetro se aproxima da meta', async () => {
  await ana.req('PUT', `/api/vehicles/${vid}`, { nickname: 'Civic G10', plate: 'ABC1D23', model: 'Honda Civic', year: 2020, type: 'carro', odometer: 49700 });
  const r = await ana.req('POST', '/api/maintenances', { vehicle_id: vid, title: 'Pneus', category: 'pneus', service_date: ymd(-1), cost: 1800, next_due_km: 49900 });
  const l = await ana.req('GET', '/api/notifications');
  assert.ok(l.data.items.find((i) => i.kind === 'maintenance_km'));
  assert.equal(r.status, 200);
});

test('lembrete recorrente de lavagem avança ao concluir', async () => {
  let r = await ana.req('POST', '/api/reminders', { kind: 'wash', title: 'Lavar o carro', due_date: ymd(1), recurrence: 'weekly' });
  assert.equal(r.status, 422, 'lavagem exige veículo');
  r = await ana.req('POST', '/api/reminders', { kind: 'wash', vehicle_id: vid, title: 'Lavar o carro', due_date: ymd(1), recurrence: 'weekly' });
  assert.equal(r.status, 200); const rid = r.data.id;
  r = await ana.req('GET', '/api/notifications'); const n = r.data.items.find((i) => i.kind === 'wash'); assert.ok(n);
  await ana.req('POST', `/api/notifications/${n.id}/complete`);
  r = await ana.req('GET', `/api/reminders/${rid}`);
  assert.equal(r.data.status, 'active'); assert.equal(r.data.due_date, ymd(8));
  r = await ana.req('POST', '/api/reminders', { kind: 'routine', title: 'Renovar CNH', category: 'pessoal', priority: 'alta', due_date: ymd(-2) });
  r = await ana.req('GET', '/api/notifications'); const late = r.data.items.find((i) => i.title === 'Renovar CNH');
  assert.equal(late.days_left, -2); assert.equal(r.data.counts.overdue >= 1, true);
});

test('multas: filtros, busca e notificações de vencimento e recurso', async () => {
  let r = await ana.req('POST', '/api/fines', { vehicle_id: vid, fine_date: ymd(-10), location: 'Av. Paulista', infraction: 'Excesso de velocidade', amount: 130.16, due_date: ymd(3), appeal_deadline: ymd(1) });
  assert.equal(r.status, 200); const fid = r.data.id;
  r = await ana.req('GET', '/api/notifications');
  assert.ok(r.data.items.find((i) => i.kind === 'fine_due')); assert.ok(r.data.items.find((i) => i.kind === 'fine_appeal'));
  r = await ana.req('GET', '/api/fines?q=paulista&status=pendente'); assert.equal(r.data.total, 1); assert.equal(r.data.sum, 130.16);
  r = await ana.req('GET', '/api/fines?q=inexistente'); assert.equal(r.data.total, 0);
  r = await ana.req('GET', '/api/fines?q=%25'); assert.equal(r.data.total, 0, 'curinga escapado');
  await ana.req('PUT', `/api/fines/${fid}`, { vehicle_id: vid, fine_date: ymd(-10), infraction: 'Excesso de velocidade', amount: 130.16, due_date: ymd(3), appeal_deadline: ymd(1), status: 'paga' });
  r = await ana.req('GET', '/api/notifications'); assert.ok(!r.data.items.find((i) => i.kind.startsWith('fine')), 'paga remove avisos');
});

test('anexos: validação por conteúdo, download e isolamento', async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
  let m = multipart({ entity_type: 'maintenance', entity_id: mid }, { name: 'nota.png', type: 'image/png', data: png });
  let r = await ana.req('POST', '/api/attachments', m.body, { 'Content-Type': m.type });
  assert.equal(r.status, 200); assert.equal(r.data.mime, 'image/png'); const aid = r.data.id;
  m = multipart({ entity_type: 'maintenance', entity_id: mid }, { name: 'virus.pdf', type: 'application/pdf', data: Buffer.from('MZ<script>alert(1)</script> executavel falso') });
  r = await ana.req('POST', '/api/attachments', m.body, { 'Content-Type': m.type }); assert.equal(r.status, 415);
  m = multipart({ entity_type: 'maintenance', entity_id: mid }, { name: 'n.png', type: 'image/png', data: png });
  r = await bruno.req('POST', '/api/attachments', m.body, { 'Content-Type': m.type }); assert.equal(r.status, 404);
  r = await bruno.req('GET', `/api/attachments/${aid}/file`); assert.equal(r.status, 404);
  r = await ana.req('GET', `/api/attachments/${aid}/file`); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png');
  r = await ana.req('GET', `/api/maintenances`); assert.equal(r.data.items.find((i) => i.id === mid).attachment_count, 1);
});

test('dashboard e histórico do veículo', async () => {
  let r = await ana.req('GET', '/api/dashboard');
  assert.equal(r.status, 200); assert.equal(r.data.vehicles.length, 1);
  assert.ok(r.data.spending.month_total > 0); assert.equal(r.data.spending.by_month.length, 6);
  r = await ana.req('GET', `/api/vehicles/${vid}/summary`); assert.ok(r.data.history.length >= 2);
});

test('excluir veículo remove dados, anexos e notificações; excluir conta', async () => {
  let r = await ana.req('DELETE', `/api/vehicles/${vid}`); assert.equal(r.status, 204);
  r = await ana.req('GET', '/api/maintenances'); assert.equal(r.data.total, 0);
  r = await ana.req('GET', '/api/notifications?state=all'); assert.ok(!r.data.items.some((i) => i.kind.startsWith('fine') || i.kind.startsWith('maintenance')));
  r = await ana.req('DELETE', '/api/auth/account', { password: 'errada' }); assert.equal(r.status, 422);
  r = await ana.req('DELETE', '/api/auth/account', { password: 'senha1234' }); assert.equal(r.status, 204);
  r = await ana.req('GET', '/api/auth/me'); assert.equal(r.data.user, null);
});

test('arquivos estáticos e cabeçalhos de segurança', async () => {
  const res = await fetch(base + '/../server/config.js');
  assert.notEqual(res.status, 200);
  const r2 = await fetch(base + '/api/auth/me');
  assert.equal(r2.headers.get('x-content-type-options'), 'nosniff');
});
