import { z } from 'zod';

const errors: Record<string, string> = {
  PANGOLIN_SEARCH_INCOMPLETE: 'The resource search exceeded the bounded result limit. No resource was selected.',
  PANGOLIN_SELECTION_NOT_FOUND: 'No unique exact resource identifier was found in this organization.',
  PANGOLIN_SELECTION_MISMATCH: 'The resource organization, identifier or hostname did not match your selection.',
  PANGOLIN_SNAPSHOT_CHANGED: 'The resource changed or inconsistent results were returned during inspection. Check Pangolin and try again.',
  PANGOLIN_URL_REQUIRED: 'Set pangolin_api_url in the app Configuration to your HTTPS integration API URL ending in /v1, then restart.',
  PANGOLIN_INPUT: 'Enter the organization ID and API key.',
  PANGOLIN_BUSY: 'Another Pangolin check is running. Wait and try again.',
  PANGOLIN_ADDRESS_BLOCKED: 'The API hostname must resolve only to public addresses. Private and reserved destinations are blocked.',
  PANGOLIN_AUTH_FAILED: 'Pangolin rejected the API key.',
  PANGOLIN_PERMISSION_DENIED: 'The API key lacks access to a required read operation or this organization.',
  PANGOLIN_NOT_FOUND: 'An API route or organization was not found. Check the integration API URL and organization ID.',
  PANGOLIN_REDIRECT: 'The API redirected the request. Configure its final HTTPS URL; redirects are refused.',
  PANGOLIN_UPSTREAM: 'Pangolin returned an unsuccessful response.',
  PANGOLIN_CONTRACT: 'The API response does not match the inspected Pangolin contract. Check that this is the integration API.',
  PANGOLIN_RESPONSE_LIMIT: 'The API response exceeded the check’s size limit.',
  PANGOLIN_NETWORK: 'The API could not be reached securely within the deadline. Check DNS, HTTPS certificate and network access.',
  CERTIFICATES_DISABLED: 'Enable certificate management in this app’s Configuration, then restart the app.',
  HTTPS_REQUIRED: 'Use an HTTPS Home Assistant origin for this operation.',
  REPLACEMENT_INVALID: 'Choose an existing certificate to replace, or download the replacement before confirming its device test.',
  CONFIRMATION_REQUIRED: 'Explicit confirmation is required.',
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
const pangolinStages: Record<string, string> = {
  specification: 'API specification', organization: 'Organization (Get Organization)', sites: 'Sites (List Sites)',
  domains: 'Domains (List Organization Domains)', resources: 'Resource search (List Resources)',
  resource: 'Resource details (Get Resource)', policies: 'Policies (Get Resource Policy)', targets: 'Targets (List Targets)',
  trust: 'Policy certificate trust (Get Resource Policy)', hostname: 'Hostname search (List Resources)', recheck: 'Resource recheck (Get Resource)',
};

export async function checked(response: Response) {
  if (response.ok) return response;
  const data = await response.json().catch(() => null);
  const code = typeof data?.code === 'string' && Object.hasOwn(errors, data.code) ? data.code as string : 'REQUEST_FAILED';
  const stage = code.startsWith('PANGOLIN_') && typeof data?.stage === 'string' && Object.hasOwn(pangolinStages, data.stage)
    ? `${pangolinStages[data.stage]}: ` : '';
  throw new Error(`${stage}${errors[code] ?? 'The request failed.'} (${code}, HTTP ${response.status})`);
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
