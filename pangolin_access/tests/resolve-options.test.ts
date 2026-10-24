import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../server/app.js';
import { resolveOptions, ExternalUrlError } from '../server/resolve-options.js';

const base = { admin_user_ids: ['a'.repeat(32)], enable_certificate_management: true };
const origin = 'https://ha.example.test';
const failure = (error: unknown) => error instanceof ExternalUrlError && error.message === 'HOME_ASSISTANT_EXTERNAL_URL_UNAVAILABLE';

test('explicit external URL overrides discovery, preserves upgrades and never contacts Core', async () => {
  const noCall: typeof fetch = async () => { throw new Error('must not call Core for an override'); };
  const result = await resolveOptions({ ...base, home_assistant_origin: origin + '/' }, undefined, noCall);
  assert.equal(result.source, 'configuration'); assert.equal(result.options.home_assistant_origin, origin);
  assert.equal((await resolveOptions({ ...base, enable_certificate_management: false, home_assistant_origin: 'http://ha.example.test:8123' }, undefined, noCall)).options.home_assistant_origin, 'http://ha.example.test:8123');
  for (const invalid of ['http://ha.example.test', 'https://ha.example.test/path', 'https://user:secret@ha.example.test', 'https://ha.example.test/?token=x']) {
    await assert.rejects(resolveOptions({ ...base, home_assistant_origin: invalid }, 'fixture', noCall));
  }
  await assert.rejects(resolveOptions({ ...base, admin_user_ids: ['invalid'], home_assistant_origin: '' }, 'fixture', noCall));
});

test('blank/missing URL reads only Core config, validates external_url and discards unrelated metadata', async () => {
  for (const override of ['', undefined]) {
    let calls = 0;
    const result = await resolveOptions({ ...base, home_assistant_origin: override }, 'disposable-token', async (url, init) => {
      calls++;
      assert.equal(url, 'http://supervisor/core/api/config'); assert.equal(init?.method, 'GET');
      assert.equal(init?.redirect, 'error'); assert.ok(init?.signal);
      assert.equal((init!.headers as Record<string, string>).authorization, 'Bearer disposable-token');
      return Response.json({ external_url: origin + '/', internal_url: 'http://private.test', latitude: 1, longitude: 2, secret: 'not-returned' });
    });
    assert.equal(calls, 1); assert.equal(result.source, 'home-assistant');
    assert.equal(result.options.home_assistant_origin, origin);
    assert.ok(!JSON.stringify(result).includes('latitude')); assert.ok(!JSON.stringify(result).includes('not-returned'));
  }
});

test('discovery fails closed for unset/unsafe URLs, failed auth, redirects, oversized bodies and network errors', async () => {
  await assert.rejects(resolveOptions(base), failure);
  for (const external_url of [undefined, null, '', 123, 'javascript:alert(1)', 'http://ha.example.test', origin + '/path', origin + '?x=1', 'https://user:password@ha.example.test', 'x'.repeat(2049)]) {
    await assert.rejects(resolveOptions(base, 'fixture', async () => Response.json({ external_url, internal_url: origin })), failure);
  }
  const responses = [
    () => new Response('private error', { status: 401 }),
    () => new Response('', { status: 302, headers: { location: 'https://attacker.test' } }),
    () => new Response('private error', { headers: { 'content-type': 'text/html' } }),
    () => new Response('{invalid private json', { headers: { 'content-type': 'application/json' } }),
    () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(300_000) } }),
    () => new Response(' '.repeat(300_000), { headers: { 'content-type': 'application/json' } }),
    () => Response.json([]),
  ];
  for (const response of responses) await assert.rejects(resolveOptions(base, 'fixture', async () => response()), failure);
  await assert.rejects(resolveOptions(base, 'fixture', async () => { throw new Error('private token and host'); }), failure);
});

test('discovered URL retains exact-origin CSRF protection and reports the selected source only to authorized ingress', async (t) => {
  const resolved = await resolveOptions(base, 'fixture', async () => Response.json({ external_url: origin }));
  const app = await createApp(resolved.options, { homeAssistantUrlSource: resolved.source });
  t.after(() => app.close());
  const remoteAddress = '172.30.32.2';
  const headers = { 'x-remote-user-id': base.admin_user_ids[0]!, 'x-ingress-path': '/api/hassio_ingress/disposable_fixture_for_tests/' };
  assert.equal((await app.inject({ url: '/api/status' })).statusCode, 403);
  const status = (await app.inject({ url: '/api/status', remoteAddress, headers })).json();
  assert.equal(status.homeAssistantUrl, origin); assert.equal(status.homeAssistantUrlSource, 'home-assistant');
  const session = (await app.inject({ url: '/api/session', remoteAddress, headers })).json();
  const authHeaders = { ...headers, 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken };
  assert.equal((await app.inject({ method: 'POST', url: '/api/authorization-check', remoteAddress, headers: { ...authHeaders, origin: 'https://attacker.test' }, payload: {} })).json().code, 'ORIGIN_MISMATCH');
  assert.equal((await app.inject({ method: 'POST', url: '/api/authorization-check', remoteAddress, headers: { ...authHeaders, origin }, payload: {} })).statusCode, 200);
});
