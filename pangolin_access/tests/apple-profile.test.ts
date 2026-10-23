import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appleProfile, profileDisplayName } from '../server/apple-profile.js';
import { PkiService } from '../server/pki.js';
import { createApp } from '../server/app.js';
import { openssl } from '../server/openssl.js';

// Independent XML/plist parser: Python is a test prerequisite, not a runtime dependency.
function parseProfile(data: Buffer) {
  return JSON.parse(execFileSync('python3', ['-c', `
import sys,plistlib,json,hashlib
p=plistlib.loads(sys.stdin.buffer.read())
assert p['PayloadType']=='Configuration' and p['PayloadVersion']==1
assert set(p)=={'PayloadType','PayloadVersion','PayloadIdentifier','PayloadUUID','PayloadDisplayName','PayloadDescription','PayloadOrganization','PayloadContent'}
assert len(p['PayloadContent'])==1
c=p['PayloadContent'][0]
assert c['PayloadType']=='com.apple.security.pkcs12' and c['PayloadVersion']==1
assert set(c)=={'PayloadType','PayloadVersion','PayloadIdentifier','PayloadUUID','PayloadDisplayName','PayloadCertificateFileName','PayloadContent'}
print(json.dumps({'name':p['PayloadDisplayName'],'identityName':c['PayloadDisplayName'],'identifier':p['PayloadIdentifier'],'uuid':p['PayloadUUID'],'payloadUuid':c['PayloadUUID'],'digest':hashlib.sha256(c['PayloadContent']).hexdigest()}))
`], { input: data }).toString()) as { name: string; identityName: string; identifier: string; uuid: string; payloadUuid: string; digest: string };
}

test('named Apple profile escapes XML, preserves the encrypted identity and includes no password or management payload', () => {
  const id = randomUUID();
  const name = `Fixture's iPhone & <dict><key>Password</key></dict> "📱"`;
  const expiresAt = '2027-01-01T00:00:00.000Z';
  const p12 = Buffer.from('disposable-encrypted-package-fixture');
  const parsed = parseProfile(appleProfile({ id, name, expiresAt }, p12));
  const expected = `Home Assistant mTLS - ${name} - expires Jan 2027`;
  assert.equal(parsed.name, expected); assert.equal(parsed.identityName, expected);
  assert.equal(parsed.uuid, id); assert.notEqual(parsed.payloadUuid, id);
  assert.equal(parsed.digest, createHash('sha256').update(p12).digest('hex'));
  assert.equal(profileDisplayName('Fixture', '2027-02-01T00:00:00Z'), 'Home Assistant mTLS - Fixture - expires Feb 2027');
  assert.equal(parseProfile(appleProfile({ id, name: 'Invalid\ud800\uffff', expiresAt }, p12)).name, 'Home Assistant mTLS - Invalid\ufffd\ufffd - expires Jan 2027');
  const another = parseProfile(appleProfile({ id: randomUUID(), name, expiresAt }, p12));
  assert.notEqual(parsed.identifier, another.identifier, 'new certificates must not silently replace an installed profile');
});

test('Safari profile API requires authorization and consumes the same five-minute single-use export', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ha-profile-'));
  let offset = 0;
  const pki = await PkiService.open(root, () => Date.now() + offset);
  const actor = 'a'.repeat(32), origin = 'https://ha.example.test';
  const headers = { 'x-remote-user-id': actor, 'x-ingress-path': '/api/hassio_ingress/disposable_fixture_for_tests/' };
  const remoteAddress = '172.30.32.2';
  const app = await createApp({ admin_user_ids: [actor], home_assistant_origin: origin, enable_certificate_management: true }, { pki });
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  const post = async (url: string, payload: Record<string, unknown>) => {
    const session = (await app.inject({ url: '/api/session', headers, remoteAddress })).json();
    return app.inject({ method: 'POST', url, payload, remoteAddress, headers: { ...headers, origin, 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken } });
  };
  await pki.createAuthority(actor);
  const issued = await pki.issue({ name: "Fixture's iPhone", platform: 'ios', lifetimeDays: 90 }, actor);
  const url = `/api/certificates/${issued.id}/download`;
  assert.match(issued.profileDisplayName, /^Home Assistant mTLS - Fixture's iPhone - expires [A-Z][a-z]{2} \d{4}$/);
  assert.equal((await app.inject({ url, headers, remoteAddress })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url, payload: { token: issued.token, format: 'mobileconfig' }, headers: { ...headers, origin }, remoteAddress })).statusCode, 403);
  assert.throws(() => pki.download(issued.id, issued.token, 'other-actor', 'mobileconfig'));
  const result = await post(url, { token: issued.token, format: 'mobileconfig' });
  assert.equal(result.statusCode, 200);
  assert.match(String(result.headers['content-type']), /^application\/x-apple-aspen-config/);
  assert.match(String(result.headers['content-disposition']), /\.mobileconfig"$/);
  assert.equal(result.headers['cache-control'], 'no-store');
  const parsed = parseProfile(result.rawPayload);
  assert.equal(parsed.name, issued.profileDisplayName);
  assert.ok(!result.body.includes(issued.password));
  const embedded = Buffer.from(result.body.match(/<data>([A-Za-z0-9+/=]+)<\/data>/)![1]!, 'base64');
  const path = join(root, 'fixture.p12'); await writeFile(path, embedded, { mode: 0o600 });
  await openssl(['pkcs12', '-in', path, '-passin', 'fd:3', '-noout'], [issued.password]);
  assert.equal((await post(url, { token: issued.token, format: 'p12' })).statusCode, 410);
  assert.equal((await post(url, { token: issued.token, format: 'zip' })).statusCode, 410);
  const expiring = await pki.issue({ name: 'Expiry fixture', platform: 'ios', lifetimeDays: 30 }, actor);
  offset += 300_001;
  assert.throws(() => pki.download(expiring.id, expiring.token, actor, 'mobileconfig'));
});
