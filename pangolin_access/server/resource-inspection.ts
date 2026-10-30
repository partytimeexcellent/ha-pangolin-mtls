import { z } from 'zod';
import { PangolinError, type PangolinStage, type ReadJson } from './pangolin.js';

const text = z.string().max(300);
const id = z.number().int().positive();
const total = z.number().int().nonnegative();
export const resourceSelectionSchema = z.object({
  resourceIdentifier: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
  hostname: z.string().min(1).max(253).regex(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/).transform(value => value.toLowerCase()),
});
function envelope<T extends z.ZodType>(data: T) { return z.object({ success: z.literal(true), error: z.literal(false), data }); }
const summary = z.object({ resourceId: id, niceId: text, fullDomain: text.nullable() });
const listing = envelope(z.object({ resources: z.array(summary).max(20), pagination: z.object({ total }) }));
const resource = envelope(z.object({ resourceId: id, orgId: text, niceId: text, name: text,
  fullDomain: text.nullable(), mode: text, ssl: z.boolean(), enabled: z.boolean(), blockAccess: z.boolean(),
  mtlsEnabled: z.boolean(), resourcePolicyId: id.nullable(), defaultResourcePolicyId: id.nullable() }));
const policy = z.object({ resourcePolicyId: id, name: text, mtlsEnabled: z.boolean(), sso: z.boolean().nullable(),
  applyRules: z.boolean().nullable(), emailWhitelistEnabled: z.boolean().nullable(),
  passwordId: id.nullable(), pincodeId: id.nullable(), headerAuth: z.object({ id: id.nullable() }).nullable() });
const policies = envelope(z.object({ defaultPolicy: policy, sharedPolicy: policy.nullable() }));
const targets = envelope(z.object({ targets: z.array(z.object({ targetId: id, resourceId: id, siteId: id.nullable(),
  ip: text, port: z.number().int().min(1).max(65535).nullable(), enabled: z.boolean() })).max(20), pagination: z.object({ total }) }));
const certificates = envelope(z.object({ certificates: z.array(z.object({ mtlsCertificateId: id,
  name: text.nullable(), fingerprint: text.nullable(), notAfter: z.number().finite().nullable() })).max(20) }));
const requiredPaths = ['/org/{orgId}', '/org/{orgId}/public-resources', '/public-resource/{resourceId}',
  '/public-resource/{resourceId}/policies', '/public-resource/{resourceId}/targets',
  '/public-resource-policy/{resourcePolicyId}/mtls/certificates'];

export async function inspectResource(read: ReadJson, orgId: string, selection: z.infer<typeof resourceSelectionSchema>) {
  let stage: PangolinStage = 'specification';
  try {
    const spec = z.object({ openapi: z.string().regex(/^3\./), paths: z.record(z.string(), z.record(z.string(), z.unknown())) }).parse(await read('/openapi.json', false));
    if (requiredPaths.some(path => !spec.paths[path]?.get)) throw new PangolinError('PANGOLIN_CONTRACT');
    const prefix = `/org/${encodeURIComponent(orgId)}`;
    stage = 'organization';
    const org = envelope(z.object({ org: z.object({ orgId: text }) })).parse(await read(prefix, true)).data.org;
    if (org.orgId !== orgId) throw new PangolinError('PANGOLIN_CONTRACT');
    stage = 'resources';
    const candidates = listing.parse(await read(`${prefix}/public-resources?pageSize=20&page=1&query=${encodeURIComponent(selection.resourceIdentifier)}`, true)).data;
    // A substring search is only discovery. Require a complete bounded result and one exact identifier.
    if (candidates.pagination.total !== candidates.resources.length) throw new PangolinError('PANGOLIN_SEARCH_INCOMPLETE', 409);
    const matches = candidates.resources.filter(item => item.niceId === selection.resourceIdentifier);
    if (matches.length !== 1) throw new PangolinError('PANGOLIN_SELECTION_NOT_FOUND', 409);
    const resourceId = matches[0]!.resourceId;
    const path = `/public-resource/${resourceId}`;
    stage = 'resource';
    const selected = resource.parse(await read(path, true)).data;
    if (selected.resourceId !== resourceId || selected.orgId !== orgId || selected.niceId !== selection.resourceIdentifier ||
      selected.fullDomain?.toLowerCase() !== selection.hostname) throw new PangolinError('PANGOLIN_SELECTION_MISMATCH', 409);
    stage = 'policies';
    const policyData = policies.parse(await read(`${path}/policies`, true)).data;
    if (policyData.defaultPolicy.resourcePolicyId !== selected.defaultResourcePolicyId ||
      (policyData.sharedPolicy?.resourcePolicyId ?? null) !== selected.resourcePolicyId) throw new PangolinError('PANGOLIN_SNAPSHOT_CHANGED', 409);
    stage = 'targets';
    const targetData = targets.parse(await read(`${path}/targets?limit=20&offset=0`, true)).data;
    if (targetData.targets.some(target => target.resourceId !== resourceId) || targetData.pagination.total < targetData.targets.length) throw new PangolinError('PANGOLIN_CONTRACT');
    stage = 'trust';
    // Read the inline/shared policy explicitly. The resource CA route is not equivalent for shared policies.
    const activePolicy = policyData.sharedPolicy ?? policyData.defaultPolicy;
    const trust = certificates.parse(await read(`/public-resource-policy/${activePolicy.resourcePolicyId}/mtls/certificates`, true)).data.certificates;
    stage = 'hostname';
    const hostMatches = listing.parse(await read(`${prefix}/public-resources?pageSize=20&page=1&query=${encodeURIComponent(selection.hostname)}`, true)).data;
    const hostnameSearchComplete = hostMatches.pagination.total === hostMatches.resources.length;
    const sameHostname = hostMatches.resources.filter(item => item.fullDomain?.toLowerCase() === selection.hostname);
    if (!sameHostname.some(item => item.resourceId === resourceId)) throw new PangolinError('PANGOLIN_SNAPSHOT_CHANGED', 409);
    stage = 'recheck';
    const refreshed = resource.parse(await read(path, true)).data;
    if (JSON.stringify(refreshed) !== JSON.stringify(selected)) throw new PangolinError('PANGOLIN_SNAPSHOT_CHANGED', 409);
    const issues: string[] = [];
    if (selected.enabled) issues.push('RESOURCE_ENABLED');
    if (selected.mode !== 'http') issues.push('RESOURCE_MODE');
    if (!selected.ssl) issues.push('HTTPS_OFF');
    if (selected.resourcePolicyId !== null) issues.push('SHARED_POLICY');
    if (targetData.pagination.total > 0) issues.push('TARGETS_PRESENT');
    if (targetData.pagination.total !== targetData.targets.length) issues.push('TARGETS_INCOMPLETE');
    if (!hostnameSearchComplete) issues.push('HOSTNAME_SEARCH_INCOMPLETE');
    if (sameHostname.length !== 1) issues.push('HOSTNAME_CONFLICT');
    if (trust.length > 0) issues.push('EXISTING_TRUST');
    if (selected.mtlsEnabled || activePolicy.mtlsEnabled) issues.push('MTLS_ALREADY_ON');
    if (activePolicy.sso !== false || activePolicy.applyRules !== false || activePolicy.emailWhitelistEnabled !== false ||
      activePolicy.passwordId !== null || activePolicy.pincodeId !== null || activePolicy.headerAuth?.id != null) issues.push('OTHER_AUTH_OR_RULES');
    return { checkedAt: new Date().toISOString(), resource: selected,
      policy: { source: policyData.sharedPolicy ? 'shared' as const : 'inline' as const,
        resourcePolicyId: activePolicy.resourcePolicyId, name: activePolicy.name,
        mtlsEnabled: activePolicy.mtlsEnabled, sso: activePolicy.sso, rules: activePolicy.applyRules,
        emailWhitelist: activePolicy.emailWhitelistEnabled, password: activePolicy.passwordId !== null,
        pincode: activePolicy.pincodeId !== null, headerAuth: activePolicy.headerAuth?.id != null },
      targets: targetData, trust: { source: policyData.sharedPolicy ? 'shared-policy-only' as const : 'inline-policy' as const, certificates: trust },
      sameHostnameResourceCount: sameHostname.length, hostnameSearchComplete, issues,
      scope: 'read-only-resource-inspection' as const };
  } catch (error) {
    if (error instanceof PangolinError) throw new PangolinError(error.code, error.statusCode, stage);
    throw new PangolinError('PANGOLIN_CONTRACT', 502, stage);
  }
}
