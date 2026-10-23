import type { ReadJson } from '../../server/pangolin.js';
const wrap = (data: unknown) => ({ success: true, error: false, data });
const paths = ['/org/{orgId}', '/org/{orgId}/public-resources', '/public-resource/{resourceId}', '/public-resource/{resourceId}/policies', '/public-resource/{resourceId}/targets', '/public-resource-policy/{resourcePolicyId}/mtls/certificates'];
export function resourceFixture() {
  const selected = { resourceId: 7, orgId: 'fixture', niceId: 'test-resource', name: 'Test resource', fullDomain: 'ha-test.example.test',
    enabled: false, mode: 'http', ssl: true, blockAccess: false, mtlsEnabled: false, resourcePolicyId: null as number | null, defaultResourcePolicyId: 9,
    requestHeaders: [{ name: 'authorization', value: 'never-return' }] };
  const inline = { resourcePolicyId: 9, name: 'Inline', mtlsEnabled: false, sso: false, applyRules: false, emailWhitelistEnabled: false,
    passwordId: null as number | null, pincodeId: null, headerAuth: null, users: [{ email: 'never-return' }], rules: [{ value: 'never-return' }] };
  const policies = { defaultPolicy: inline, sharedPolicy: null as typeof inline | null };
  const targetData = { targets: [] as Array<{ targetId: number; resourceId: number; siteId: number; ip: string; port: number; enabled: boolean; hcHeaders?: string }>, pagination: { total: 0 } };
  const trust = { certificates: [] as Array<{ mtlsCertificateId: number; name: string; fingerprint: string; notAfter: number; certificate?: string }> };
  const candidates = { resources: [selected], pagination: { total: 1 } };
  const hostname = { resources: [selected], pagination: { total: 1 } };
  const calls: Array<[string, boolean]> = [];
  const read: ReadJson = async (path, auth) => {
    calls.push([path, auth]);
    if (path === '/openapi.json') return { openapi: '3.0.0', paths: Object.fromEntries(paths.map(path => [path, { get: {} }])) };
    if (path === '/org/fixture') return wrap({ org: { orgId: 'fixture' } });
    if (path === '/org/fixture/public-resources?pageSize=20&page=1&query=test-resource') return wrap(candidates);
    if (path === '/org/fixture/public-resources?pageSize=20&page=1&query=ha-test.example.test') return wrap(hostname);
    if (path === '/public-resource/7') return wrap(selected);
    if (path === '/public-resource/7/policies') return wrap(policies);
    if (path === '/public-resource/7/targets?limit=20&offset=0') return wrap(targetData);
    if (path === '/public-resource-policy/9/mtls/certificates' || path === '/public-resource-policy/10/mtls/certificates') return wrap(trust);
    throw new Error('unexpected fixture path');
  };
  return { selected, inline, policies, targetData, trust, candidates, hostname, read, calls };
}
