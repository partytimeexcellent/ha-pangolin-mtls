import { Administrators, coreUserDirectory } from './administrators.js';
import { readFile, mkdir, chown, chmod, lstat } from 'node:fs/promises';
import { startupOptionsSchema } from './config.js';
import { resolveOptions, ExternalUrlError } from './resolve-options.js';
import { createApp } from './app.js';
import { homeAssistantNotifier } from './reminders.js';
import { PkiService } from './pki.js';

process.umask(0o077);
// Read Supervisor options before dropping privileges. No environment overrides or auth bypass.
async function main() {
  const input = startupOptionsSchema.parse(JSON.parse(await readFile('/data/options.json', 'utf8')));
  const supervisorToken = process.env.SUPERVISOR_TOKEN;
  delete process.env.SUPERVISOR_TOKEN;
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
  const { options, source } = await resolveOptions(input, supervisorToken);
  const notificationToken = options.enable_home_assistant_notifications && options.enable_certificate_management ? supervisorToken : undefined;
  if (options.enable_home_assistant_notifications && options.enable_certificate_management && !notificationToken) throw new Error('Notification credential unavailable.');
  const pki = options.enable_certificate_management ? await PkiService.open('/data/state') : undefined;
  const administrators = supervisorToken ? await Administrators.open('/data/state/administrators.json', coreUserDirectory(supervisorToken)) : undefined;
  const app = await createApp(options, {
    administrators,
    pki, homeAssistantUrlSource: source,
    notificationSender: notificationToken ? homeAssistantNotifier(notificationToken) : undefined,
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

main().catch((error: unknown) => {
  process.stderr.write(error instanceof ExternalUrlError
    ? 'Startup failed: set Home Assistant External URL in this app Configuration, or configure a valid external URL in Home Assistant. HTTPS is required for certificate management.\n'
    : 'Startup failed. Check app options and /data permissions.\n');
  process.exitCode = 1;
});
