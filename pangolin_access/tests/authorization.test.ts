import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import { optionsSchema } from '../server/config.js';

const admin = 'a'.repeat(32);
const otherAdmin = 'b'.repeat(32);
const path = '/api/hassio_ingress/fixture_token_not_a_real_secret/';
const origin = 'https://ha.example.test';
const headers = { 'x-remote-user-id': admin, 'x-ingress-path': path };
const address = '172.30.32.2';
const webRoot = fileURLToPath(new URL('../dist/web', import.meta.url));

async function fixture(t: TestContext, now?: () => number, ids = [admin, otherAdmin]) {
  const app = await createApp({ admin_user_ids: ids, home_assistant_origin: origin }, { now, webRoot });
  t.after(() => app.close());
  return app;
}

test('rejects direct peers even with forged identity and forwarding headers', async (t) => {
  const app = await fixture(t);
  for (const remoteAddress of ['127.0.0.1', '172.30.33.10', '192.168.1.20', '::1']) {
    const response = await app.inject({ url: '/api/session', remoteAddress,
      headers: { ...headers, 'x-forwarded-for': address, 'x-real-ip': address } });
    assert.equal(response.statusCode, 403);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
});

test('denies absent, non-allowlisted, and comma-joined identities', async (t) => {
  const app = await fixture(t);
  for (const user of [undefined, 'c'.repeat(32), `${admin},${otherAdmin}`]) {
    const response = await app.inject({ url: '/api/status', remoteAddress: address,
      headers: { 'x-ingress-path': path, ...(user ? { 'x-remote-user-id': user } : {}) } });
    assert.equal(response.statusCode, 403);
  }
});

test('empty allowlist denies everyone', async (t) => {
  const app = await fixture(t, undefined, []);
  assert.equal((await app.inject({ url: '/', headers, remoteAddress: address })).statusCode, 403);
});

test('validates ingress path and accepts IPv4-mapped ingress peer', async (t) => {
  const app = await fixture(t);
  for (const badPath of ['', '//evil.test', '/api/hassio_ingress/../../x', '/api/hassio_ingress/token?x=y']) {
    assert.equal((await app.inject({ url: '/', remoteAddress: address,
      headers: { ...headers, 'x-ingress-path': badPath } })).statusCode, 400);
  }
  assert.equal((await app.inject({ url: '/api/status', headers, remoteAddress: `::ffff:${address}` })).statusCode, 200);
});

test('serves only non-signing prototype status', async (t) => {
  const app = await fixture(t);
  const response = await app.inject({ url: '/api/status', headers, remoteAddress: address });
  assert.deepEqual(response.json(), { stage: 'ingress-prototype', signingEnabled: false,
    pangolinConfigured: false, liveIngressVerified: false });
  assert.equal((await app.inject({ url: '/api/ca', headers, remoteAddress: address })).statusCode, 404);
});

test('authorized session can complete a protected POST', async (t) => {
  const app = await fixture(t);
  const session = (await app.inject({ url: '/api/session', headers, remoteAddress: address })).json();
  const response = await app.inject({ method: 'POST', url: '/api/authorization-check', remoteAddress: address,
    headers: { ...headers, origin, 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken }, payload: {} });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { authorized: true, signingEnabled: false });
});

test('rejects missing session, bad CSRF, wrong origin and non-JSON', async (t) => {
  const app = await fixture(t);
  const session = (await app.inject({ url: '/api/session', headers, remoteAddress: address })).json();
  const valid = { ...headers, origin, 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken,
    'content-type': 'application/json' };
  for (const change of [
    { 'x-access-session': '' }, { 'x-csrf-token': '' }, { 'x-csrf-token': '0'.repeat(64) },
    { origin: '' }, { origin: 'https://attacker.test' }, { 'content-type': 'text/plain' },
  ]) {
    const response = await app.inject({ method: 'POST', url: '/api/authorization-check', remoteAddress: address,
      headers: { ...valid, ...change }, payload: '{}' });
    assert.equal(response.statusCode, change['content-type'] ? 415 : 403);
  }
});

test('sessions bind both principal and ingress path', async (t) => {
  const app = await fixture(t);
  const session = (await app.inject({ url: '/api/session', headers, remoteAddress: address })).json();
  for (const change of [{ 'x-remote-user-id': otherAdmin }, { 'x-ingress-path': `${path.slice(0, -1)}other/` }]) {
    assert.equal((await app.inject({ method: 'POST', url: '/api/authorization-check', remoteAddress: address,
      headers: { ...headers, ...change, origin, 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken },
      payload: {} })).statusCode, 403);
  }
});

test('session expires at deadline and is invalid in a restarted app', async (t) => {
  let time = 1000;
  const app = await fixture(t, () => time);
  const session = (await app.inject({ url: '/api/session', headers, remoteAddress: address })).json();
  const request = { method: 'POST' as const, url: '/api/authorization-check', remoteAddress: address,
    headers: { ...headers, origin, 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken }, payload: {} };
  time = session.expiresAt;
  assert.equal((await app.inject(request)).statusCode, 403);
  const restarted = await fixture(t, () => 1000);
  assert.equal((await restarted.inject(request)).statusCode, 403);
});

test('rejects oversized and unexpected input without echoing it', async (t) => {
  const app = await fixture(t);
  const session = (await app.inject({ url: '/api/session', headers, remoteAddress: address })).json();
  for (const [payload, code] of [[{ password: 'private-input' }, 400], [{ padding: 'x'.repeat(5000) }, 413]] as const) {
    const response = await app.inject({ method: 'POST', url: '/api/authorization-check', remoteAddress: address,
      headers: { ...headers, origin, 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken }, payload });
    assert.equal(response.statusCode, code);
    assert.ok(!response.body.includes('private-input'));
  }
});

test('limits session creation', async (t) => {
  const app = await fixture(t);
  for (let i = 0; i < 10; i++) {
    assert.equal((await app.inject({ url: '/api/session', headers, remoteAddress: address })).statusCode, 200);
  }
  assert.equal((await app.inject({ url: '/api/session', headers, remoteAddress: address })).statusCode, 429);
});

test('built UI assets and relative API URLs resolve beneath an ingress prefix', async (t) => {
  const app = await fixture(t);
  const response = await app.inject({ url: '/', headers, remoteAddress: address });
  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers['content-security-policy']), /frame-ancestors 'self'/);
  const assets = [...response.body.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((match) => match[1]!);
  assert.ok(assets.length >= 2, 'compiled JS and CSS must be relative');
  const browserBase = `https://ha.example.test${path}`;
  for (const asset of assets) {
    const resolved = new URL(asset, browserBase);
    assert.ok(resolved.pathname.startsWith(path));
    const proxied = await app.inject({ url: resolved.pathname.slice(path.length - 1), headers, remoteAddress: address });
    assert.equal(proxied.statusCode, 200);
    assert.equal(proxied.headers['cache-control'], 'no-store');
    if (asset.endsWith('.js')) {
      assert.ok(proxied.body.includes('./api/session'));
      assert.ok(proxied.body.includes('./api/authorization-check'));
    }
  }
  assert.equal(new URL('./api/session', browserBase).pathname, `${path}api/session`);
});

test('configuration rejects invalid IDs, credentials, paths and non-HTTP origins', () => {
  for (const value of ['https://user:pass@ha.test', 'https://ha.test/path', 'https://ha.test/?x=1', 'file:///tmp/x', 'https://ha.test/#x']) {
    assert.equal(optionsSchema.safeParse({ admin_user_ids: [admin], home_assistant_origin: value }).success, false);
  }
  assert.equal(optionsSchema.safeParse({ admin_user_ids: ['admin'], home_assistant_origin: origin }).success, false);
  assert.equal(optionsSchema.safeParse({ admin_user_ids: [], home_assistant_origin: origin, auth_bypass: true }).success, false);
  assert.equal(optionsSchema.parse({ admin_user_ids: [admin], home_assistant_origin: `${origin}/` }).home_assistant_origin, origin);
});

test('denial diagnostics distinguish origin failures without recording sensitive headers', async (t) => {
  const codes: string[] = [];
  const app = await createApp({ admin_user_ids: [admin], home_assistant_origin: origin }, {
    webRoot, onAccessDenied: (code) => codes.push(code),
  });
  t.after(() => app.close());
  for (const [suppliedOrigin, code] of [[undefined, 'ORIGIN_MISSING'], ['null', 'ORIGIN_NULL'], ['https://wrong.test', 'ORIGIN_MISMATCH']] as const) {
    const response = await app.inject({ method: 'POST', url: '/api/authorization-check', remoteAddress: address,
      headers: { ...headers, ...(suppliedOrigin ? { origin: suppliedOrigin } : {}), 'x-csrf-token': 'private-token' }, payload: {} });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, code);
  }
  assert.deepEqual(codes, ['ORIGIN_MISSING', 'ORIGIN_NULL', 'ORIGIN_MISMATCH']);
});
