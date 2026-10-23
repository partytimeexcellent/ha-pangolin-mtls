import { readFile, mkdir, chown, chmod, lstat } from 'node:fs/promises';
import { optionsSchema } from './config.js';
import { createApp } from './app.js';
import { PkiService } from './pki.js';

process.umask(0o077);
// Read Supervisor options before dropping privileges. No environment overrides or auth bypass.
async function main() {
  const options = optionsSchema.parse(JSON.parse(await readFile('/data/options.json', 'utf8')));
  await mkdir('/data/state', { recursive: true, mode: 0o700 });
  const state = await lstat('/data/state');
  if (!state.isDirectory() || state.isSymbolicLink()) throw new Error('Invalid state directory.');
  if (process.getuid?.() === 0) {
    await chown('/data/state', 1000, 1000);
    await chmod('/data/state', 0o700);
    process.setgroups!([]);
    process.setgid!(1000);
    process.setuid!(1000);
  }
  delete process.env.SUPERVISOR_TOKEN;
  const pki = options.enable_certificate_management ? await PkiService.open('/data/state') : undefined;
  const app = await createApp(options, {
    pki,
    onAccessDenied: (code) => process.stdout.write(JSON.stringify({ event: 'access_denied', code }) + '\n'),
  });
  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 90_000);
      deadline.unref();
      void app.close().then(() => { clearTimeout(deadline); process.exitCode = 0; });
    });
  }
  await app.listen({ host: '0.0.0.0', port: 8099 });
  process.stdout.write(`HA Pangolin Access started; certificate management ${pki ? 'enabled' : 'disabled'}.\n`);
}

main().catch(() => {
  process.stderr.write('Startup failed. Check app options and /data permissions.\n');
  process.exitCode = 1;
});
