import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import staticFiles from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import type { Options } from './config.js';
import { PkiService } from './pki.js';
import { PkiError } from './openssl.js';

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
  now?: () => number;
  webRoot?: string;
  onAccessDenied?: (code: string) => void;
  pki?: PkiService;
} = {}) {
  const now = settings.now ?? Date.now;
  const sessions = new Map<string, Session>();
  const admins = new Set(options.admin_user_ids);
  const pki = options.enable_certificate_management === true ? settings.pki : undefined;
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
    if (!user || !admins.has(user)) {
      return deny(reply, 403, 'USER_NOT_AUTHORIZED', 'An explicitly authorized Home Assistant user is required.');
    }
    const path = header(request, 'x-ingress-path');
    if (!path || !ingressPath.test(path)) {
      return deny(reply, 400, 'INVALID_INGRESS_PATH', 'A valid ingress path is required.');
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

  app.get('/api/status', async () => ({
    stage: pki ? 'certificate-prototype' : 'ingress-prototype',
    signingEnabled: Boolean(pki),
    pangolinConfigured: false,
    liveIngressVerified: false,
  }));

  app.post('/api/authorization-check', { config: { rateLimit: { max: 10, timeWindow: 60_000 } } }, async (request, reply) => {
    if (!z.strictObject({}).safeParse(request.body).success) {
      return reply.code(400).send({ code: 'INVALID_CHECK_BODY', error: 'An empty JSON object is required.' });
    }
    return { authorized: true, signingEnabled: Boolean(pki) };
  });

  app.get('/api/pki', async () => {
    const service = requirePki();
    return { authority: service.authority(), certificates: service.inventory() };
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
    }).safeParse(request.body);
    if (!input.success) throw new PkiError('INVALID_CERTIFICATE_INPUT', 400);
    return requirePki().issue(input.data, header(request, 'x-remote-user-id')!);
  });
  app.post('/api/certificates/:id/download', { config: { rateLimit: { max: 5, timeWindow: 60_000 } } }, async (request, reply) => {
    const params = z.strictObject({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.strictObject({ token: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(request.body);
    if (!params.success || !body.success) throw new PkiError('EXPORT_UNAVAILABLE', 410);
    const data = requirePki().download(params.data.id, body.data.token, header(request, 'x-remote-user-id')!);
    return reply.type('application/x-pkcs12').header('content-disposition', `attachment; filename="ha-device-${params.data.id}.p12"`).send(data);
  });

  await app.register(staticFiles, {
    root: settings.webRoot ?? fileURLToPath(new URL('../web', import.meta.url)),
    index: ['index.html'], dotfiles: 'deny', redirect: false,
    cacheControl: false, etag: false, lastModified: false,
  });
  app.setNotFoundHandler(async (_request, reply) => reply.code(404).send({ code: 'API_NOT_FOUND', error: 'Not found.' }));
  app.setErrorHandler(async (_error, _request, reply) => {
    if (_error instanceof PkiError) return reply.code(_error.statusCode).send({ code: _error.code, error: 'Certificate operation could not be completed.' });
    // Do not echo schema inputs, malformed request bodies or upstream errors.
    const status = _error instanceof Error && 'statusCode' in _error && typeof _error.statusCode === 'number'
      ? _error.statusCode : undefined;
    return reply.code(status && status >= 400 && status < 500 ? status : 500)
      .send({ code: status === 429 ? 'RATE_LIMITED' : 'REQUEST_FAILED', error: status === 429 ? 'Too many requests.' : 'Request could not be processed.' });
  });
  app.addHook('onClose', async () => { sessions.clear(); await settings.pki?.close(); });
  return app;
}
