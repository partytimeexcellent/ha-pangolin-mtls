import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { protectedPost } from './pki-api';

const resourceSchema = z.object({ resourceId: z.number(), niceId: z.string(), name: z.string(), fullDomain: z.string().nullable(), ssl: z.boolean(), mtls: z.boolean(), enabled: z.boolean() });
const resultSchema = z.object({ checkedAt: z.string(), organization: z.object({ name: z.string() }), mtlsRoutesAdvertised: z.boolean(),
  resources: z.object({ resources: z.array(resourceSchema), pagination: z.object({ total: z.number() }) }) });
type Resource = z.infer<typeof resourceSchema>;
const safeError = (error: unknown, fallback: string) => error instanceof Error && /\([A-Z_]+, HTTP \d+\)$/.test(error.message) ? error.message : fallback;
const cloudApiUrl = 'https://api.pangolin.net/v1';
function savedApiUrl() { try { return localStorage.getItem('ha-pangolin-api-url') ?? ''; } catch { return ''; } }
function savedDeployment(): 'cloud' | 'self-hosted' { return savedApiUrl() === cloudApiUrl ? 'cloud' : 'self-hosted'; }
function savedApiOrigin() { try { const saved = savedApiUrl(); return saved === cloudApiUrl ? '' : new URL(saved).origin; } catch { return ''; } }
function selfHostedApiUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !['/', '/v1', '/v1/'].includes(url.pathname)) return null;
    return `${url.origin}/v1`;
  } catch { return null; }
}

export function PangolinPanel({ ready, onInstalled }: { ready: boolean; onInstalled: () => void }) {
  const [deployment, setDeployment] = useState<'cloud' | 'self-hosted'>(savedDeployment);
  const [apiOrigin, setApiOrigin] = useState(savedApiOrigin);
  const apiUrl = deployment === 'cloud' ? cloudApiUrl : selfHostedApiUrl(apiOrigin);
  const [orgId, setOrgId] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<z.infer<typeof resultSchema> | null>(null);
  const [message, setMessage] = useState('');
  const [installed, setInstalled] = useState<Record<number, string>>({});
  async function discover(event: FormEvent) {
    event.preventDefault(); setBusy(true); setResult(null); setInstalled({}); setMessage('Finding public resources…');
    try {
      if (!apiUrl) { setMessage('Enter the HTTPS integration API hostname, without a dashboard path. The app adds /v1.'); return; }
      const response = await protectedPost('./api/pangolin/check', { orgId, apiKey: key, apiUrl });
      const data = resultSchema.parse(await response.json());
      try { localStorage.setItem('ha-pangolin-api-url', apiUrl); } catch { /* URL can be reentered. */ }
      setResult(data);
      setMessage(`Found ${data.resources.pagination.total} public resources. Choose the Home Assistant resource below.`);
    } catch (error) { setMessage(safeError(error, 'Could not read Pangolin. Check the API URL, key and organization ID.')); }
    finally { setBusy(false); }
  }
  async function install(resource: Resource) {
    if (!resource.fullDomain || !apiUrl) return;
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
    <fieldset disabled={busy || !ready}><legend>Pangolin deployment</legend>
      <label className="check"><input type="radio" name="pangolin-deployment" checked={deployment === 'self-hosted'} onChange={() => { setDeployment('self-hosted'); setResult(null); }} /> Self-hosted</label>
      <label className="check"><input type="radio" name="pangolin-deployment" checked={deployment === 'cloud'} onChange={() => { setDeployment('cloud'); setResult(null); }} /> Pangolin Cloud</label>
    </fieldset>
    {deployment === 'self-hosted' ? <>
      <p><a href="https://docs.pangolin.net/self-host/advanced/integration-api" target="_blank" rel="noreferrer">Enable the Pangolin integration API</a> first. In Pangolin’s <code>config.yml</code> (often <code>config/config.yml</code>), add or set:</p>
      <pre><code>{'flags:\n  enable_integration_api: true'}</code></pre>
      <p>Restart Pangolin. Route a public HTTPS API hostname through Traefik to Pangolin’s integration listener (default port <code>3003</code>). The hostname is the one in your Traefik <code>int-api-router</code> rule, often <code>api.your-domain.com</code>. It may differ from the dashboard hostname.</p>
    </> : <p>Pangolin Cloud uses <code>{cloudApiUrl}</code> automatically. No self-hosted <code>config.yml</code> or Traefik setup is needed.</p>}
    <p>In Pangolin, open <strong>Organization → API Keys → Create API Key</strong>. Give the organization key a name such as “Home Assistant CA setup.” Check these eight permission boxes:</p>
    <ul className="permission-list">
      <li>Organization: <strong>Get Organization</strong></li>
      <li>Domain: <strong>List Organization Domains</strong></li>
      <li>Site: <strong>List Sites</strong></li>
      <li>Resource: <strong>Get Resource</strong></li>
      <li>Resource: <strong>List Resources</strong></li>
      <li>Target: <strong>List Targets</strong></li>
      <li>Resource Policy: <strong>Get Resource Policy</strong></li>
      <li>Resource Policy: <strong>Update Resource Policy</strong></li>
    </ul>
    <p><strong>Update Resource Policy</strong> permits broader policy changes in Pangolin. This app uses it only to add the CA to the selected resource’s own inline policy. Create a temporary organization key, copy it immediately, and revoke it after setup.</p>
    <p>Find the <strong>Pangolin Organization ID</strong> in the dashboard URL: in <code>https://pangolin.domain.com/organizationid/settings/api-keys</code>, enter <code>organizationid</code>. It is the first path segment after the hostname, not the organization display name.</p>
    <p>Create the CA in <a href="#certificate-title">Device certificates</a> below, then return here.</p>
    <form onSubmit={discover}>
      {deployment === 'self-hosted' && <label>Pangolin integration API address<input type="url" value={apiOrigin} onChange={event => { setApiOrigin(event.target.value); setResult(null); }} required maxLength={300} placeholder="https://api.your-domain.com" autoComplete="url" disabled={busy || !ready} /></label>}
      <p>API URL this app will check: <code>{apiUrl ?? 'Enter the API address above'}</code></p>
      {apiUrl && <p>Verify that <a href={`${apiUrl}/openapi.json`} target="_blank" rel="noreferrer"><code>{apiUrl}/openapi.json</code></a> returns JSON before continuing.</p>}
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
