import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectResource, resourceSelectionSchema } from '../server/resource-inspection.js';
import { PangolinError, inspectPangolin } from '../server/pangolin.js';
import { createApp } from '../server/app.js';
import { checked } from '../web/pki-api.js';
import { resourceInspectionSchema } from '../web/ResourceInspection.js';
import { resourceFixture } from './fixtures/resource.js';
const selection = { resourceIdentifier: 'test-resource', hostname: 'ha-test.example.test' };

test('inspection resolves exact org/identifier/hostname, uses fixed read routes and strips sensitive fields', async () => {
  const fixture = resourceFixture();
  const result = await inspectResource(fixture.read, 'fixture', selection);
  assert.deepEqual(result.issues, []);
  assert.equal(result.policy.source, 'inline');
  assert.equal(result.trust.source, 'inline-policy');
  assert.ok(!JSON.stringify(result).includes('never-return'));
  assert.equal(resourceInspectionSchema.safeParse(result).success, true);
  assert.deepEqual(fixture.calls, [
    ['/openapi.json', false], ['/org/fixture', true],
    ['/org/fixture/public-resources?pageSize=20&page=1&query=test-resource', true],
    ['/public-resource/7', true], ['/public-resource/7/policies', true], ['/public-resource/7/targets?limit=20&offset=0', true],
    ['/public-resource-policy/9/mtls/certificates', true],
    ['/org/fixture/public-resources?pageSize=20&page=1&query=ha-test.example.test', true], ['/public-resource/7', true],
  ]);
});

test('inspection refuses ambiguous, incomplete and mismatched selection before reading its policies or trust', async () => {
  for (const scenario of ['incomplete', 'absent', 'duplicate', 'hostname', 'org', 'identifier'] as const) {
    const fixture = resourceFixture();
    if (scenario === 'incomplete') fixture.candidates.pagination.total = 21;
    if (scenario === 'absent') { fixture.candidates.resources = []; fixture.candidates.pagination.total = 0; }
    if (scenario === 'duplicate') { fixture.candidates.resources.push({ ...fixture.selected }); fixture.candidates.pagination.total = 2; }
    if (scenario === 'hostname') fixture.selected.fullDomain = 'other.example.test';
    if (scenario === 'org') fixture.selected.orgId = 'another-org';
    if (scenario === 'identifier') fixture.selected.niceId = 'different';
    await assert.rejects(inspectResource(fixture.read, 'fixture', selection), /PANGOLIN_(SEARCH_INCOMPLETE|SELECTION_NOT_FOUND|SELECTION_MISMATCH)/);
    assert.ok(!fixture.calls.some(([path]) => path.endsWith('/policies') || path.endsWith('/mtls/certificates')));
  }
});

test('shared policy, targets, existing trust and other auth remain explicit review findings', async () => {
  const fixture = resourceFixture();
  fixture.selected.resourcePolicyId = 10;
  fixture.selected.enabled = true; fixture.selected.ssl = false;
  fixture.policies.sharedPolicy = { ...fixture.inline, resourcePolicyId: 10, mtlsEnabled: true, sso: true, passwordId: 3 };
  fixture.targetData.targets.push({ targetId: 2, resourceId: 7, siteId: 4, ip: '192.0.2.10', port: 8123, enabled: true, hcHeaders: 'never-return' });
  fixture.targetData.pagination.total = 25;
  fixture.trust.certificates.push({ mtlsCertificateId: 1, name: 'Existing CA', fingerprint: 'AA:BB', notAfter: 1, certificate: 'never-return' });
  const result = await inspectResource(fixture.read, 'fixture', selection);
  for (const issue of ['SHARED_POLICY', 'TARGETS_PRESENT', 'TARGETS_INCOMPLETE', 'EXISTING_TRUST', 'OTHER_AUTH_OR_RULES', 'RESOURCE_ENABLED', 'HTTPS_OFF', 'MTLS_ALREADY_ON']) assert.ok(result.issues.includes(issue), issue);
  assert.equal(result.trust.source, 'shared-policy-only');
  assert.ok(fixture.calls.some(([path]) => path === '/public-resource-policy/10/mtls/certificates'));
  assert.ok(!JSON.stringify(result).includes('never-return'));
});

test('hostname conflicts and incomplete searches never produce clean findings', async () => {
  const fixture = resourceFixture();
  fixture.hostname.resources.push({ ...fixture.selected, resourceId: 8 });
  fixture.hostname.pagination.total = 30;
  const result = await inspectResource(fixture.read, 'fixture', selection);
  assert.ok(result.issues.includes('HOSTNAME_CONFLICT'));
  assert.ok(result.issues.includes('HOSTNAME_SEARCH_INCOMPLETE'));
});

test('changed resource/policy references and cross-resource targets fail closed', async () => {
  const fixture = resourceFixture();
  let detailCalls = 0;
  await assert.rejects(inspectResource(async (path, auth) => {
    const response = await fixture.read(path, auth);
    if (path === '/public-resource/7' && ++detailCalls === 2) return { success: true, error: false, data: { ...fixture.selected, enabled: true } };
    return response;
  }, 'fixture', selection), /PANGOLIN_SNAPSHOT_CHANGED/);
  fixture.inline.resourcePolicyId = 99;
  await assert.rejects(inspectResource(fixture.read, 'fixture', selection), /PANGOLIN_SNAPSHOT_CHANGED/);
  fixture.inline.resourcePolicyId = 9;
  fixture.targetData.targets.push({ targetId: 1, resourceId: 99, siteId: 2, ip: '192.0.2.1', port: 8123, enabled: false });
  fixture.targetData.pagination.total = 1;
  await assert.rejects(inspectResource(fixture.read, 'fixture', selection), /PANGOLIN_CONTRACT/);
});

test('fixed failure stages distinguish permissions without exposing request or upstream data', async () => {
  for (const [path, stage] of [['/public-resource/7', 'resource'], ['/public-resource/7/policies', 'policies'], ['/public-resource/7/targets?limit=20&offset=0', 'targets'], ['/public-resource-policy/9/mtls/certificates', 'trust']] as const) {
    const fixture = resourceFixture();
    await assert.rejects(inspectResource(async (url, auth) => { if (url === path) throw new PangolinError('PANGOLIN_PERMISSION_DENIED'); return fixture.read(url, auth); }, 'fixture', selection), (error: unknown) => error instanceof PangolinError && error.stage === stage && error.code === 'PANGOLIN_PERMISSION_DENIED');
  }
  await assert.rejects(inspectPangolin(async () => { throw new PangolinError('PANGOLIN_PERMISSION_DENIED'); }, 'fixture'), (error: unknown) => error instanceof PangolinError && error.stage === 'specification');
  await assert.rejects(checked(Response.json({ code: 'PANGOLIN_PERMISSION_DENIED', stage: 'targets', error: 'private-secret' }, { status: 502 })), (error: unknown) => error instanceof Error && error.message.includes('List Targets') && !error.message.includes('private-secret'));
  await assert.rejects(checked(Response.json({ code: 'PANGOLIN_PERMISSION_DENIED', stage: 'private-secret' }, { status: 502 })), (error: unknown) => error instanceof Error && !error.message.includes('private-secret'));
  assert.equal(resourceSelectionSchema.safeParse({ ...selection, hostname: 'https://evil.test/path' }).success, false);
  assert.equal(resourceSelectionSchema.safeParse({ ...selection, resourceIdentifier: '../other' }).success, false);
});

test('resource inspection API preserves ingress/CSRF and input checks, redacts credentials and exposes safe failure stage', async t => {
  const user = 'a'.repeat(32), origin = 'https://ha.example.test', remoteAddress = '172.30.32.2';
  const headers = { 'x-remote-user-id': user, 'x-ingress-path': '/api/hassio_ingress/disposable_fixture_for_tests/' };
  let failTrust = false, upstreamCalls = 0;
  const fixture = resourceFixture();
  const app = await createApp({ admin_user_ids: [user], home_assistant_origin: origin, pangolin_api_url: 'https://api.example.test/v1' }, {
    webRoot: fileURLToPath(new URL('../dist/web', import.meta.url)), pangolinReader: async (_base, key) => {
      upstreamCalls++; assert.equal(key, 'fixture-key');
      return async (path, auth) => { if (failTrust && path.endsWith('/mtls/certificates')) throw new PangolinError('PANGOLIN_PERMISSION_DENIED'); return fixture.read(path, auth); };
    },
  });
  t.after(() => app.close());
  const payload = { orgId: 'fixture', apiKey: 'fixture-key', ...selection };
  for (const peer of [remoteAddress, '127.0.0.1']) assert.equal((await app.inject({ method: 'POST', url: '/api/pangolin/resource-check', remoteAddress: peer, headers: { ...headers, origin }, payload })).statusCode, 403);
  assert.equal(upstreamCalls, 0);
  const session = (await app.inject({ url: '/api/session', remoteAddress, headers })).json();
  const trusted = { ...headers, origin, 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken };
  const success = await app.inject({ method: 'POST', url: '/api/pangolin/resource-check', remoteAddress, headers: trusted, payload });
  assert.equal(success.statusCode, 200);
  assert.equal(success.headers['cache-control'], 'no-store');
  assert.ok(!success.body.includes('fixture-key') && !success.body.includes('never-return'));
  failTrust = true;
  const failure = await app.inject({ method: 'POST', url: '/api/pangolin/resource-check', remoteAddress, headers: trusted, payload });
  assert.equal(failure.statusCode, 502);
  assert.equal(failure.json().stage, 'trust', failure.body);
});

test('API error handling redacts unexpected failures before any route is registered', async t => {
  const user = 'a'.repeat(32), origin = 'https://ha.example.test', remoteAddress = '172.30.32.2';
  const headers = { 'x-remote-user-id': user, 'x-ingress-path': '/api/hassio_ingress/disposable_fixture_for_tests/' };
  const app = await createApp({ admin_user_ids: [user], home_assistant_origin: origin, pangolin_api_url: 'https://api.example.test/v1' }, {
    webRoot: fileURLToPath(new URL('../dist/web', import.meta.url)), pangolinReader: async () => { throw new Error('private-fixture-secret'); },
  });
  t.after(() => app.close());
  const session = (await app.inject({ url: '/api/session', remoteAddress, headers })).json();
  const response = await app.inject({ method: 'POST', url: '/api/pangolin/check', remoteAddress, headers: {
    ...headers, origin, 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken,
  }, payload: { orgId: 'fixture', apiKey: 'fixture-key' } });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { code: 'REQUEST_FAILED', error: 'Request could not be processed.' });
});

test('resource check refuses HTTP origins and missing configured API URLs before networking', async t => {
  for (const origin of ['http://ha.example.test', 'https://ha.example.test']) {
    const user = 'a'.repeat(32), remoteAddress = '172.30.32.2';
    const headers = { 'x-remote-user-id': user, 'x-ingress-path': '/api/hassio_ingress/disposable_fixture_for_tests/' };
    const app = await createApp({ admin_user_ids: [user], home_assistant_origin: origin }, {
      webRoot: fileURLToPath(new URL('../dist/web', import.meta.url)), pangolinReader: async () => { throw new Error('network must not be called'); },
    });
    t.after(() => app.close());
    const session = (await app.inject({ url: '/api/session', remoteAddress, headers })).json();
    const response = await app.inject({ method: 'POST', url: '/api/pangolin/resource-check', remoteAddress, headers: {
      ...headers, origin, 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken,
    }, payload: { orgId: 'fixture', apiKey: 'fixture-key', ...selection } });
    assert.equal(response.json().code, origin.startsWith('http:') ? 'HTTPS_REQUIRED' : 'PANGOLIN_URL_REQUIRED');
  }
});
