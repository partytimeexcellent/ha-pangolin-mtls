import { z } from 'zod';

const errors: Record<string, string> = {
  CERTIFICATES_DISABLED: 'Enable certificate management in this app’s Configuration, then restart the app.',
  HTTPS_REQUIRED: 'Use an HTTPS Home Assistant origin before enabling certificate management.',
  CA_REQUIRED: 'Create the certificate authority first.',
  CA_ALREADY_EXISTS: 'A certificate authority already exists. Refresh this page.',
  PKI_BUSY: 'Another certificate operation is running. Wait and try again.',
  EXPORT_CAPACITY: 'Five packages are already awaiting download. Download them or wait for expiry.',
  INVENTORY_CAPACITY: 'This prototype is limited to 100 issued certificates.',
  CA_LIFETIME: 'The CA cannot cover the requested certificate lifetime.',
  EXPORT_UNAVAILABLE: 'This package expired, was already downloaded, or is no longer available. Issue a new identity if needed.',
  INVALID_CERTIFICATE_INPUT: 'Enter a device name, a platform and a lifetime from 1 to 365 days.',
  SESSION_OR_CSRF_INVALID: 'Your session changed or expired. Reopen the app and try again.',
  ORIGIN_MISMATCH: 'The browser origin does not match the configured Home Assistant origin.',
  ORIGIN_MISSING: 'The browser origin did not reach the app.',
  ORIGIN_NULL: 'The browser supplied an opaque origin.',
  USER_NOT_AUTHORIZED: 'This Home Assistant user is not allowed to manage certificates.',
  RATE_LIMITED: 'Too many requests. Wait one minute and try again.',
  CRYPTO_FAILED: 'OpenSSL could not complete the operation. No package is available.',
};

export async function checked(response: Response) {
  if (response.ok) return response;
  const data = await response.json().catch(() => null);
  const code = typeof data?.code === 'string' && Object.hasOwn(errors, data.code) ? data.code as string : 'REQUEST_FAILED';
  throw new Error(`${errors[code] ?? 'The certificate request failed.'} (${code}, HTTP ${response.status})`);
}

export async function protectedPost(path: string, body: unknown): Promise<Response> {
  const sessionResponse = await checked(await fetch('./api/session', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(10_000) }));
  const session = z.object({ sessionId: z.string().regex(/^[a-f0-9]{64}$/), csrfToken: z.string().regex(/^[a-f0-9]{64}$/) }).parse(await sessionResponse.json());
  return checked(await fetch(path, {
    method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(90_000),
    headers: { 'content-type': 'application/json', 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken },
    body: JSON.stringify(body),
  }));
}
