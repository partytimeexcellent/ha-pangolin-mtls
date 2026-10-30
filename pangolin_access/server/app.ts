import { Administrators, AdministratorError, selectionSchema } from './administrators.js';
import { downloadFilename } from './download-names.js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import staticFiles from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import type { Options } from './config.js';
import { ExpiryReminders, type SendNotice } from './reminders.js';
import type { ReminderPreference } from './reminder-preference.js';
import { PkiService } from './pki.js';
import { PkiError } from './openssl.js';
import { apiUrlSchema, inspectPangolin, publicReader, publicWriter, PangolinError, type ReadJson, type WriteJson } from './pangolin.js';
import { inspectResource, resourceSelectionSchema } from './resource-inspection.js';
import { caInstallSchema, installCa } from './ca-install.js';

const peer = '172.30.32.2';
const sessionLifetime = 5 * 60_000;
const maxSessions = 256;
const ingressPath = /^\/api\/hassio_ingress\/[A-Za-z0-9_-]{16,256}\/?$/;
type Session = { user: string; path: string; csrf: string; expires: number };

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
}

function equalToken(left: string | undefined, right: string): boolean {
  if (!left || !/^[a-f0-9]{64}$/.test(left)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export async function createApp(options: Options, settings: {
  administrators?: Administrators;
  now?: () => number;
  homeAssistantUrlSource?: 'configuration' | 'home-assistant';
  webRoot?: string;
  onAccessDenied?: (code: string) => void;
  pki?: PkiService;
  notificationSender?: SendNotice;
  reminderPreference?: ReminderPreference;
  pangolinReader?: (base: string, key: string, signal: AbortSignal) => Promise<ReadJson>;
  pangolinWriter?: (base: string, key: string, signal: AbortSignal) => Promise<WriteJson>;
} = {}) {
  const now = settings.now ?? Date.now;
  const sessions = new Map<string, Session>();
  let pangolinBusy = false;
  const admins = new Set(options.admin_user_ids);
  const pki = options.enable_certificate_management === true ? settings.pki : undefined;
  const reminders = pki ? new ExpiryReminders(pki, options.enable_home_assistant_notifications ? settings.notificationSender : undefined, now) : undefined;
  function requirePki() {
    if (!pki) throw new PkiError('CERTIFICATES_DISABLED', 503);
    if (!options.home_assistant_origin.startsWith('https://')) throw new PkiError('HTTPS_REQUIRED', 403);
    return pki;
  }
  function deny(reply: FastifyReply, status: number, code: string, error: string) {
    // Only fixed application codes reach this callback; never forward request data.
    settings.onAccessDenied?.(code);
    return reply.code(status).send({ code, error });
  }
  // Never log request URLs, headers, identity or bodies (ingress URLs contain secrets).
  const app = Fastify({
    logger: false, trustProxy: false, bodyLimit: 4096,
    requestTimeout: 10_000, connectionTimeout: 10_000,
  });

  app.setErrorHandler(async (_error, _request, reply) => {
    if (_error instanceof AdministratorError) return reply.code(_error.statusCode).send({ code: _error.code, error: 'Administrator operation could not be completed.' });
    if (_error instanceof PangolinError) return reply.code(_error.statusCode).send({ code: _error.code, stage: _error.stage, error: 'Pangolin check could not be completed.' });
    if (_error instanceof PkiError) return reply.code(_error.statusCode).send({ code: _error.code, error: 'Certificate operation could not be completed.' });
    // Do not echo schema inputs, malformed request bodies or upstream errors.
    const status = _error instanceof Error && 'statusCode' in _error && typeof _error.statusCode === 'number'
      ? _error.statusCode : undefined;
    return reply.code(status && status >= 400 && status < 500 ? status : 500)
      .send({ code: status === 429 ? 'RATE_LIMITED' : 'REQUEST_FAILED', error: status === 429 ? 'Too many requests.' : 'Request could not be processed.' });
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.headers({
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'",
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    });
    const address = request.raw.socket.remoteAddress;
    if (address !== peer && address !== `::ffff:${peer}`) {
      return deny(reply, 403, 'INGRESS_PEER_REQUIRED', 'Ingress connection required.');
    }
    const user = header(request, 'x-remote-user-id');
    const bootstrap = options.enable_administrator_setup === true && admins.size === 0 && settings.administrators?.needsSelection() === true;
    const verifiedSetupAdmin = bootstrap && user && /^[a-f0-9]{32}$/.test(user) && options.home_assistant_origin.startsWith('https://')
      && (await settings.administrators!.users()).some(candidate => candidate.id === user);
    if (!user || (!admins.has(user) && !verifiedSetupAdmin && !(await settings.administrators?.authorized(user)))) {
      return deny(reply, 403, 'USER_NOT_AUTHORIZED', 'An explicitly authorized Home Assistant user is required.');
    }
    const path = header(request, 'x-ingress-path');
    if (!path || !ingressPath.test(path)) {
      return deny(reply, 400, 'INVALID_INGRESS_PATH', 'A valid ingress path is required.');
    }
    if (bootstrap) {
      const route = request.url.split('?')[0]!;
      const setupRoutes = ['/api/session', '/api/status', '/api/administration-status', '/api/authorization-check', '/api/administrators/list', '/api/administrators/save'];
      const asset = (request.method === 'GET' || request.method === 'HEAD') && (route === '/' || route.startsWith('/assets/'));
      if (!asset && !setupRoutes.includes(route)) return deny(reply, 403, 'ADMIN_SETUP_REQUIRED', 'Confirm administrator selection before using this operation.');
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      if (header(request, 'origin') !== options.home_assistant_origin) {
        const suppliedOrigin = header(request, 'origin');
        const code = !suppliedOrigin ? 'ORIGIN_MISSING' : suppliedOrigin === 'null' ? 'ORIGIN_NULL' : 'ORIGIN_MISMATCH';
        return deny(reply, 403, code, 'Home Assistant origin required.');
      }
      const type = header(request, 'content-type')?.toLowerCase();
      if (!type || !/^application\/json(?:\s*;\s*charset=utf-8)?$/.test(type)) {
        return deny(reply, 415, 'JSON_REQUIRED', 'JSON required.');
      }
      const id = header(request, 'x-access-session');
      const session = id ? sessions.get(id) : undefined;
      if (!session || session.expires <= now() || session.user !== user || session.path !== path ||
          !equalToken(header(request, 'x-csrf-token'), session.csrf)) {
        return deny(reply, 403, 'SESSION_OR_CSRF_INVALID', 'A current authorized session and CSRF token are required.');
      }
    }
  });

  await app.register(rateLimit, {
    max: 60, timeWindow: 60_000,
    keyGenerator: (request) => header(request, 'x-remote-user-id') ?? 'unknown',
  });

  app.get('/api/session', { config: { rateLimit: { max: 10, timeWindow: 60_000 } } }, async (request, reply) => {
    const time = now();
    for (const [id, session] of sessions) if (session.expires <= time) sessions.delete(id);
    if (sessions.size >= maxSessions) return reply.code(503).send({ code: 'SESSION_CAPACITY', error: 'Session capacity reached. Try again later.' });
    const id = randomBytes(32).toString('hex');
    const csrf = randomBytes(32).toString('hex');
    sessions.set(id, {
      user: header(request, 'x-remote-user-id')!, path: header(request, 'x-ingress-path')!,
      csrf, expires: time + sessionLifetime,
    });
    return { sessionId: id, csrfToken: csrf, expiresAt: time + sessionLifetime };
  });

  app.post('/api/administrators/list', async (request) => {
    if (!options.home_assistant_origin.startsWith('https://')) throw new AdministratorError('HTTPS_REQUIRED', 403);
    if (!z.strictObject({}).safeParse(request.body).success) throw new AdministratorError('ADMIN_SELECTION_INVALID', 400);
    if (!settings.administrators) throw new AdministratorError('ADMIN_DIRECTORY_UNAVAILABLE');
    return settings.administrators.view(header(request, 'x-remote-user-id')!, [...admins]);
  });
  app.post('/api/administrators/save', async (request) => {
    if (!options.home_assistant_origin.startsWith('https://')) throw new AdministratorError('HTTPS_REQUIRED', 403);
    if (!settings.administrators) throw new AdministratorError('ADMIN_DIRECTORY_UNAVAILABLE');
    const input = selectionSchema.safeParse(request.body);
    if (!input.success) throw new AdministratorError('ADMIN_SELECTION_INVALID', 400);
    const result = await settings.administrators.save(header(request, 'x-remote-user-id')!, [...admins], input.data);
    sessions.clear();
    return result;
  });

  app.post('/api/administrators/finish', async (request) => {
    if (!options.home_assistant_origin.startsWith('https://')) throw new AdministratorError('HTTPS_REQUIRED', 403);
    if (!settings.administrators || !z.strictObject({}).safeParse(request.body).success) throw new AdministratorError('ADMIN_SELECTION_INVALID', 400);
    const actor = header(request, 'x-remote-user-id')!;
    const view = await settings.administrators.view(actor, [...admins]);
    const result = await settings.administrators.save(actor, [...admins], { ids: view.ids, revision: view.revision }, true);
    sessions.clear();
    return result;
  });

  app.get('/api/administration-status', async () => ({ setupComplete: settings.administrators?.setupComplete() ?? false }));

  app.get('/api/status', async () => ({
    stage: pki ? 'certificate-prototype' : 'ingress-prototype',
    homeAssistantUrl: options.home_assistant_origin,
    homeAssistantUrlSource: settings.homeAssistantUrlSource ?? 'configuration',
    signingEnabled: Boolean(pki),
    pangolinConfigured: false,
    liveIngressVerified: false,
  }));

  app.post('/api/reminders', async (request) => {
    requirePki();
    const input = z.strictObject({ enabled: z.boolean() }).safeParse(request.body);
    request.body = undefined;
    if (!input.success) throw new PkiError('INVALID_REMINDER_SETTING', 400);
    if (!reminders || !settings.reminderPreference || (input.data.enabled && !settings.notificationSender))
      throw new PkiError('REMINDERS_UNAVAILABLE', 503);
    await settings.reminderPreference.setEnabled(input.data.enabled);
    await reminders.configure(input.data.enabled ? settings.notificationSender : undefined);
    options.enable_home_assistant_notifications = input.data.enabled;
    return reminders.status();
  });

  app.post('/api/authorization-check', { config: { rateLimit: { max: 10, timeWindow: 60_000 } } }, async (request, reply) => {
    if (!z.strictObject({}).safeParse(request.body).success) {
      return reply.code(400).send({ code: 'INVALID_CHECK_BODY', error: 'An empty JSON object is required.' });
    }
    return { authorized: true, signingEnabled: Boolean(pki) };
  });

  for (const resourceCheck of [false, true]) app.post(resourceCheck ? '/api/pangolin/resource-check' : '/api/pangolin/check', { config: { rateLimit: { max: 2, timeWindow: 60_000 } } }, async (request) => {
    if (!options.home_assistant_origin.startsWith('https://')) throw new PangolinError('HTTPS_REQUIRED', 403);
    const credentials = z.strictObject({ orgId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
      apiKey: z.string().min(1).max(1024).regex(/^[\x21-\x7e]+$/), apiUrl: apiUrlSchema.optional() });
    const input = (resourceCheck ? credentials.extend(resourceSelectionSchema.shape) : credentials).safeParse(request.body);
    // No persistence or logging of this request-scoped credential.
    request.body = undefined;
    if (!input.success) throw new PangolinError('PANGOLIN_INPUT', 400);
    const apiUrl = input.data.apiUrl ?? options.pangolin_api_url;
    if (!apiUrl) throw new PangolinError('PANGOLIN_URL_REQUIRED', 400);
    if (pangolinBusy) throw new PangolinError('PANGOLIN_BUSY', 409);
    pangolinBusy = true;
    const deadline = resourceCheck ? 45_000 : 30_000;
    request.raw.socket.setTimeout?.(deadline + 5_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deadline);
    try {
      const read = await (settings.pangolinReader ?? publicReader)(apiUrl, input.data.apiKey, controller.signal);
      if (resourceCheck) return await inspectResource(read, input.data.orgId, resourceSelectionSchema.parse(input.data));
      return await inspectPangolin(read, input.data.orgId);
    } finally { clearTimeout(timer); controller.abort(); input.data.apiKey = ''; pangolinBusy = false; }
  });

  app.post('/api/pangolin/install-ca', { config: { rateLimit: { max: 2, timeWindow: 60_000 } } }, async (request) => {
    const service = requirePki();
    const input = caInstallSchema.safeParse(request.body);
    request.body = undefined;
    if (!input.success) throw new PangolinError('PANGOLIN_INPUT', 400);
    const apiUrl = input.data.apiUrl ?? options.pangolin_api_url;
    if (!apiUrl) throw new PangolinError('PANGOLIN_URL_REQUIRED', 400);
    if (pangolinBusy) throw new PangolinError('PANGOLIN_BUSY', 409);
    pangolinBusy = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    request.raw.socket.setTimeout?.(65_000);
    try {
      const read = await (settings.pangolinReader ?? publicReader)(apiUrl, input.data.apiKey, controller.signal);
      const write = await (settings.pangolinWriter ?? publicWriter)(apiUrl, input.data.apiKey, controller.signal);
      return await installCa(read, write, input.data.orgId, resourceSelectionSchema.parse(input.data), service.publicCertificate());
    } finally { clearTimeout(timer); controller.abort(); input.data.apiKey = ''; pangolinBusy = false; }
  });

  app.get('/api/pki', async () => {
    const service = requirePki();
    return { authority: service.authority(), certificates: service.inventory(), reminders: reminders!.status() };
  });
  app.get('/api/ca/certificate', async (_request, reply) => {
    return reply.type('application/x-pem-file').header('content-disposition', 'attachment; filename="ha-pangolin-ca.pem"')
      .send(requirePki().publicCertificate());
  });
  app.post('/api/ca', { config: { rateLimit: { max: 2, timeWindow: 60_000 } } }, async (request) => {
    if (!z.strictObject({ confirm: z.literal(true) }).safeParse(request.body).success) throw new PkiError('CONFIRMATION_REQUIRED', 400);
    return { authority: await requirePki().createAuthority(header(request, 'x-remote-user-id')!) };
  });
  app.post('/api/certificates', { config: { rateLimit: { max: 3, timeWindow: 60_000 } } }, async (request) => {
    const input = z.strictObject({
      name: z.string().trim().min(1).max(80).regex(/^[^\x00-\x1f\x7f]+$/),
      platform: z.enum(['ios', 'ipados', 'macos', 'other']),
      lifetimeDays: z.number().int().min(1).max(365).default(90),
      replacesId: z.string().uuid().optional(),
    }).safeParse(request.body);
    if (!input.success) throw new PkiError('INVALID_CERTIFICATE_INPUT', 400);
    return requirePki().issue(input.data, header(request, 'x-remote-user-id')!);
  });
  app.post('/api/certificates/:id/confirm-replacement', async (request) => {
    const params = z.strictObject({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success || !z.strictObject({ confirm: z.literal(true) }).safeParse(request.body).success) throw new PkiError('CONFIRMATION_REQUIRED', 400);
    return requirePki().confirmReplacement(params.data.id, header(request, 'x-remote-user-id')!);
  });
  app.post('/api/certificates/:id/download', { config: { rateLimit: { max: 5, timeWindow: 60_000 } } }, async (request, reply) => {
    const params = z.strictObject({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.strictObject({ token: z.string().regex(/^[a-f0-9]{64}$/), format: z.enum(['p12', 'zip', 'mobileconfig']).default('p12') }).safeParse(request.body);
    if (!params.success || !body.success) throw new PkiError('EXPORT_UNAVAILABLE', 410);
    const service = requirePki();
    const platform = service.inventory().find((item) => item.id === params.data.id)?.platform ?? 'other';
    const data = service.download(params.data.id, body.data.token, header(request, 'x-remote-user-id')!, body.data.format);
    return reply.type(body.data.format === 'zip' ? 'application/zip' : body.data.format === 'mobileconfig' ? 'application/x-apple-aspen-config' : 'application/x-pkcs12').header('content-disposition', `attachment; filename="${downloadFilename(platform, body.data.format)}"`).send(data);
  });

  await app.register(staticFiles, {
    root: settings.webRoot ?? fileURLToPath(new URL('../web', import.meta.url)),
    index: ['index.html'], dotfiles: 'deny', redirect: false,
    cacheControl: false, etag: false, lastModified: false,
  });
  app.setNotFoundHandler(async (_request, reply) => reply.code(404).send({ code: 'API_NOT_FOUND', error: 'Not found.' }));
  app.addHook('onClose', async () => { sessions.clear(); await reminders?.close(); await settings.pki?.close(); });
  app.addHook('onReady', async () => { reminders?.start(); });
  return app;
}
