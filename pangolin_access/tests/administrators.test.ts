import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Administrators, eligibleUsers, coreUserDirectory } from '../server/administrators.js';
import { createApp } from '../server/app.js';
const a = 'a'.repeat(32), b = 'b'.repeat(32), c = 'c'.repeat(32);
const raw = (id: string, changes = {}) => ({ id, name: 'Fixture administrator', is_owner: false, is_active: true, system_generated: false, group_ids: ['system-admin'], credentials: ['excluded'], ...changes });
test('directory validates eligibility and strips unrelated account details', () => {
  assert.deepEqual(eligibleUsers([raw(a), raw(b, { group_ids: [] }), raw(c, { is_active: false })]), [{ id: a, name: 'Fixture administrator' }]);
  assert.equal(eligibleUsers([raw(a, { system_generated: true })]).length, 0);
  assert.equal(eligibleUsers([raw(a, { is_owner: true, group_ids: [] })]).length, 1);
  assert.throws(() => eligibleUsers([raw(a), raw(a)]));
  assert.throws(() => eligibleUsers([{ id: a }]));
});
test('selection persists privately, rejects stale/concurrent/invalid writes and checks demotion', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'picker-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'administrators.json');
  let users = eligibleUsers([raw(a), raw(b)]);
  const service = await Administrators.open(file, async () => users);
  const view = await service.view(a, [a]);
  await service.save(a, [a], { ids: [b], revision: view.revision });
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal(await service.authorized(b), true);
  await assert.rejects(service.save(a, [a], { ids: [], revision: view.revision }));
  const restarted = await Administrators.open(file, async () => users);
  assert.equal(await restarted.authorized(b), true);
  const current = await restarted.view(b, [a]);
  await assert.rejects(restarted.save(b, [a], { ids: [], revision: current.revision }));
  await assert.rejects(restarted.save(a, [a], { ids: [c], revision: current.revision }));
  users = eligibleUsers([raw(a)]);
  assert.equal(await restarted.authorized(b), false);
  await assert.rejects(restarted.view(b, [a]));
  await writeFile(file, '{"version":99}');
  await assert.rejects(Administrators.open(file, async () => users));
});
test('picker retains ingress/CSRF boundary, permits selected eligible users and fails closed on Core outage', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'picker-')); t.after(() => rm(dir, { recursive: true, force: true }));
  let failed = false;
  const service = await Administrators.open(join(dir, 'admins.json'), async () => { if (failed) throw Error('private upstream'); return eligibleUsers([raw(a), raw(b)]); });
  const app = await createApp({ admin_user_ids: [a], home_assistant_origin: 'https://ha.test' }, { administrators: service });
  t.after(() => app.close());
  const headers = { 'x-remote-user-id': a, 'x-ingress-path': '/api/hassio_ingress/fixture_token_not_a_secret/' };
  const request = { remoteAddress: '172.30.32.2', headers };
  assert.equal((await app.inject({ ...request, method: 'POST', url: '/api/administrators/list', payload: {} })).statusCode, 403);
  const session = (await app.inject({ ...request, url: '/api/session' })).json();
  const protectedRequest = { ...request, method: 'POST' as const, headers: { ...headers, origin: 'https://ha.test', 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken } };
  const view = (await app.inject({ ...protectedRequest, url: '/api/administrators/list', payload: {} })).json();
  assert.equal((await app.inject({ ...protectedRequest, url: '/api/administrators/save', payload: { ids: [b], revision: view.revision } })).statusCode, 200);
  assert.equal((await app.inject({ ...protectedRequest, url: '/api/administrators/list', payload: {} })).statusCode, 403);
  const selected = { ...request, headers: { ...headers, 'x-remote-user-id': b }, url: '/api/status' };
  assert.equal((await app.inject(selected)).statusCode, 200);
  failed = true;
  const denied = await app.inject(selected);
  assert.equal(denied.statusCode, 503); assert.ok(!denied.body.includes('private upstream'));
  assert.equal((await app.inject({ ...request, url: '/api/status' })).statusCode, 200);
  assert.equal((await app.inject({ ...selected, remoteAddress: '127.0.0.1' })).statusCode, 403);
});
test('WebSocket reader sends only authentication and fixed list command, rejects failed auth', async () => {
  class Socket {
    onmessage?: (event: { data: string }) => void; onerror?: () => void; onclose?: () => void;
    sent: unknown[] = []; closed = false;
    send(data: string) { this.sent.push(JSON.parse(data)); }
    close() { this.closed = true; }
    message(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
  }
  const socket = new Socket();
  const pending = coreUserDirectory('fixture-token', () => socket as unknown as WebSocket)();
  socket.message({ type: 'auth_required' }); socket.message({ type: 'auth_ok' });
  socket.message({ type: 'result', id: 1, success: true, result: [raw(a)] });
  assert.equal((await pending).length, 1);
  assert.deepEqual(socket.sent, [{ type: 'auth', access_token: 'fixture-token' }, { id: 1, type: 'config/auth/list' }]);
  assert.equal(socket.closed, true);
  const bad = new Socket();
  const rejected = coreUserDirectory('fixture-token', () => bad as unknown as WebSocket)();
  bad.message({ type: 'auth_invalid' }); await assert.rejects(rejected);
});

test('opt-in setup retrieves the current verified admin without IDs, saves explicitly and persists completion', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'picker-setup-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'admins.json');
  const directory = async () => eligibleUsers([raw(a), raw(b), raw(c, { group_ids: [] })]);
  const service = await Administrators.open(file, directory);
  const options = { admin_user_ids: [], enable_administrator_setup: true, home_assistant_origin: 'https://ha.test' };
  const app = await createApp(options, { administrators: service }); t.after(() => app.close());
  const headers = { 'x-remote-user-id': a, 'x-ingress-path': '/api/hassio_ingress/fixture_token_not_a_secret/' };
  const request = { remoteAddress: '172.30.32.2', headers };
  for (const user of [c, 'd'.repeat(32), `${a},${b}`, '']) {
    assert.equal((await app.inject({ ...request, headers: { ...headers, 'x-remote-user-id': user }, url: '/api/session' })).statusCode, 403);
  }
  assert.equal((await app.inject({ ...request, remoteAddress: '127.0.0.1', url: '/api/session' })).statusCode, 403);
  assert.equal((await app.inject({ ...request, url: '/api/pki' })).json().code, 'ADMIN_SETUP_REQUIRED');
  const post = async (url: string, payload: Record<string, unknown>) => {
    const session = (await app.inject({ ...request, url: '/api/session' })).json();
    return app.inject({ ...request, method: 'POST', url, headers: { ...headers, origin: 'https://ha.test', 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken }, payload });
  };
  assert.equal((await post('/api/administrators/finish', {})).statusCode, 403);
  const view = (await post('/api/administrators/list', {})).json();
  assert.equal(view.currentUserId, a);
  assert.equal(service.needsSelection(), true, 'reading does not claim installation');
  assert.equal((await post('/api/administrators/save', { ids: [b], revision: view.revision })).statusCode, 400, 'actor must retain access');
  assert.equal((await post('/api/administrators/save', { ids: [a], revision: view.revision })).statusCode, 200);
  assert.equal(service.needsSelection(), false);
  assert.equal((await app.inject({ ...request, url: '/api/administration-status' })).json().setupComplete, false);
  assert.equal((await post('/api/administrators/finish', {})).statusCode, 200);
  const restored = await Administrators.open(file, directory);
  assert.equal(restored.setupComplete(), true);
  const restarted = await createApp(options, { administrators: restored }); t.after(() => restarted.close());
  assert.equal((await restarted.inject({ ...request, headers: { ...headers, 'x-remote-user-id': b }, url: '/api/session' })).statusCode, 403, 'other HA admins cannot claim configured installation');
  assert.equal((await restarted.inject({ ...request, url: '/api/administration-status' })).json().setupComplete, true);
});

test('setup stays closed without opt-in, with legacy configured IDs, on HTTP, and during directory failure', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'picker-gate-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const service = await Administrators.open(join(dir, 'admins.json'), async () => eligibleUsers([raw(a), raw(b)]));
  const request = { remoteAddress: '172.30.32.2', headers: { 'x-remote-user-id': b, 'x-ingress-path': '/api/hassio_ingress/fixture_token_not_a_secret/' }, url: '/api/session' };
  for (const options of [
    { admin_user_ids: [], home_assistant_origin: 'https://ha.test' },
    { admin_user_ids: [a], enable_administrator_setup: true, home_assistant_origin: 'https://ha.test' },
    { admin_user_ids: [], enable_administrator_setup: true, home_assistant_origin: 'http://ha.test' },
  ]) {
    const app = await createApp(options, { administrators: service }); t.after(() => app.close());
    assert.equal((await app.inject(request)).statusCode, 403);
  }
  const unavailable = await Administrators.open(join(dir, 'offline.json'), async () => { throw Error('private'); });
  const app = await createApp({ admin_user_ids: [], enable_administrator_setup: true, home_assistant_origin: 'https://ha.test' }, { administrators: unavailable }); t.after(() => app.close());
  const response = await app.inject(request);
  assert.equal(response.statusCode, 503); assert.ok(!response.body.includes('private'));
});
