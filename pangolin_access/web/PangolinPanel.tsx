import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { protectedPost } from './pki-api';
import { ResourceInspection, resourceInspectionSchema, type ResourceResult } from './ResourceInspection';

const resultSchema = z.object({
  checkedAt: z.string(), organization: z.object({ name: z.string() }), mtlsRoutesAdvertised: z.boolean(),
  sites: z.object({ sites: z.array(z.object({ siteId: z.number(), name: z.string(), online: z.boolean().optional() })), pagination: z.object({ total: z.number() }) }),
  domains: z.object({ domains: z.array(z.object({ domainId: z.string(), baseDomain: z.string(), verified: z.boolean() })), pagination: z.object({ total: z.number() }) }),
  resources: z.object({ resources: z.array(z.object({ resourceId: z.number(), name: z.string(), fullDomain: z.string().nullable(), ssl: z.boolean(), mtls: z.boolean(), enabled: z.boolean() })), pagination: z.object({ total: z.number() }) }),
});

export function PangolinPanel() {
  const [orgId, setOrgId] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [hostname, setHostname] = useState('');
  const [resourceResult, setResourceResult] = useState<ResourceResult | null>(null);
  const [message, setMessage] = useState('Ready for a read-only connection check.');
  const [result, setResult] = useState<z.infer<typeof resultSchema> | null>(null);
  async function check(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setResult(null); setResourceResult(null); setMessage('Checking Pangolin…');
    const suppliedKey = key;
    setKey('');
    try {
      const response = await protectedPost(inspect ? './api/pangolin/resource-check' : './api/pangolin/check', {
        orgId, apiKey: suppliedKey, ...(inspect ? { resourceIdentifier: identifier, hostname } : {}),
      });
      if (inspect) {
        setResourceResult(resourceInspectionSchema.parse(await response.json()));
        setMessage('Read-only resource inspection completed. Review the findings below. No Pangolin configuration was changed.');
      } else {
        setResult(resultSchema.parse(await response.json()));
        setMessage('Read-only check passed. No Pangolin configuration was changed.');
      }
    } catch (error) {
      setMessage(error instanceof Error && /\([A-Z_]+, HTTP \d+\)$/.test(error.message)
        ? error.message : 'The check did not complete. Check your access and network, then try again.');
    } finally { setBusy(false); }
  }
  return <section aria-labelledby="pangolin-title">
    <h2 id="pangolin-title">Connect to Pangolin</h2>
    <p>Set <code>pangolin_api_url</code> in the app Configuration to your public HTTPS integration API URL ending in <code>/v1</code>, then restart.</p>
    <p>Use an organization-scoped key with getOrg, listSites, listOrgDomains and listResources permissions. The key is used for this check only and is not saved. Don’t paste it into chat.</p>
    <form onSubmit={check}>
      <label className="check"><input type="checkbox" checked={inspect} onChange={event => { setInspect(event.target.checked); setResult(null); setResourceResult(null); }} disabled={busy} />Inspect a specific test resource</label>
      {inspect && <>
        <p>Also enable Get Resource, Get Resource Policy and List Targets on the organization API key. This inspection only reads configuration.</p>
        <label>Resource identifier<input value={identifier} onChange={event => setIdentifier(event.target.value)} required maxLength={100} pattern="[A-Za-z0-9_-]+" autoComplete="off" disabled={busy} /></label>
        <label>Expected hostname<input value={hostname} onChange={event => setHostname(event.target.value)} required maxLength={253} placeholder="ha-test.example.net" autoComplete="off" disabled={busy} /></label>
      </>}
      <label>Organization ID<input value={orgId} onChange={event => setOrgId(event.target.value)} required maxLength={100} pattern="[A-Za-z0-9_-]+" autoComplete="off" disabled={busy} /></label>
      <label>API key<input type="password" value={key} onChange={event => setKey(event.target.value)} required maxLength={1024} autoComplete="off" spellCheck={false} disabled={busy} /></label>
      <button disabled={busy}>{busy ? 'Checking…' : inspect ? 'Inspect resource' : 'Check Pangolin connection'}</button>
    </form>
    <p role="status" aria-live="polite">{message}</p>
    {resourceResult && <ResourceInspection result={resourceResult} />}
    {result && <div>
      <h3>{result.organization.name}</h3>
      <p>Checked {new Date(result.checkedAt).toLocaleString()}. Showing the first 20 entries in each list.</p>
      <p>mTLS management routes advertised: {result.mtlsRoutesAdvertised ? 'Yes' : 'Incomplete'}. This does not verify write permissions, site reachability, shared policies or TLS enforcement.</p>
      <h3>Sites ({result.sites.pagination.total} total)</h3>
      <ul>{result.sites.sites.map(site => <li key={site.siteId}>{site.name} — {site.online === undefined ? 'connection status unavailable' : site.online ? 'online' : 'offline'}</li>)}</ul>
      <h3>Domains ({result.domains.pagination.total} total)</h3>
      <ul>{result.domains.domains.map(domain => <li key={domain.domainId}>{domain.baseDomain} — {domain.verified ? 'verified' : 'unverified'}</li>)}</ul>
      <h3>Resources ({result.resources.pagination.total} total)</h3>
      <ul>{result.resources.resources.map(resource => <li key={resource.resourceId}>{resource.name} · {resource.fullDomain ?? 'no hostname'} · {resource.enabled ? 'enabled' : 'disabled'} · HTTPS {resource.ssl ? 'on' : 'off'} · mTLS {resource.mtls ? 'reported on' : 'reported off'}</li>)}</ul>
      <p className="footnote">These are API observations at the check time. They do not prove a device can connect or that an untrusted client is blocked.</p>
    </div>}
  </section>;
}
