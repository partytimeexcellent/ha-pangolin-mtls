import { z } from 'zod';

const issues = {
  RESOURCE_ENABLED: 'The resource is enabled. Leave the test resource disabled during preparation.',
  RESOURCE_MODE: 'The resource is not in HTTP mode.',
  HTTPS_OFF: 'Public HTTPS is off.',
  SHARED_POLICY: 'A shared policy is assigned. Review its shared settings in Pangolin before making changes.',
  TARGETS_PRESENT: 'Targets are already attached. Review them before proceeding.',
  TARGETS_INCOMPLETE: 'The target list is incomplete; only the first 20 are shown.',
  HOSTNAME_SEARCH_INCOMPLETE: 'The hostname search is incomplete.',
  HOSTNAME_CONFLICT: 'Other public resources report this exact hostname.',
  EXISTING_TRUST: 'The inspected policy already has CA trust entries. Preserve and review them.',
  MTLS_ALREADY_ON: 'mTLS is already reported enabled. Review the existing setup.',
  OTHER_AUTH_OR_RULES: 'Other authentication/rules are enabled or their settings need review.',
};
export const resourceInspectionSchema = z.object({
  checkedAt: z.string(), scope: z.literal('read-only-resource-inspection'),
  resource: z.object({ resourceId: z.number(), niceId: z.string(), name: z.string(), fullDomain: z.string().nullable(), enabled: z.boolean(), ssl: z.boolean() }),
  policy: z.object({ source: z.enum(['inline', 'shared']), name: z.string(), mtlsEnabled: z.boolean(), sso: z.boolean().nullable(),
    rules: z.boolean().nullable(), emailWhitelist: z.boolean().nullable(), password: z.boolean(), pincode: z.boolean(), headerAuth: z.boolean() }),
  targets: z.object({ targets: z.array(z.object({ targetId: z.number(), ip: z.string(), port: z.number().nullable(), enabled: z.boolean(), siteId: z.number().nullable() })), pagination: z.object({ total: z.number() }) }),
  trust: z.object({ source: z.enum(['inline-policy', 'shared-policy-only']), certificates: z.array(z.object({ mtlsCertificateId: z.number(), name: z.string().nullable(), fingerprint: z.string().nullable(), notAfter: z.number().nullable() })) }),
  issues: z.array(z.enum(Object.keys(issues) as [keyof typeof issues, ...Array<keyof typeof issues>])),
});
export type ResourceResult = z.infer<typeof resourceInspectionSchema>;
export function ResourceInspection({ result }: { result: ResourceResult }) {
  return <div>
    <h3>{result.resource.name}</h3>
    <p className="fingerprint">{result.resource.niceId} · {result.resource.fullDomain}</p>
    <p>Inspected {new Date(result.checkedAt).toLocaleString()}. Resource {result.resource.enabled ? 'enabled' : 'disabled'}; HTTPS {result.resource.ssl ? 'on' : 'off'}.</p>
    <h3>Review findings</h3>
    {result.issues.length > 0 ? <ul>{result.issues.map(issue => <li key={issue}>{issues[issue]}</li>)}</ul>
      : <p>The inspected settings match a disabled, dedicated HTTPS resource with no targets, shared policy, existing policy CA trust or other reported authentication/rules. Review is still required before any changes.</p>}
    <h3>Policy: {result.policy.source === 'shared' ? 'Shared' : 'Resource-specific'} · {result.policy.name}</h3>
    <p>mTLS {result.policy.mtlsEnabled ? 'on' : 'off'}; SSO {result.policy.sso === null ? 'unknown' : result.policy.sso ? 'on' : 'off'}; rules {result.policy.rules === null ? 'unknown' : result.policy.rules ? 'on' : 'off'}; email whitelist {result.policy.emailWhitelist === null ? 'unknown' : result.policy.emailWhitelist ? 'on' : 'off'}; password {result.policy.password ? 'present' : 'absent'}; PIN {result.policy.pincode ? 'present' : 'absent'}; header authentication {result.policy.headerAuth ? 'present' : 'absent'}.</p>
    <h3>Targets ({result.targets.pagination.total} total)</h3>
    <ul>{result.targets.targets.map(target => <li key={target.targetId} className="fingerprint">Site {target.siteId ?? 'unknown'} · {target.ip}:{target.port ?? 'unknown'} · {target.enabled ? 'enabled' : 'disabled'}</li>)}</ul>
    <h3>Policy CA trust ({result.trust.certificates.length})</h3>
    <ul>{result.trust.certificates.map(certificate => <li key={certificate.mtlsCertificateId} className="fingerprint">{certificate.name ?? 'Unnamed CA'} · {certificate.fingerprint ?? 'fingerprint unavailable'}</li>)}</ul>
    <p className="footnote">{result.trust.source === 'shared-policy-only' ? 'Shared-policy trust is shown. Legacy resource trust may also matter; this resource requires manual review. ' : ''}These reads are not an atomic snapshot. Hostname searches cover Pangolin public resources, not redirects, wildcard overlaps or manual Traefik routers. Site reachability and TLS enforcement have not been tested. No Pangolin configuration was changed.</p>
  </div>;
}
