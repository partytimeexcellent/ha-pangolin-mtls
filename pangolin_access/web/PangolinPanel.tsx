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
  const [message, setMessage] = useState('Optional checks for setup and troubleshooting.');
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
        setMessage('Resource checked. Review the findings below. No settings were changed.');
      } else {
        setResult(resultSchema.parse(await response.json()));
        setMessage('Connection successful. No Pangolin settings were changed.');
      }
    } catch (error) {
      setMessage(error instanceof Error && /\([A-Z_]+, HTTP \d+\)$/.test(error.message)
        ? error.message : 'The check did not complete. Check your access and network, then try again.');
    } finally { setBusy(false); }
  }
  return <section aria-labelledby="pangolin-title">
    <div className="section-heading"><h2 id="pangolin-title">Check your Pangolin connection</h2><span className="badge">Read only</span></div>
    <p>Check API access or review a resource’s settings. These checks do not change Pangolin or test whether a device can connect.</p>
    <p>For these checks, set <strong>Pangolin API URL (optional)</strong> in Configuration, save and restart. Daily use does not need an API key.</p>
    <details className="subdetails"><summary>API permissions and testing guidance</summary>
      <p>Use an organization-scoped key with Get Organization, List Sites, List Organization Domains and List Resources. Resource inspection also needs Get Resource, Get Resource Policy and List Targets.</p>
      <p>The key is used only for this request and is not saved. Revoke it in Pangolin when you no longer need these checks.</p>
      <p>Configure CA trust and mTLS in Pangolin separately. Then test the protected address: a connection without a client certificate must be rejected, and your enrolled device must connect over an external network. API success alone does not verify that protection.</p>
    </details>
    <form onSubmit={check}>
      <label className="check"><input type="checkbox" checked={inspect} onChange={event => { setInspect(event.target.checked); setResult(null); setResourceResult(null); }} disabled={busy} />Also check a specific resource</label>
      {inspect && <>
        <p>Also enable Get Resource, Get Resource Policy and List Targets on the organization API key. This inspection only reads configuration.</p>
        <label>Resource identifier<input value={identifier} onChange={event => setIdentifier(event.target.value)} required maxLength={100} pattern="[A-Za-z0-9_-]+" autoComplete="off" disabled={busy} /></label>
        <label>Expected hostname<input value={hostname} onChange={event => setHostname(event.target.value)} required maxLength={253} placeholder="ha-test.example.net" autoComplete="off" disabled={busy} /></label>
      </>}
      <label>Organization ID<input value={orgId} onChange={event => setOrgId(event.target.value)} required maxLength={100} pattern="[A-Za-z0-9_-]+" autoComplete="off" disabled={busy} /></label>
      <label>API key<input type="password" value={key} onChange={event => setKey(event.target.value)} required maxLength={1024} autoComplete="off" spellCheck={false} disabled={busy} /></label>
      <button disabled={busy}>{busy ? 'Checking…' : inspect ? 'Check resource' : 'Check connection'}</button>
    </form>
    <p className="status-message" role="status" aria-live="polite">{message}</p>
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
