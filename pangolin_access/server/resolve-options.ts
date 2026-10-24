import { optionsSchema, startupOptionsSchema } from './config.js';

const limit = 256 * 1024;
export class ExternalUrlError extends Error {
  constructor() { super('HOME_ASSISTANT_EXTERNAL_URL_UNAVAILABLE'); }
}

// The configured external URL is used only as an origin allowlist; never fetch it.
// Never discover an allowed origin from browser headers, a Host header or a referrer.
export async function resolveOptions(input: unknown, token?: string, request: typeof fetch = fetch) {
  const raw = startupOptionsSchema.parse(input);
  if (raw.home_assistant_origin) return { options: optionsSchema.parse(raw), source: 'configuration' as const };
  if (!token) throw new ExternalUrlError();
  try {
    const response = await request('http://supervisor/core/api/config', {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5_000),
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    try {
      if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json') ||
        Number(response.headers.get('content-length')) > limit || !response.body) throw new ExternalUrlError();
      const reader = response.body.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > limit) throw new ExternalUrlError();
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      const config: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!config || typeof config !== 'object' || !('external_url' in config) || typeof config.external_url !== 'string' || config.external_url.length > 2048) throw new ExternalUrlError();
      const resolved = optionsSchema.safeParse({ ...raw, home_assistant_origin: config.external_url });
      if (!resolved.success) throw new ExternalUrlError();
      return { options: resolved.data, source: 'home-assistant' as const };
    } finally { await response.body?.cancel(); }
  } catch { throw new ExternalUrlError(); }
}
