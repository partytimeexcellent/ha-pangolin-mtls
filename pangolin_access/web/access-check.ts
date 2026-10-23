import { z } from 'zod';

const sessionSchema = z.object({ sessionId: z.string().regex(/^[a-f0-9]{64}$/), csrfToken: z.string().regex(/^[a-f0-9]{64}$/) });
const resultSchema = z.object({ authorized: z.literal(true), signingEnabled: z.literal(false) });
const messages: Record<string, string> = {
  INGRESS_PEER_REQUIRED: 'The request did not arrive through the trusted Supervisor connection.',
  USER_NOT_AUTHORIZED: 'Home Assistant did not supply an allowlisted user ID. Check the app configuration and reopen its Web UI.',
  INVALID_INGRESS_PATH: 'The ingress path was missing or invalid. Reopen the app through Home Assistant.',
  ORIGIN_MISMATCH: 'The request origin did not match home_assistant_origin. Verify the configured scheme, hostname and port.',
  ORIGIN_MISSING: 'The browser origin header did not reach the app. Check the ingress and reverse-proxy path.',
  ORIGIN_NULL: 'The browser sent an opaque origin. Check browser embedding and referrer-policy behavior.',
  JSON_REQUIRED: 'The request content type was changed or was not JSON.',
  SESSION_OR_CSRF_INVALID: 'The session or CSRF token was missing, expired or changed. Reopen the app and try again.',
  SESSION_CAPACITY: 'The app has reached its temporary session limit. Wait five minutes and try again.',
  RATE_LIMITED: 'Too many checks were requested. Wait one minute and try again.',
  INVALID_CHECK_BODY: 'The access-check request was not the expected empty JSON object.',
  API_NOT_FOUND: 'The app API path was not found. Reopen the app through Home Assistant.',
  REQUEST_FAILED: 'The app could not process the request.',
};

class CheckError extends Error {}

async function readResponse(response: Response, stage: string): Promise<unknown> {
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new CheckError(`${stage}: expected app JSON, received HTTP ${response.status}. Reopen the app through Home Assistant.`); }
  if (!response.ok) {
    const parsed = z.object({ code: z.string() }).safeParse(data);
    const code = parsed.success && Object.hasOwn(messages, parsed.data.code) ? parsed.data.code : 'REQUEST_FAILED';
    throw new CheckError(`${stage}: ${messages[code]} (${code}, HTTP ${response.status})`);
  }
  return data;
}

export async function checkAccess(fetcher: typeof fetch = fetch): Promise<string> {
  let stage = 'Session request';
  try {
    const response = await fetcher('./api/session', {
      cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    const session = sessionSchema.safeParse(await readResponse(response, stage));
    if (!session.success) throw new CheckError('Session request: the app returned an unexpected response. Check that the current app version is installed.');
    stage = 'Authorization request';
    const authorization = await fetcher('./api/authorization-check', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json', 'x-access-session': session.data.sessionId, 'x-csrf-token': session.data.csrfToken },
      body: '{}',
    });
    if (!resultSchema.safeParse(await readResponse(authorization, stage)).success) {
      throw new CheckError('Authorization request: the app returned an unexpected response.');
    }
    return 'Authorization check passed. Certificate signing remains disabled.';
  } catch (error) {
    return error instanceof CheckError ? `Check failed. ${error.message}`
      : `Check failed. ${stage}: the browser could not complete the request. Check connectivity or reopen the Web UI. (NETWORK_ERROR)`;
  }
}
