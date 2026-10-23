import { readFile, mkdir, chown, chmod } from 'node:fs/promises';
import { optionsSchema } from './config.js';
import { createApp } from './app.js';

process.umask(0o077);
// Read Supervisor options before dropping privileges. No environment overrides or auth bypass.
async function main() {
  const options = optionsSchema.parse(JSON.parse(await readFile('/data/options.json', 'utf8')));
  await mkdir('/data/state', { recursive: true, mode: 0o700 });
  if (process.getuid?.() === 0) {
    await chown('/data/state', 1000, 1000);
    await chmod('/data/state', 0o700);
    process.setgroups!([]);
    process.setgid!(1000);
    process.setuid!(1000);
  }
  delete process.env.SUPERVISOR_TOKEN;
  const app = await createApp(options, {
    onAccessDenied: (code) => process.stdout.write(JSON.stringify({ event: 'access_denied', code }) + '\n'),
  });
  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 10_000);
      deadline.unref();
      void app.close().then(() => { clearTimeout(deadline); process.exitCode = 0; });
    });
  }
  await app.listen({ host: '0.0.0.0', port: 8099 });
  process.stdout.write('HA Pangolin Access ingress prototype started; signing disabled.\n');
}

main().catch(() => {
  process.stderr.write('Startup failed. Check app options and /data permissions.\n');
  process.exitCode = 1;
});
