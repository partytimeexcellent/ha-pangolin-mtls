import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { apiUrlSchema, inspectPangolin, publicAddress, PangolinError, type ReadJson } from '../server/pangolin.js';
import { createApp } from '../server/app.js';

const paths = ['/org/{orgId}', '/org/{orgId}/sites', '/org/{orgId}/domains', '/org/{orgId}/public-resources'];
const wrap = (data: unknown) => ({ success: true, error: false, data });
const spec = { openapi: '3.0.0', paths: Object.fromEntries(paths.map(path => [path, { get: {} }])) };
function fixture(calls: Array<[string, boolean]>): ReadJson {
  return async (path, authenticated) => {
    calls.push([path, authenticated]);
    if (path === '/openapi.json') return spec;
    if (path === '/org/fixture') return wrap({ org: { orgId: 'fixture', name: 'Fixture', secret: 'never-return' } });
    if (path.includes('/sites?')) return wrap({ sites: [{ siteId: 1, niceId: 'fixture-site', name: 'Site', online: true, pubKey: 'never-return' }], pagination: { total: 25 } });
    if (path.includes('/domains?')) return wrap({ domains: [{ domainId: 'fixture-domain', baseDomain: 'example.test', verified: true, errorMessage: 'never-return' }], pagination: { total: 1 } });
    if (path.includes('/public-resources?')) return wrap({ resources: [{ resourceId: 2, niceId: 'resource', name: 'Resource', fullDomain: 'ha.example.test', ssl: true, mtls: false, enabled: true, targets: [{ ip: 'never-return' }] }], pagination: { total: 1 } });
    throw new Error('unexpected request');
  };
}

test('API URL and destination restrictions reject local, reserved and ambiguous destinations', () => {
  for (const value of ['http://api.example.test/v1', 'https://user:secret@api.example.test/v1', 'https://api.example.test/api/v1', 'https://api.example.test/v1?token=secret', 'https://api.example.test/v1#fragment', 'https://127.0.0.1/v1', 'https://[::1]/v1', 'https://2130706433/v1', 'https://localhost/v1']) assert.equal(apiUrlSchema.safeParse(value).success, false, value);
  assert.equal(apiUrlSchema.parse('https://api.example.test:8443/v1/'), 'https://api.example.test:8443/v1');
  for (const value of ['127.0.0.1', '10.1.2.3', '172.30.32.2', '192.168.1.1', '169.254.169.254', '100.100.100.200', '0.0.0.0', '224.0.0.1', '240.0.0.1', '192.0.2.1', '::1', '::ffff:8.8.8.8', 'fc00::1', 'fe80::1', '2001:db8::1', '2002:0808:0808::1', '2001::1', '3fff::1', 'invalid']) assert.equal(publicAddress(value), false, value);
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.equal(publicAddress('2606:4700:4700::1111'), true);
});

test('inventory checks deployed spec, bounds pagination and strips unrelated fields', async () => {
  const calls: Array<[string, boolean]> = [];
  const result = await inspectPangolin(fixture(calls), 'fixture');
  assert.deepEqual(calls, [['/openapi.json', false], ['/org/fixture', true], ['/org/fixture/sites?pageSize=20&page=1', true], ['/org/fixture/domains?limit=20&offset=0', true], ['/org/fixture/public-resources?pageSize=20&page=1', true]]);
  assert.equal(result.sites.pagination.total, 25);
  assert.equal(result.mtlsRoutesAdvertised, false);
  assert.equal(result.scope, 'read-only-resources');
  assert.ok(!JSON.stringify(result).includes('never-return'));
});

test('contract and upstream failures stop immediately and redact upstream errors', async () => {
  let calls = 0;
  await assert.rejects(inspectPangolin(async () => { calls++; return { openapi: '3.0.0', paths: {} }; }, 'fixture'), /PANGOLIN_CONTRACT/);
  assert.equal(calls, 1);
  await assert.rejects(inspectPangolin(async () => { throw new Error('private-secret'); }, 'fixture'), (error: unknown) => error instanceof PangolinError && !error.message.includes('private-secret'));
  const read = fixture([]);
  await assert.rejects(inspectPangolin(async (path, auth) => path === '/org/fixture' ? wrap({ org: { orgId: 'different', name: 'Wrong' } }) : read(path, auth), 'fixture'), /PANGOLIN_CONTRACT/);
  await assert.rejects(inspectPangolin(async () => { throw new PangolinError('PANGOLIN_PERMISSION_DENIED'); }, 'fixture'), /PANGOLIN_PERMISSION_DENIED/);
});

test('check requires ingress, CSRF and strict input before contacting configured destination', async t => {
  const user = 'a'.repeat(32);
  const origin = 'https://ha.example.test';
  const headers = { 'x-remote-user-id': user, 'x-ingress-path': '/api/hassio_ingress/disposable_fixture_for_tests/' };
  const remoteAddress = '172.30.32.2';
  let upstream = 0;
  const app = await createApp({ admin_user_ids: [user], home_assistant_origin: origin, pangolin_api_url: 'https://api.example.test/v1' }, {
    webRoot: fileURLToPath(new URL('../dist/web', import.meta.url)),
    pangolinReader: async (base, key) => { upstream++; assert.equal(base, 'https://api.example.test/v1'); assert.equal(key, 'fixture-key'); return fixture([]); },
  });
  t.after(() => app.close());
  const body = { orgId: 'fixture', apiKey: 'fixture-key' };
  assert.equal((await app.inject({ method: 'POST', url: '/api/pangolin/check', remoteAddress, headers: { ...headers, origin }, payload: body })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/api/pangolin/check', remoteAddress: '127.0.0.1', headers: { ...headers, origin }, payload: body })).statusCode, 403);
  assert.equal(upstream, 0);
  const session = (await app.inject({ url: '/api/session', remoteAddress, headers })).json();
  const protectedHeaders = { ...headers, origin, 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken };
  assert.equal((await app.inject({ method: 'POST', url: '/api/pangolin/check', remoteAddress, headers: protectedHeaders, payload: { ...body, url: 'https://attacker.example/v1' } })).statusCode, 400);
  assert.equal(upstream, 0);
  const checked = await app.inject({ method: 'POST', url: '/api/pangolin/check', remoteAddress, headers: protectedHeaders, payload: body });
  assert.equal(checked.statusCode, 200);
  assert.equal(upstream, 1);
  assert.equal(checked.headers['cache-control'], 'no-store');
  assert.ok(!checked.body.includes('fixture-key'));
  assert.ok(!checked.body.includes('never-return'));
});

test('pinned HTTPS reader sends only GET, keeps TLS verification and refuses redirects, excess data and raw errors', async () => {
  const { readPinnedJson } = await import('../server/pangolin.js');
  const { EventEmitter } = await import('node:events');
  const { PassThrough } = await import('node:stream');
  const url = new URL('https://api.example.test/v1/openapi.json');
  const signal = new AbortController().signal;
  type Send = Parameters<typeof readPinnedJson>[5];
  function sendFixture(status: number, data: string, authenticated: boolean, contentType = 'application/json'): Send {
    return ((_url: URL, options: Record<string, unknown>, callback: (response: unknown) => void) => {
      assert.equal(_url.origin, url.origin);
      assert.equal(options.method, 'GET');
      assert.equal(options.agent, false);
      assert.equal(options.family, 4);
      assert.equal(options.rejectUnauthorized, undefined, 'Node default TLS verification must remain enabled');
      assert.deepEqual(options.headers, { accept: 'application/json', ...(authenticated ? { authorization: 'Bearer fixture-key' } : {}) });
      const lookup = options.lookup as (host: string, options: unknown, callback: (error: unknown, address: string, family: number) => void) => void;
      lookup('api.example.test', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4); });
      const req = new EventEmitter() as InstanceType<typeof EventEmitter> & { setTimeout: () => void; end: () => void };
      req.setTimeout = () => {};
      req.end = () => {
        const res = Object.assign(new PassThrough(), { statusCode: status, headers: { 'content-type': contentType } });
        callback(res);
        res.end(data);
      };
      return req;
    }) as unknown as Send;
  }
  const pin = { address: '8.8.8.8', family: 4 };
  assert.deepEqual(await readPinnedJson(url, pin, 'fixture-key', false, signal, sendFixture(200, '{"ok":true}', false)), { ok: true });
  for (const [status, code] of [[301, 'PANGOLIN_REDIRECT'], [401, 'PANGOLIN_AUTH_FAILED'], [403, 'PANGOLIN_PERMISSION_DENIED'], [404, 'PANGOLIN_NOT_FOUND'], [500, 'PANGOLIN_UPSTREAM']] as const) {
    await assert.rejects(readPinnedJson(url, pin, 'fixture-key', true, signal, sendFixture(status, 'private-secret', true)), new RegExp(code));
  }
  await assert.rejects(readPinnedJson(url, pin, 'fixture-key', false, signal, sendFixture(200, 'private-secret', false)), /PANGOLIN_CONTRACT/);
  await assert.rejects(readPinnedJson(url, pin, 'fixture-key', false, signal, sendFixture(200, '{}', false, 'text/html')), /PANGOLIN_CONTRACT/);
  await assert.rejects(readPinnedJson(url, pin, 'fixture-key', false, signal, sendFixture(200, 'x'.repeat(2 * 1024 * 1024 + 1), false)), /PANGOLIN_RESPONSE_LIMIT/);
});
