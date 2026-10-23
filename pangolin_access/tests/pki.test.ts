import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { chmod, copyFile, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PkiService } from '../server/pki.js';
import { openssl, PkiError } from '../server/openssl.js';

const input = { name: 'Disposable iPhone', platform: 'ios', lifetimeDays: 90 };
const isCode = (code: string) => (error: unknown) => error instanceof PkiError && error.code === code;

test('CA, issuance, encrypted P12, expiry, single-use and restart lifecycle', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ha-pki-test-'));
  const directory = join(root, 'state');
  const scratch = join(root, 'scratch');
  await mkdir(scratch, { mode: 0o700 });
  let offset = 0;
  let service = await PkiService.open(directory, () => Date.now() + offset, scratch);
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  assert.equal(service.authority(), null);
  await assert.rejects(service.issue(input, 'fixture-actor'), isCode('CA_REQUIRED'));

  const authority = await service.createAuthority('fixture-actor');
  assert.ok(authority);
  const ca = new X509Certificate(service.publicCertificate());
  assert.equal(ca.ca, true);
  assert.equal(ca.publicKey.asymmetricKeyDetails?.modulusLength, 3072);
  assert.equal(ca.verify(ca.publicKey), true);
  await assert.rejects(service.createAuthority('fixture-actor'), isCode('CA_ALREADY_EXISTS'));
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(join(directory, 'state.sqlite'))).mode & 0o777, 0o600);
  assert.equal((await stat(join(directory, 'unlock.key'))).mode & 0o777, 0o600);
  const inspector = new DatabaseSync(join(directory, 'state.sqlite'));
  const stored = inspector.prepare('SELECT encrypted_key FROM authority').get()!.encrypted_key as string;
  assert.ok(stored.includes('BEGIN ENCRYPTED PRIVATE KEY'));
  assert.throws(() => createPrivateKey(stored), 'encrypted CA key must require its unlock secret');
  inspector.close();

  const issued = await service.issue(input, 'fixture-actor');
  assert.equal(service.inventory()[0]!.exportStatus, 'pending');
  assert.equal(issued.password.length, 32);
  assert.equal(issued.token.length, 64);
  assert.deepEqual(await readdir(scratch), [], 'raw signing inputs must be removed');
  assert.ok(!(await readFile(join(directory, 'state.sqlite'))).includes(issued.password));
  assert.ok(!(await readFile(join(directory, 'state.sqlite'))).includes(issued.token));
  assert.throws(() => service.download(issued.id, issued.token, 'different-actor'), isCode('EXPORT_UNAVAILABLE'));
  assert.throws(() => service.download(issued.id, '0'.repeat(64), 'fixture-actor'), isCode('EXPORT_UNAVAILABLE'));
  const packageData = service.download(issued.id, issued.token, 'fixture-actor');
  assert.throws(() => service.download(issued.id, issued.token, 'fixture-actor'), isCode('EXPORT_UNAVAILABLE'));
  assert.equal(service.inventory()[0]!.exportStatus, 'downloaded');
  const packagePath = join(root, 'disposable.p12');
  await writeFile(packagePath, packageData, { mode: 0o600 });
  await openssl(['pkcs12', '-in', packagePath, '-passin', 'fd:3', '-noout'], [issued.password]);
  await assert.rejects(openssl(['pkcs12', '-in', packagePath, '-passin', 'fd:3', '-noout'], ['wrong-password']), isCode('CRYPTO_FAILED'));
  const material = await openssl(['pkcs12', '-in', packagePath, '-passin', 'fd:3', '-nodes'], [issued.password]);
  const certs = [...material.toString().matchAll(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)].map((match) => new X509Certificate(match[0]));
  const privateMatch = material.toString().match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/);
  assert.ok(privateMatch, 'one client key must be present');
  assert.equal(certs.length, 2);
  const leaf = certs.find((cert) => !cert.ca)!;
  const leafKey = createPrivateKey(privateMatch[0]);
  assert.equal(leaf.checkPrivateKey(leafKey), true);
  assert.equal(ca.checkPrivateKey(leafKey), false, 'CA private key must not be exported');
  assert.equal(leaf.verify(ca.publicKey), true);
  assert.equal(leaf.publicKey.asymmetricKeyDetails?.modulusLength, 3072);
  assert.ok(leaf.keyUsage?.includes('1.3.6.1.5.5.7.3.2'));
  assert.ok(!leaf.subject.includes(input.name), 'user names must not enter OpenSSL config or subjects');
  assert.ok(Date.parse(leaf.validTo) <= Date.parse(ca.validTo));
  const caPath = join(root, 'ca.pem');
  const leafPath = join(root, 'leaf.pem');
  await writeFile(caPath, ca.toString()); await writeFile(leafPath, leaf.toString());
  await openssl(['verify', '-purpose', 'sslclient', '-CAfile', caPath, leafPath]);
  await assert.rejects(openssl(['verify', '-purpose', 'sslserver', '-CAfile', caPath, leafPath]), isCode('CRYPTO_FAILED'));
  await assert.rejects(openssl(['verify', '-attime', String(Math.floor(Date.parse(leaf.validTo) / 1000) + 1), '-CAfile', caPath, leafPath]), isCode('CRYPTO_FAILED'));
  material.fill(0); packageData.fill(0);

  const next = await service.issue({ ...input, name: 'Another fixture', platform: 'macos' }, 'fixture-actor');
  assert.notEqual(next.certificate.serial, issued.certificate.serial);
  assert.notEqual(next.certificate.fingerprint, issued.certificate.fingerprint);
  offset += 300_001;
  assert.throws(() => service.download(next.id, next.token, 'fixture-actor'), isCode('EXPORT_UNAVAILABLE'));
  assert.equal(service.inventory().find((item) => item.id === next.id)!.exportStatus, 'expired');
  offset = 0;
  const interrupted = await service.issue(input, 'fixture-actor');
  const fingerprint = service.authority()!.fingerprint;
  await service.close();
  service = await PkiService.open(directory, () => Date.now(), scratch);
  assert.equal(service.authority()!.fingerprint, fingerprint);
  assert.equal(service.inventory().length, 3);
  assert.equal(service.inventory().find((item) => item.id === interrupted.id)!.exportStatus, 'unavailable');
  assert.throws(() => service.download(interrupted.id, interrupted.token, 'fixture-actor'), isCode('EXPORT_UNAVAILABLE'));
  await assert.rejects(service.issue({ ...input, lifetimeDays: 366 }, 'fixture-actor'), isCode('INVALID_CERTIFICATE_INPUT'));
  await assert.rejects(service.issue({ ...input, name: '\nmalicious config' }, 'fixture-actor'), isCode('INVALID_CERTIFICATE_INPUT'));
  await service.close();

  // Cold-copy restore preserves the CA but never resurrects export capabilities.
  const restoredPath = join(root, 'restored'); await mkdir(restoredPath, { mode: 0o700 });
  await copyFile(join(directory, 'state.sqlite'), join(restoredPath, 'state.sqlite'));
  await copyFile(join(directory, 'unlock.key'), join(restoredPath, 'unlock.key'));
  const restored = await PkiService.open(restoredPath);
  assert.equal(restored.authority()!.fingerprint, fingerprint);
  assert.equal(restored.inventory().length, 3);
  await restored.close();
  const savedUnlock = await readFile(join(restoredPath, 'unlock.key'));
  await writeFile(join(restoredPath, 'unlock.key'), '0'.repeat(64));
  await assert.rejects(PkiService.open(restoredPath), 'wrong unlock material must fail closed');
  await writeFile(join(restoredPath, 'unlock.key'), savedUnlock);
  savedUnlock.fill(0);
  await rm(join(restoredPath, 'unlock.key'));
  await assert.rejects(PkiService.open(restoredPath), isCode('UNLOCK_SECRET_MISSING'));
});

test('failed issuance cleans scratch files and cannot replace an existing CA', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ha-pki-failure-'));
  const scratch = join(root, 'scratch'); await mkdir(scratch, { mode: 0o700 });
  const service = await PkiService.open(join(root, 'state'), () => Date.now(), scratch);
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = '/no-such-executable-directory';
    await assert.rejects(service.createAuthority('fixture'), isCode('CRYPTO_FAILED'));
  } finally { process.env.PATH = originalPath; }
  assert.equal(service.authority(), null);
  assert.deepEqual(await readdir(scratch), []);
  await service.createAuthority('fixture');
  const creating = service.issue(input, 'fixture');
  await assert.rejects(service.issue(input, 'fixture'), isCode('PKI_BUSY'));
  await creating;
});

test('unsupported metadata schema fails closed', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ha-pki-schema-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const db = new DatabaseSync(join(root, 'state.sqlite')); db.exec('PRAGMA user_version=99'); db.close();
  await chmod(join(root, 'state.sqlite'), 0o600);
  await assert.rejects(PkiService.open(root), isCode('STORAGE_VERSION'));
});
