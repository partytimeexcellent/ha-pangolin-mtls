import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installCa } from '../server/ca-install.js';
import { PangolinError } from '../server/pangolin.js';
import { resourceFixture } from './fixtures/resource.js';

function temporaryCa() {
  const dir = mkdtempSync(join(tmpdir(), 'ha-pangolin-ca-test-'));
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-batch', '-days', '3',
      '-subj', '/CN=Fixture CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'ca.pem')], { stdio: 'ignore' });
    return readFileSync(join(dir, 'ca.pem'), 'utf8');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const selection = { resourceIdentifier: 'test-resource', hostname: 'ha-test.example.test' };
const withWriteRoute = (fixture: ReturnType<typeof resourceFixture>) => async (path: string, auth: boolean) => {
  if (path !== '/openapi.json') return fixture.read(path, auth);
  const original = await fixture.read(path, auth) as { openapi: string; paths: Record<string, unknown> };
  return { ...original, paths: { ...original.paths, '/public-resource-policy/{resourcePolicyId}/mtls/certificate': { put: {} } } };
};

test('CA upload is scoped, verified, and repeated selection does not upload twice', async () => {
  const pem = temporaryCa();
  const fingerprint = new X509Certificate(pem).fingerprint256;
  const fixture = resourceFixture();
  let writes = 0;
  const write = async (path: string, body: unknown) => {
    assert.equal(path, '/public-resource-policy/9/mtls/certificate');
    assert.deepEqual(body, { certificate: pem, name: 'HA Pangolin Access CA' });
    writes++;
    fixture.trust.certificates.push({ mtlsCertificateId: 1, name: 'HA Pangolin Access CA', fingerprint, notAfter: Date.now() + 100000 });
    return { success: true };
  };
  assert.equal((await installCa(withWriteRoute(fixture), write, 'fixture', selection, pem)).status, 'installed');
  assert.equal((await installCa(withWriteRoute(fixture), write, 'fixture', selection, pem)).status, 'already-installed');
  assert.equal(writes, 1);
});

test('shared policy blocks upload before any write', async () => {
  const pem = temporaryCa();
  const fixture = resourceFixture();
  fixture.selected.resourcePolicyId = 10;
  fixture.policies.sharedPolicy = { ...fixture.inline, resourcePolicyId: 10 };
  let writes = 0;
  await assert.rejects(installCa(withWriteRoute(fixture), async () => { writes++; return {}; }, 'fixture', selection, pem),
    (error: unknown) => error instanceof PangolinError && error.code === 'PANGOLIN_RESOURCE_INELIGIBLE');
  assert.equal(writes, 0);
});
