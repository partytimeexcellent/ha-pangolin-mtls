import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAccess } from '../web/access-check.js';

const session = { sessionId: 'a'.repeat(64), csrfToken: 'b'.repeat(64) };
const json = (body: unknown, status = 200) => Response.json(body, { status });
function responses(...values: Response[]): typeof fetch {
  return (async () => {
    const response = values.shift();
    assert.ok(response, 'unexpected extra request');
    return response;
  }) as typeof fetch;
}

test('access check sends session credentials and succeeds', async () => {
  let count = 0;
  const fetcher: typeof fetch = async (url, options) => {
    count++;
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.credentials, 'same-origin');
    if (count === 1) {
      assert.equal(url, './api/session');
      return json(session);
    }
    assert.equal(url, './api/authorization-check');
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('x-access-session'), session.sessionId);
    assert.equal(headers.get('x-csrf-token'), session.csrfToken);
    assert.equal(options?.body, '{}');
    return json({ authorized: true, signingEnabled: false });
  };
  assert.match(await checkAccess(fetcher), /^Authorization check passed/);
});

test('shows distinct safe server reasons and the failing request stage', async () => {
  for (const code of ['ORIGIN_MISMATCH', 'ORIGIN_MISSING', 'ORIGIN_NULL', 'SESSION_OR_CSRF_INVALID']) {
    const result = await checkAccess(responses(json(session), json({ code }, 403)));
    assert.ok(result.includes(code));
    assert.ok(result.includes('Authorization request'));
    assert.ok(result.includes('HTTP 403'));
  }
  assert.match(await checkAccess(responses(json({ code: 'USER_NOT_AUTHORIZED' }, 403))), /Session request.*USER_NOT_AUTHORIZED/);
});

test('never displays arbitrary error bodies, unknown codes or tokens', async () => {
  for (const code of ['private-secret', 'constructor', '__proto__']) {
    const result = await checkAccess(responses(json({ code, error: `private-secret ${session.sessionId}` }, 403)));
    assert.ok(result.includes('REQUEST_FAILED'));
    assert.ok(!result.includes('private-secret'));
    assert.ok(!result.includes(session.sessionId));
  }
});

test('distinguishes non-JSON proxy pages and unexpected success shapes', async () => {
  assert.match(await checkAccess(responses(new Response('<html>secret proxy body</html>', { status: 502 }))), /expected app JSON.*502/);
  const result = await checkAccess(responses(json({ arbitrary: 'private-secret' })));
  assert.match(result, /unexpected response/);
  assert.ok(!result.includes('private-secret'));
});

test('network failures and redirect errors do not expose raw exception messages', async () => {
  const failing = (async () => { throw new Error('secret ingress URL'); }) as typeof fetch;
  const result = await checkAccess(failing);
  assert.ok(result.includes('NETWORK_ERROR'));
  assert.ok(!result.includes('secret ingress URL'));
});
