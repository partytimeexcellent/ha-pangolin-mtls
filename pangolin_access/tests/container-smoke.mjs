// Run inside the disposable CI container with an empty /data tmpfs.
// This exercises the real entrypoint and socket; no trusted peer is fabricated.
import assert from 'node:assert/strict';
import { writeFile, stat } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

try {
  await writeFile('/data/options.json', JSON.stringify({
    admin_user_ids: ['a'.repeat(32)], home_assistant_origin: 'https://ha.example.test', enable_certificate_management: true,
  }), { mode: 0o600 });
  await import('/app/dist/server/main.js');
  let response;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { response = await fetch('http://127.0.0.1:8099/api/status'); break; }
    catch { await delay(100); }
  }
  assert.ok(response, 'server must start');
  assert.equal(response.status, 403, 'loopback cannot bypass ingress');
  await response.arrayBuffer();
  assert.equal(process.getuid(), 1000, 'server must drop root');
  assert.equal(process.getgid(), 1000);
  assert.deepEqual(process.getgroups(), [1000]);
  assert.equal((await stat('/data/state')).mode & 0o777, 0o700);
  assert.equal(process.env.SUPERVISOR_TOKEN, undefined);
  const { PkiService } = await import('/app/dist/server/pki.js');
  const pki = await PkiService.open('/data/state/disposable-runtime-fixture');
  await pki.createAuthority('fixture');
  const issued = await pki.issue({ name: 'Disposable runtime fixture', platform: 'other', lifetimeDays: 1 }, 'fixture');
  const bundle = pki.download(issued.id, issued.token, 'fixture');
  assert.ok(bundle.length > 1000);
  bundle.fill(0);
  await pki.close();
  console.log('Runtime smoke check passed: root dropped, state private, direct HTTP denied, disposable CA/P12 generated.');
  process.kill(process.pid, 'SIGTERM');
} catch {
  console.error('Runtime smoke check failed.');
  process.exit(1);
}
