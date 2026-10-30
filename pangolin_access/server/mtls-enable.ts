import { X509Certificate } from 'node:crypto';
import { z } from 'zod';
import { PangolinError, type ReadJson, type WriteJson } from './pangolin.js';
import { inspectResource, resourceSelectionSchema } from './resource-inspection.js';

export async function enableMtls(read: ReadJson, write: WriteJson, orgId: string,
  selection: z.infer<typeof resourceSelectionSchema>, pem: string) {
  const fingerprint = new X509Certificate(pem).fingerprint256;
  const current = await inspectResource(read, orgId, selection);
  if (current.policy.source !== 'inline' || current.issues.some(issue =>
    ['RESOURCE_MODE', 'HTTPS_OFF', 'SHARED_POLICY', 'HOSTNAME_SEARCH_INCOMPLETE', 'HOSTNAME_CONFLICT'].includes(issue))) {
    throw new PangolinError('PANGOLIN_RESOURCE_INELIGIBLE', 409, 'resource');
  }
  if (!current.trust.certificates.some(cert => cert.fingerprint === fingerprint))
    throw new PangolinError('PANGOLIN_CA_NOT_TRUSTED', 409, 'trust');
  if (current.policy.mtlsEnabled) return { status: 'already-enabled' as const, resourceId: current.resource.resourceId };
  if (current.resource.enabled) throw new PangolinError('PANGOLIN_MTLS_ACTIVE_RESOURCE', 409, 'resource');

  const spec = z.object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) }).safeParse(await read('/openapi.json', false));
  if (!spec.success || !spec.data.paths['/public-resource-policy/{resourcePolicyId}']?.post)
    throw new PangolinError('PANGOLIN_CONTRACT', 502, 'specification');

  try { await write(`/public-resource-policy/${current.policy.resourcePolicyId}`, { mtlsEnabled: true }, 'POST'); }
  catch (error) {
    if (error instanceof PangolinError && ['PANGOLIN_AUTH_FAILED', 'PANGOLIN_PERMISSION_DENIED', 'PANGOLIN_NOT_FOUND', 'PANGOLIN_REDIRECT'].includes(error.code))
      throw new PangolinError(error.code, error.statusCode, 'mtls');
    throw new PangolinError('PANGOLIN_MTLS_ENABLE_UNCERTAIN', 502, 'mtls');
  }
  let after: Awaited<ReturnType<typeof inspectResource>>;
  try { after = await inspectResource(read, orgId, selection); }
  catch { throw new PangolinError('PANGOLIN_MTLS_ENABLE_UNCERTAIN', 502, 'mtls'); }
  if (after.resource.resourceId !== current.resource.resourceId || after.policy.source !== 'inline' ||
    after.policy.resourcePolicyId !== current.policy.resourcePolicyId || !after.policy.mtlsEnabled ||
    !after.trust.certificates.some(cert => cert.fingerprint === fingerprint))
    throw new PangolinError('PANGOLIN_MTLS_ENABLE_UNCERTAIN', 502, 'mtls');
  return { status: 'enabled' as const, resourceId: current.resource.resourceId };
}
