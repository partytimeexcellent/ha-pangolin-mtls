import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { PkiService } from '../server/pki.js';
import { openssl } from '../server/openssl.js';
import { ExpiryReminders, expiryStage, homeAssistantNotifier, type Notice } from '../server/reminders.js';
import { createApp } from '../server/app.js';

const day = 86_400_000;
const actor = 'a'.repeat(32);

test('ZIP is a single-use encrypted P12; replacement confirmation records a test without revoking the old identity', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ha-replacement-'));
  const service = await PkiService.open(root);
  const origin = 'https://ha.example.test';
  const headers = { 'x-remote-user-id': actor, 'x-ingress-path': '/api/hassio_ingress/disposable_fixture_for_tests/' };
  const remoteAddress = '172.30.32.2';
  const app = await createApp({ admin_user_ids: [actor], home_assistant_origin: origin, enable_certificate_management: true }, { pki: service });
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  const post = async (url: string, payload: Record<string, unknown>) => {
    const session = (await app.inject({ url: '/api/session', headers, remoteAddress })).json();
    return app.inject({ method: 'POST', url, payload, remoteAddress, headers: { ...headers, origin,
      'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken } });
  };
  await service.createAuthority(actor);
  const input = { name: 'Disposable device', platform: 'ios', lifetimeDays: 30 };
  const old = await service.issue(input, actor);
  const original = service.inventory()[0]!;
  const replaceResponse = await post('/api/certificates', { ...input, replacesId: old.id });
  assert.equal(replaceResponse.statusCode, 200);
  const replacement = replaceResponse.json();
  assert.notEqual(replacement.certificate.fingerprint, old.certificate.fingerprint);
  assert.equal(replacement.certificate.replacesId, old.id);
  assert.equal((await post(`/api/certificates/${replacement.id}/confirm-replacement`, { confirm: true })).statusCode, 400);
  const unauthorized = await app.inject({ url: `/api/certificates/${replacement.id}/download`, method: 'POST', remoteAddress,
    headers: { ...headers, origin }, payload: { token: replacement.token, format: 'zip' } });
  assert.equal(unauthorized.statusCode, 403);
  const downloaded = await post(`/api/certificates/${replacement.id}/download`, { token: replacement.token, format: 'zip' });
  assert.equal(downloaded.statusCode, 200);
  assert.match(String(downloaded.headers['content-type']), /^application\/zip/);
  assert.equal(downloaded.headers['cache-control'], 'no-store');
  const files = unzipSync(downloaded.rawPayload);
  assert.deepEqual(Object.keys(files).sort(), [`ha-device-${replacement.id}.mobileconfig`, `ha-device-${replacement.id}.p12`]);
  const profile = Buffer.from(files[`ha-device-${replacement.id}.mobileconfig`]!).toString();
  const embedded = profile.match(/<data>([A-Za-z0-9+/=]+)<\/data>/)![1]!;
  assert.deepEqual(Buffer.from(embedded, 'base64'), Buffer.from(files[`ha-device-${replacement.id}.p12`]!));
  assert.ok(!profile.includes(replacement.password));
  const packagePath = join(root, 'fixture.p12');
  await writeFile(packagePath, files[`ha-device-${replacement.id}.p12`]!, { mode: 0o600 });
  await openssl(['pkcs12', '-in', packagePath, '-passin', 'fd:3', '-noout'], [replacement.password]);
  await assert.rejects(openssl(['pkcs12', '-in', packagePath, '-passin', 'fd:3', '-noout'], ['incorrect']));
  assert.equal((await post(`/api/certificates/${replacement.id}/download`, { token: replacement.token, format: 'p12' })).statusCode, 410);
  assert.equal((await post(`/api/certificates/${replacement.id}/confirm-replacement`, {})).statusCode, 400);
  assert.equal((await post(`/api/certificates/${replacement.id}/confirm-replacement`, { confirm: true })).statusCode, 200);
  const confirmedAt = service.inventory().find((cert) => cert.id === replacement.id)!.replacementConfirmedAt;
  assert.ok(confirmedAt);
  assert.deepEqual(service.inventory().find((cert) => cert.id === old.id), original);
  assert.equal((await post(`/api/certificates/${replacement.id}/confirm-replacement`, { confirm: true })).statusCode, 200);
  assert.equal(service.inventory().find((cert) => cert.id === replacement.id)!.replacementConfirmedAt, confirmedAt);
  // The database has no plaintext package password or capability, even after confirmation.
  const stored = await readFile(join(root, 'state.sqlite'));
  assert.ok(!stored.includes(replacement.password));
  assert.ok(!stored.includes(replacement.token));
});

test('expiry stages select only the closest crossed threshold, including expiration', () => {
  const time = Date.now();
  const stage = (days: number) => expiryStage(new Date(time + days * day).toISOString(), time);
  assert.equal(stage(31), undefined); assert.equal(stage(30), 30); assert.equal(stage(15), 30);
  assert.equal(stage(14), 14); assert.equal(stage(7), 7); assert.equal(stage(0.5), 1);
  assert.equal(stage(0), 0); assert.equal(stage(-5), 0);
  assert.equal(expiryStage('invalid', time), undefined);
});

test('reminders survive restarts, deduplicate thresholds, retry failures and suppress confirmed older identities', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ha-reminders-'));
  let pki = await PkiService.open(root);
  let now = Date.now();
  t.after(async () => { await pki.close(); await rm(root, { recursive: true, force: true }); });
  const oldId = randomUUID(), newId = randomUUID();
  const db = new DatabaseSync(join(root, 'state.sqlite'));
  const insert = db.prepare('INSERT INTO certificates(id,name,platform,serial,fingerprint,issuedAt,expiresAt,certificate,exportStatus,replacesId,replacementConfirmedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  insert.run(oldId, 'Older device', 'ios', '1', '1', new Date(now).toISOString(), new Date(now + 10 * day).toISOString(), 'fixture-public-only', 'downloaded', null, null);
  insert.run(newId, '[Link](https://private.example.test)', 'ios', '2', '2', new Date(now).toISOString(), new Date(now + 10 * day).toISOString(), 'fixture-public-only', 'downloaded', oldId, new Date(now).toISOString());
  db.close();
  const notices: Notice[] = [];
  let failures = 0;
  const send = async (notice: Notice) => { if (failures-- > 0) throw new Error('secret upstream details'); notices.push(notice); };
  let reminders = new ExpiryReminders(pki, send, () => now);
  await Promise.all([reminders.tick(), reminders.tick()]);
  assert.equal(notices.length, 1);
  assert.ok(!notices[0]!.message.includes('Older device'));
  assert.ok(!notices[0]!.message.includes('https://'));
  assert.match(notices[0]!.message, /14 day/);
  await reminders.tick(); assert.equal(notices.length, 1);
  await reminders.close(); await pki.close();
  pki = await PkiService.open(root);
  reminders = new ExpiryReminders(pki, send, () => now);
  now += 2 * day;
  await reminders.tick(); assert.equal(notices.length, 1, 'already-delivered threshold persists');
  now += 2 * day; failures = 1;
  await reminders.tick(); assert.equal(reminders.status().deliveryFailed, true);
  await reminders.tick(); assert.equal(notices.length, 1, 'failures have a one-hour cooldown');
  now += 60 * 60_000;
  await reminders.tick(); assert.equal(notices.length, 2); assert.equal(reminders.status().deliveryFailed, false);
  assert.match(notices[1]!.message, /7 day/);
  assert.equal(notices[0]!.notification_id, notices[1]!.notification_id);
  now += 10 * day;
  await reminders.tick(); assert.equal(notices.length, 3); assert.match(notices[2]!.message, /expired/);
  now -= 10 * day;
  await reminders.tick(); assert.equal(notices.length, 3, 'clock reversal does not repeat stages');
  await reminders.close(); await reminders.tick(); assert.equal(notices.length, 3);
  const disabled = new ExpiryReminders(pki, undefined, () => now);
  await disabled.tick(); assert.equal(disabled.status().enabled, false); await disabled.close();
});

test('notification transport fixes the Core destination, rejects redirects and redacts errors', async () => {
  let calls = 0;
  const notify = homeAssistantNotifier('disposable-token', async (url, init) => {
    calls++;
    assert.equal(url, 'http://supervisor/core/api/services/persistent_notification/create');
    assert.equal(init!.redirect, 'error'); assert.equal(init!.method, 'POST');
    assert.equal((init!.headers as Record<string, string>).authorization, 'Bearer disposable-token');
    assert.ok(init!.signal);
    return new Response('private upstream error', { status: 403 });
  });
  await assert.rejects(notify({ title: 'test', message: 'test', notification_id: 'test' }), (error: unknown) => error instanceof Error && error.message === 'Notification delivery failed.');
  assert.equal(calls, 1);
});

test('version 1 storage migrates transactionally without changing authority or resurrecting exports', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ha-migration-'));
  let pki = await PkiService.open(root);
  t.after(async () => { await pki.close(); await rm(root, { recursive: true, force: true }); });
  await pki.createAuthority(actor);
  const fingerprint = pki.authority()!.fingerprint;
  const issued = await pki.issue({ name: 'Migration fixture', platform: 'ios', lifetimeDays: 30 }, actor);
  await pki.close();
  // Restore the exact previous table layout, including a pending export record.
  const db = new DatabaseSync(join(root, 'state.sqlite'));
  db.exec('ALTER TABLE certificates DROP COLUMN replacesId; ALTER TABLE certificates DROP COLUMN replacementConfirmedAt; DROP TABLE reminders; PRAGMA user_version=1;');
  db.close();
  pki = await PkiService.open(root);
  assert.equal(pki.authority()!.fingerprint, fingerprint);
  assert.equal(pki.inventory()[0]!.id, issued.id);
  assert.equal(pki.inventory()[0]!.replacesId, null);
  assert.equal(pki.inventory()[0]!.exportStatus, 'unavailable');
  assert.throws(() => pki.download(issued.id, issued.token, actor));
  const migrated = new DatabaseSync(join(root, 'state.sqlite'));
  assert.equal(migrated.prepare('PRAGMA user_version').get()!.user_version, 2); migrated.close();
});

test('Core notifications are opt-in and the scheduler finishes before storage closes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ha-notify-opt-in-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pki = await PkiService.open(root);
  const db = new DatabaseSync(join(root, 'state.sqlite'));
  const now = Date.now();
  const id = randomUUID();
  db.prepare('INSERT INTO certificates(id,name,platform,serial,fingerprint,issuedAt,expiresAt,certificate,exportStatus) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(id, 'Fixture', 'ios', '1', '1', new Date(now).toISOString(), new Date(now + day).toISOString(), 'public fixture', 'downloaded');
  db.close();
  let calls = 0;
  const settings = { pki, notificationSender: async () => { calls++; } };
  const options = { admin_user_ids: [actor], home_assistant_origin: 'https://ha.example.test', enable_certificate_management: true };
  const off = await createApp(options, settings);
  await off.ready(); assert.equal(calls, 0); await off.close();
  const reopened = await PkiService.open(root);
  const on = await createApp({ ...options, enable_home_assistant_notifications: true }, { ...settings, pki: reopened });
  await on.ready(); await on.close();
  assert.equal(calls, 1);
});
