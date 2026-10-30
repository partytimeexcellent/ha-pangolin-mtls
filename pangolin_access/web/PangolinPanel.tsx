import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { protectedPost } from './pki-api';

const resourceSchema = z.object({ resourceId: z.number(), niceId: z.string(), name: z.string(), fullDomain: z.string().nullable(), ssl: z.boolean(), mtls: z.boolean(), enabled: z.boolean() });
const resultSchema = z.object({ checkedAt: z.string(), organization: z.object({ name: z.string() }), mtlsRoutesAdvertised: z.boolean(),
  resources: z.object({ resources: z.array(resourceSchema), pagination: z.object({ total: z.number() }) }) });
type Resource = z.infer<typeof resourceSchema>;
const safeError = (error: unknown, fallback: string) => error instanceof Error && /\([A-Z_]+, HTTP \d+\)$/.test(error.message) ? error.message : fallback;
function savedApiUrl() { try { return localStorage.getItem('ha-pangolin-api-url') ?? ''; } catch { return ''; } }

export function PangolinPanel({ ready, onInstalled }: { ready: boolean; onInstalled: () => void }) {
  const [apiUrl, setApiUrl] = useState(savedApiUrl);
  const [orgId, setOrgId] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<z.infer<typeof resultSchema> | null>(null);
  const [message, setMessage] = useState('');
  const [installed, setInstalled] = useState<Record<number, string>>({});
  async function discover(event: FormEvent) {
    event.preventDefault(); setBusy(true); setResult(null); setInstalled({}); setMessage('Finding public resources…');
    try {
      const response = await protectedPost('./api/pangolin/check', { orgId, apiKey: key, apiUrl });
      const data = resultSchema.parse(await response.json());
      try { localStorage.setItem('ha-pangolin-api-url', apiUrl); } catch { /* URL can be reentered. */ }
      setResult(data);
      setMessage(`Found ${data.resources.pagination.total} public resources. Choose the Home Assistant resource below.`);
    } catch (error) { setMessage(safeError(error, 'Could not read Pangolin. Check the API URL, key and organization ID.')); }
    finally { setBusy(false); }
  }
  async function install(resource: Resource) {
    if (!resource.fullDomain) return;
    setBusy(true); setMessage(`Checking ${resource.fullDomain} and installing the public CA…`);
    try {
      const response = await protectedPost('./api/pangolin/install-ca', {
        orgId, apiKey: key, apiUrl, resourceIdentifier: resource.niceId, hostname: resource.fullDomain, confirm: true,
      });
      const outcome = z.object({ status: z.enum(['installed', 'already-installed']), fingerprint: z.string() }).parse(await response.json());
      setInstalled(previous => ({ ...previous, [resource.resourceId]: outcome.status }));
      setMessage(outcome.status === 'installed' ? `CA installed on ${resource.fullDomain}. Enable mTLS for this resource in Pangolin, then test both allowed and denied access.` :
        `This CA is already trusted on ${resource.fullDomain}. Check whether mTLS is enabled, then test access.`);
      onInstalled();
    } catch (error) {
      setMessage(safeError(error, 'Installation outcome is uncertain. Inspect the resource in Pangolin before trying again.'));
    } finally { setBusy(false); }
  }
  return <div className="pangolin-setup">
    <p>In Pangolin, open your <strong>Organization → API Keys → Create API Key</strong>. Give it a name such as “Home Assistant CA setup.” Check these eight permission boxes:</p>
    <ul className="permission-list">
      <li>Organization: <strong>Get Organization</strong></li>
      <li>Site: <strong>List Sites</strong></li>
      <li>Domain: <strong>List Organization Domains</strong></li>
      <li>Resource: <strong>List Resources</strong></li>
      <li>Resource: <strong>Get Resource</strong></li>
      <li>Resource Policy: <strong>Get Resource Policy</strong></li>
      <li>Target: <strong>List Targets</strong></li>
      <li>Resource: <strong>Create Resource mTLS Certificate</strong></li>
    </ul>
    <p>Create the key and copy it immediately; Pangolin shows it only once. Use an <strong>organization</strong> key, not a root key. Find the organization ID in Pangolin’s organization settings or dashboard URL.</p>
    <p>For self-hosted Pangolin, enable the <a href="https://docs.pangolin.net/manage/integration-api" target="_blank" rel="noreferrer">integration API</a>. Enter its public HTTPS URL ending in <code>/v1</code> below. Create the CA in <a href="#certificate-title">Device certificates</a> below, then return here.</p>
    <form onSubmit={discover}>
      <label>Pangolin API URL<input type="url" value={apiUrl} onChange={event => { setApiUrl(event.target.value); setResult(null); }} required maxLength={300} placeholder="https://api.example.net/v1" autoComplete="url" disabled={busy || !ready} /></label>
      <label>Pangolin Organization ID<input value={orgId} onChange={event => { setOrgId(event.target.value); setResult(null); }} required maxLength={100} pattern="[A-Za-z0-9_-]+" autoComplete="off" disabled={busy || !ready} /></label>
      <label>Pangolin API key<input type="password" value={key} onChange={event => { setKey(event.target.value); setResult(null); }} required maxLength={1024} autoComplete="off" spellCheck={false} disabled={busy || !ready} /></label>
      <button disabled={busy || !ready}>{busy ? 'Working…' : 'Find public resources'}</button>
    </form>
    {!ready && <p>Finish administrator setup before connecting Pangolin.</p>}
    <p className="status-message" role="status" aria-live="polite">{message}</p>
    {result && <div>
      <p><strong>{result.organization.name} · public resources</strong></p>
      {!result.mtlsRoutesAdvertised && <p role="alert">This Pangolin API does not advertise every mTLS management route. Check your Pangolin version before installing.</p>}
      <ul className="resource-list">{result.resources.resources.map(resource => {
        const candidate = resource.ssl && Boolean(resource.fullDomain);
        return <li key={resource.resourceId}>
          <div><strong>{resource.name}</strong><br /><span>{resource.fullDomain ?? 'No hostname'}</span><br />
            <small>{resource.enabled ? 'Enabled' : 'Disabled'} · HTTPS {resource.ssl ? 'on' : 'off'} · mTLS {resource.mtls ? 'reported on' : 'reported off'}</small></div>
          {candidate ? <button type="button" disabled={busy || !key || !result.mtlsRoutesAdvertised || Boolean(installed[resource.resourceId])} onClick={() => void install(resource)}>
            {installed[resource.resourceId] ? installed[resource.resourceId] === 'installed' ? 'CA installed' : 'Already installed' : 'Install CA cert'}</button> :
            <span>Requires an HTTPS public resource with a hostname</span>}
        </li>;
      })}</ul>
      <p className="footnote">Choose the HTTPS Home Assistant resource. The app checks its policy and trust before uploading the public CA. In Pangolin, enable client certificate (mTLS) on that resource; then test that an unenrolled client fails and an enrolled device connects.</p>
    </div>}
  </div>;
}
