import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import { PkiService } from '../server/pki.js';
import { ReminderPreference } from '../server/reminder-preference.js';
import { checked } from '../web/pki-api.js';
import { optionsSchema } from '../server/config.js';

const user = 'a'.repeat(32);
const origin = 'https://ha.example.test';
const headers = { 'x-remote-user-id': user, 'x-ingress-path': '/api/hassio_ingress/disposable_fixture_for_tests/' };
const remoteAddress = '172.30.32.2';
const webRoot = fileURLToPath(new URL('../dist/web', import.meta.url));

test('certificate API keeps existing authorization, explicit CA confirmation and one-use POST downloads', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ha-pki-api-'));
  const pki = await PkiService.open(root);
  const app = await createApp({ admin_user_ids: [user], home_assistant_origin: origin, enable_certificate_management: true }, { pki, webRoot });
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  const mutate = async (url: string, body: Record<string, unknown>) => {
    const session = (await app.inject({ url: '/api/session', remoteAddress, headers })).json();
    return app.inject({ url, method: 'POST', remoteAddress,
      headers: { ...headers, origin, 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken }, payload: body });
  };
  assert.equal((await app.inject({ url: '/api/status', headers, remoteAddress })).json().signingEnabled, true);
  assert.equal(pki.authority(), null);
  const forbidden = await app.inject({ method: 'POST', url: '/api/ca', headers: { ...headers, origin }, remoteAddress, payload: { confirm: true } });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(pki.authority(), null);
  assert.equal((await mutate('/api/ca', {})).statusCode, 400);
  assert.equal((await mutate('/api/ca', { confirm: true })).statusCode, 200);
  const publicCa = await app.inject({ url: '/api/ca/certificate', headers, remoteAddress });
  assert.equal(publicCa.statusCode, 200);
  assert.equal(publicCa.headers['cache-control'], 'no-store');
  assert.ok(publicCa.body.includes('BEGIN CERTIFICATE'));
  assert.ok(!publicCa.body.includes('PRIVATE KEY'));
  const issuedResponse = await mutate('/api/certificates', { name: '<script>fixture</script>', platform: 'ios', lifetimeDays: 30 });
  assert.equal(issuedResponse.statusCode, 200);
  const issued = issuedResponse.json();
  const getAttempt = await app.inject({ url: `/api/certificates/${issued.id}/download`, headers, remoteAddress });
  assert.equal(getAttempt.statusCode, 404, 'GET must not redeem packages');
  const downloaded = await mutate(`/api/certificates/${issued.id}/download`, { token: issued.token });
  assert.equal(downloaded.statusCode, 200);
  assert.ok(String(downloaded.headers['content-type']).startsWith('application/x-pkcs12'));
  assert.equal(downloaded.headers['cache-control'], 'no-store');
  assert.equal((await mutate(`/api/certificates/${issued.id}/download`, { token: issued.token })).statusCode, 410);
  const inventory = (await app.inject({ url: '/api/pki', headers, remoteAddress })).json();
  assert.equal(inventory.certificates[0].exportStatus, 'downloaded');
  assert.ok(!JSON.stringify(inventory).includes(issued.password));
  assert.ok(!JSON.stringify(inventory).includes(issued.token));
  assert.ok(!JSON.stringify(inventory).includes('PRIVATE KEY'));
});

test('certificate management is default-off even if a service exists', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ha-pki-off-'));
  const pki = await PkiService.open(root);
  const app = await createApp({ admin_user_ids: [user], home_assistant_origin: origin }, { pki, webRoot });
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  assert.equal((await app.inject({ url: '/api/pki', headers, remoteAddress })).statusCode, 503);
  assert.equal((await app.inject({ url: '/api/status', headers, remoteAddress })).json().signingEnabled, false);
  assert.equal(pki.authority(), null);
});

test('expiry reminders move to protected UI control and persist independently of old app options', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ha-reminder-setting-'));
  const preferenceFile = join(root, 'reminders.json');
  const preference = await ReminderPreference.open(preferenceFile, true);
  const pki = await PkiService.open(root);
  const app = await createApp({ admin_user_ids: [user], home_assistant_origin: origin,
    enable_certificate_management: true, enable_home_assistant_notifications: preference.enabled() },
    { pki, reminderPreference: preference, notificationSender: async () => {}, webRoot });
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  assert.equal((await app.inject({ url: '/api/pki', headers, remoteAddress })).json().reminders.enabled, true);
  assert.equal((await app.inject({ method: 'POST', url: '/api/reminders', remoteAddress,
    headers: { ...headers, origin }, payload: { enabled: false } })).statusCode, 403);
  const session = (await app.inject({ url: '/api/session', remoteAddress, headers })).json();
  const protectedHeaders = { ...headers, origin, 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken };
  const post = (enabled: boolean) => app.inject({ method: 'POST', url: '/api/reminders', remoteAddress,
    headers: protectedHeaders, payload: { enabled } });
  assert.equal((await post(false)).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/pki', headers, remoteAddress })).json().reminders.enabled, false);
  assert.equal((await ReminderPreference.open(preferenceFile, true)).enabled(), false, 'saved UI choice overrides old Supervisor value');
  assert.equal((await post(true)).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/pki', headers, remoteAddress })).json().reminders.enabled, true);
  assert.equal((await ReminderPreference.open(preferenceFile, false)).enabled(), true);
});

test('certificate error rendering never echoes raw server data', async () => {
  const failed = Response.json({ code: 'attacker-controlled', error: 'private-secret' }, { status: 500 });
  await assert.rejects(checked(failed), (error: unknown) => error instanceof Error && !error.message.includes('private-secret') && error.message.includes('REQUEST_FAILED'));
  await assert.rejects(checked(Response.json({ code: 'EXPORT_UNAVAILABLE' }, { status: 410 })), /EXPORT_UNAVAILABLE/);
});

test('certificate management requires HTTPS while HTTP ingress checks may remain available', () => {
  assert.equal(optionsSchema.safeParse({ admin_user_ids: [user], home_assistant_origin: 'http://ha.example.test', enable_certificate_management: true }).success, false);
  assert.equal(optionsSchema.safeParse({ admin_user_ids: [user], home_assistant_origin: 'http://ha.example.test', enable_certificate_management: false }).success, true);
});
