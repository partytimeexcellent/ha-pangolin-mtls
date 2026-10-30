import { X509Certificate } from 'node:crypto';
import { z } from 'zod';
import { apiUrlSchema, PangolinError, type ReadJson, type WriteJson } from './pangolin.js';
import { inspectResource, resourceSelectionSchema } from './resource-inspection.js';

export const caInstallSchema = z.strictObject({
  orgId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
  apiKey: z.string().min(1).max(1024).regex(/^[\x21-\x7e]+$/),
  apiUrl: apiUrlSchema.optional(),
  ...resourceSelectionSchema.shape,
  confirm: z.literal(true),
});

export async function installCa(read: ReadJson, write: WriteJson, orgId: string,
  selection: z.infer<typeof resourceSelectionSchema>, pem: string) {
  const ca = new X509Certificate(pem);
  if (!ca.ca || Date.parse(ca.validTo) <= Date.now()) throw new PangolinError('CA_INVALID', 409, 'trust');
  const fingerprint = ca.fingerprint256;
  const spec = z.object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) }).parse(await read('/openapi.json', false));
  if (!spec.paths['/public-resource/{resourceId}/mtls/certificate']?.put) throw new PangolinError('PANGOLIN_CONTRACT', 502, 'specification');
  const current = await inspectResource(read, orgId, selection);
  if (current.policy.source !== 'inline' || current.issues.some(issue =>
    ['RESOURCE_MODE', 'HTTPS_OFF', 'SHARED_POLICY', 'HOSTNAME_SEARCH_INCOMPLETE', 'HOSTNAME_CONFLICT'].includes(issue))) {
    throw new PangolinError('PANGOLIN_RESOURCE_INELIGIBLE', 409, 'resource');
  }
  if (current.trust.certificates.some(cert => cert.fingerprint === fingerprint)) {
    return { status: 'already-installed' as const, fingerprint, resourceId: current.resource.resourceId,
      hostname: current.resource.fullDomain };
  }
  if (current.trust.certificates.length >= 20) throw new PangolinError('PANGOLIN_TRUST_FULL', 409, 'trust');
  const path = `/public-resource/${current.resource.resourceId}/mtls/certificate`;
  try { await write(path, { certificate: pem, name: 'HA Pangolin Access CA' }); }
  catch (error) {
    if (error instanceof PangolinError && ['PANGOLIN_AUTH_FAILED', 'PANGOLIN_PERMISSION_DENIED', 'PANGOLIN_NOT_FOUND', 'PANGOLIN_REDIRECT'].includes(error.code))
      throw new PangolinError(error.code, error.statusCode, 'trust');
    throw new PangolinError('PANGOLIN_WRITE_UNCERTAIN', 502, 'trust');
  }
  let after: Awaited<ReturnType<typeof inspectResource>>;
  try { after = await inspectResource(read, orgId, selection); }
  catch { throw new PangolinError('PANGOLIN_WRITE_UNCERTAIN', 502, 'trust'); }
  if (after.policy.source !== 'inline' || after.resource.resourceId !== current.resource.resourceId ||
    !after.trust.certificates.some(cert => cert.fingerprint === fingerprint)) {
    throw new PangolinError('PANGOLIN_WRITE_UNCERTAIN', 502, 'trust');
  }
  return { status: 'installed' as const, fingerprint, resourceId: current.resource.resourceId,
    hostname: current.resource.fullDomain };
}
