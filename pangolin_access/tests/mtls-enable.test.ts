import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import { caInstallSchema } from '../server/ca-install.js';
import { enableMtls } from '../server/mtls-enable.js';
import { PangolinError } from '../server/pangolin.js';
import { PkiService } from '../server/pki.js';
import { resourceFixture } from './fixtures/resource.js';

function temporaryCa() {
  const dir = mkdtempSync(join(tmpdir(), 'ha-pangolin-mtls-test-'));
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-batch', '-days', '3',
      '-subj', '/CN=Fixture CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'ca.pem')], { stdio: 'ignore' });
    return readFileSync(join(dir, 'ca.pem'), 'utf8');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const selection = { resourceIdentifier: 'test-resource', hostname: 'ha-test.example.test' };
function prepared() {
  const pem = temporaryCa();
  const fixture = resourceFixture();
  fixture.trust.certificates.push({ mtlsCertificateId: 1, name: 'HA Pangolin Access CA',
    fingerprint: new X509Certificate(pem).fingerprint256, notAfter: Date.now() + 100000 });
  const read = async (path: string, auth: boolean) => {
    const value = await fixture.read(path, auth);
    if (path !== '/openapi.json') return value;
    const spec = value as { openapi: string; paths: Record<string, unknown> };
    return { ...spec, paths: { ...spec.paths, '/public-resource-policy/{resourcePolicyId}': { post: {} } } };
  };
  return { pem, fixture, read };
}

test('mTLS enable writes only the selected inline policy and verifies readback', async () => {
  const { pem, fixture, read } = prepared();
  let writes = 0;
  const write = async (path: string, body: unknown, method?: 'PUT' | 'POST') => {
    assert.equal(path, '/public-resource-policy/9');
    assert.equal(method, 'POST');
    assert.deepEqual(body, { mtlsEnabled: true });
    writes++;
    fixture.inline.mtlsEnabled = true;
    return { success: true };
  };
  assert.equal((await enableMtls(read, write, 'fixture', selection, pem)).status, 'enabled');
  assert.equal((await enableMtls(read, write, 'fixture', selection, pem)).status, 'already-enabled');
  assert.equal(writes, 1);
});

test('mTLS enable refuses missing trust, active resources and shared policies before writing', async () => {
  const { pem, fixture, read } = prepared();
  let writes = 0;
  const write = async () => { writes++; return {}; };
  fixture.trust.certificates.length = 0;
  await assert.rejects(enableMtls(read, write, 'fixture', selection, pem),
    (error: unknown) => error instanceof PangolinError && error.code === 'PANGOLIN_CA_NOT_TRUSTED');
  fixture.trust.certificates.push({ mtlsCertificateId: 1, name: 'HA Pangolin Access CA',
    fingerprint: new X509Certificate(pem).fingerprint256, notAfter: Date.now() + 100000 });
  fixture.selected.enabled = true;
  await assert.rejects(enableMtls(read, write, 'fixture', selection, pem),
    (error: unknown) => error instanceof PangolinError && error.code === 'PANGOLIN_MTLS_ACTIVE_RESOURCE');
  fixture.selected.enabled = false;
  fixture.selected.resourcePolicyId = 10;
  fixture.policies.sharedPolicy = { ...fixture.inline, resourcePolicyId: 10 };
  await assert.rejects(enableMtls(read, write, 'fixture', selection, pem),
    (error: unknown) => error instanceof PangolinError && error.code === 'PANGOLIN_RESOURCE_INELIGIBLE');
  assert.equal(writes, 0);
});

test('mTLS enable reports permission denial and unverified writes', async () => {
  const { pem, fixture, read } = prepared();
  await assert.rejects(enableMtls(read, async () => { throw new PangolinError('PANGOLIN_PERMISSION_DENIED'); }, 'fixture', selection, pem),
    (error: unknown) => error instanceof PangolinError && error.code === 'PANGOLIN_PERMISSION_DENIED' && error.stage === 'mtls');
  await assert.rejects(enableMtls(read, async () => ({ success: true }), 'fixture', selection, pem),
    (error: unknown) => error instanceof PangolinError && error.code === 'PANGOLIN_MTLS_ENABLE_UNCERTAIN');
  assert.equal(fixture.inline.mtlsEnabled, false);
});

test('mTLS enable API requires the local CA and an authorized explicit request', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ha-pangolin-enable-api-'));
  const pki = await PkiService.open(root);
  const fixture = resourceFixture();
  const user = 'a'.repeat(32), origin = 'https://ha.example.test', remoteAddress = '172.30.32.2';
  const headers = { 'x-remote-user-id': user, 'x-ingress-path': '/api/hassio_ingress/disposable_fixture_for_tests/' };
  let writes = 0;
  const app = await createApp({ admin_user_ids: [user], home_assistant_origin: origin,
    pangolin_api_url: 'https://api.example.test/v1', enable_certificate_management: true }, {
    pki, webRoot: fileURLToPath(new URL('../dist/web', import.meta.url)),
    pangolinReader: async () => async (path, auth) => {
      const value = await fixture.read(path, auth);
      if (path !== '/openapi.json') return value;
      const spec = value as { openapi: string; paths: Record<string, unknown> };
      return { ...spec, paths: { ...spec.paths, '/public-resource-policy/{resourcePolicyId}': { post: {} } } };
    },
    pangolinWriter: async () => async (_path, _body, method) => {
      assert.equal(method, 'POST'); writes++; fixture.inline.mtlsEnabled = true; return { success: true };
    },
  });
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  const payload = { orgId: 'fixture', apiKey: 'fixture-key', ...selection, confirm: true };
  const denied = await app.inject({ method: 'POST', url: '/api/pangolin/enable-mtls', remoteAddress,
    headers: { ...headers, origin }, payload });
  assert.equal(denied.statusCode, 403);
  const session = (await app.inject({ url: '/api/session', remoteAddress, headers })).json();
  const mutate = (body: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/pangolin/enable-mtls',
    remoteAddress, headers: { ...headers, origin, 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken }, payload: body });
  assert.equal(caInstallSchema.safeParse({ ...payload, confirm: false }).success, false);
  assert.equal((await mutate(payload)).json().code, 'CA_REQUIRED');
  await pki.createAuthority(user);
  fixture.trust.certificates.push({ mtlsCertificateId: 1, name: 'HA Pangolin Access CA',
    fingerprint: new X509Certificate(pki.publicCertificate()).fingerprint256, notAfter: Date.now() + 100000 });
  const result = await mutate(payload);
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().status, 'enabled');
  assert.equal(writes, 1);
});
