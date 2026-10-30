import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { protectedPost } from './pki-api';

const resourceSchema = z.object({ resourceId: z.number(), niceId: z.string(), name: z.string(), fullDomain: z.string().nullable(), ssl: z.boolean(), mtls: z.boolean(), enabled: z.boolean() });
const resultSchema = z.object({ checkedAt: z.string(), organization: z.object({ name: z.string() }), mtlsRoutesAdvertised: z.boolean(),
  resources: z.object({ resources: z.array(resourceSchema), pagination: z.object({ total: z.number() }) }) });
type Resource = z.infer<typeof resourceSchema>;
const safeError = (error: unknown, fallback: string) => error instanceof Error && /\([A-Z_]+, HTTP \d+\)$/.test(error.message) ? error.message : fallback;
const cloudApiAddress = 'https://api.pangolin.net';
function savedApiUrl() { try { return localStorage.getItem('ha-pangolin-api-url') ?? ''; } catch { return ''; } }
function savedApiAddress() { try { return new URL(savedApiUrl()).origin; } catch { return ''; } }
export function integrationApiUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !['/', '/v1', '/v1/'].includes(url.pathname)) return null;
    return `${url.origin}/v1`;
  } catch { return null; }
}
type Feedback = { kind: 'progress' | 'success' | 'error'; text: string };

export function PangolinPanel({ ready, onInstalled }: { ready: boolean; onInstalled: () => void }) {
  const [apiAddress, setApiAddress] = useState(savedApiAddress);
  const apiUrl = integrationApiUrl(apiAddress);
  const [orgId, setOrgId] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<z.infer<typeof resultSchema> | null>(null);
  const [message, setMessage] = useState('');
  const [installed, setInstalled] = useState<Record<number, string>>({});
  const [mtlsEnabled, setMtlsEnabled] = useState<Record<number, boolean>>({});
  const [enableAfterInstall, setEnableAfterInstall] = useState<Record<number, boolean>>({});
  const [feedback, setFeedback] = useState<Record<number, Feedback>>({});
  function resourceFeedback(resourceId: number, kind: Feedback['kind'], text: string) {
    setFeedback(previous => ({ ...previous, [resourceId]: { kind, text } }));
  }
  async function discover(event: FormEvent) {
    event.preventDefault(); setBusy(true); setResult(null); setInstalled({}); setMtlsEnabled({}); setEnableAfterInstall({}); setFeedback({}); setMessage('Finding public resources…');
    try {
      if (!apiUrl) { setMessage('Enter the HTTPS integration API address from Pangolin’s Traefik Host rule. The app adds /v1.'); return; }
      const response = await protectedPost('./api/pangolin/check', { orgId, apiKey: key, apiUrl });
      const data = resultSchema.parse(await response.json());
      try { localStorage.setItem('ha-pangolin-api-url', apiUrl); } catch { /* URL can be reentered. */ }
      setResult(data);
      setMessage(`Found ${data.resources.pagination.total} public resources. Choose the Home Assistant resource below.`);
    } catch (error) { setMessage(safeError(error, 'Could not read Pangolin. Check the API URL, key and organization ID.')); }
    finally { setBusy(false); }
  }
  async function enableForResource(resource: Resource) {
    const response = await protectedPost('./api/pangolin/enable-mtls', {
      orgId, apiKey: key, apiUrl, resourceIdentifier: resource.niceId, hostname: resource.fullDomain, confirm: true,
    });
    return z.object({ status: z.enum(['enabled', 'already-enabled']) }).parse(await response.json());
  }
  async function install(resource: Resource) {
    if (!resource.fullDomain || !apiUrl) return;
    setBusy(true); resourceFeedback(resource.resourceId, 'progress', `Checking ${resource.fullDomain} and installing the public CA…`);
    try {
      const response = await protectedPost('./api/pangolin/install-ca', {
        orgId, apiKey: key, apiUrl, resourceIdentifier: resource.niceId, hostname: resource.fullDomain, confirm: true,
      });
      const outcome = z.object({ status: z.enum(['installed', 'already-installed']), fingerprint: z.string() }).parse(await response.json());
      setInstalled(previous => ({ ...previous, [resource.resourceId]: outcome.status }));
      const caMessage = outcome.status === 'installed' ? 'CA installed and fingerprint verified.' : 'This CA is already trusted and its fingerprint was verified.';
      if (enableAfterInstall[resource.resourceId]) {
        resourceFeedback(resource.resourceId, 'progress', `${caMessage} Enabling mTLS…`);
        try {
          const mtls = await enableForResource(resource);
          setMtlsEnabled(previous => ({ ...previous, [resource.resourceId]: true }));
          resourceFeedback(resource.resourceId, 'success', `${caMessage} mTLS ${mtls.status === 'enabled' ? 'enabled' : 'was already enabled'}. Test access with and without a device certificate before enabling the resource.`);
        } catch (error) {
          resourceFeedback(resource.resourceId, 'error', `${caMessage} mTLS was not confirmed: ${safeError(error, 'Check the resource’s mTLS setting in Pangolin before retrying.')}`);
        }
      } else resourceFeedback(resource.resourceId, 'success', `${caMessage} Enable Client Certificate (mTLS) in Pangolin, then test access with and without a device certificate.`);
    } catch (error) {
      resourceFeedback(resource.resourceId, 'error', safeError(error, 'Installation outcome is uncertain. Inspect this resource’s trusted CAs in Pangolin before retrying.'));
    } finally { setBusy(false); }
  }
  async function enable(resource: Resource) {
    if (!apiUrl) return;
    setBusy(true); resourceFeedback(resource.resourceId, 'progress', 'Enabling mTLS and verifying the resource policy…');
    try {
      const outcome = await enableForResource(resource);
      setMtlsEnabled(previous => ({ ...previous, [resource.resourceId]: true }));
      resourceFeedback(resource.resourceId, 'success', `mTLS ${outcome.status === 'enabled' ? 'enabled' : 'was already enabled'}. Test access with and without a device certificate before enabling the resource.`);
    } catch (error) { resourceFeedback(resource.resourceId, 'error', safeError(error, 'mTLS could not be confirmed. Inspect the resource in Pangolin.')); }
    finally { setBusy(false); }
  }
  return <div className="pangolin-setup">
    <p>For self-hosted Pangolin, first <a href="https://docs.pangolin.net/self-host/advanced/integration-api" target="_blank" rel="noreferrer">enable the integration API</a>. In Pangolin’s <code>config.yml</code> (often <code>config/config.yml</code>), add or set:</p>
    <pre><code>{'flags:\n  enable_integration_api: true'}</code></pre>
    <p>In <code>config/traefik/dynamic_config.yml</code>, add <code>int-api-router-redirect</code> for HTTP and <code>int-api-router</code> for HTTPS, both with the same <code>Host(`api.example.com`)</code> rule. Point their <code>int-api-service</code> to Pangolin’s integration listener, normally <code>http://pangolin:3003</code>. Merge these entries into the existing <code>http.routers</code> and <code>http.services</code>; keep the dashboard routes. Configure DNS and HTTPS for that API hostname, then restart or reload Pangolin and Traefik as needed. <a href="https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/installation.md#route-https-to-the-listener" target="_blank" rel="noreferrer">See the complete YAML example</a>.</p>
    <p>For that example, enter <code>https://api.example.com</code> below. Use the hostname in <em>your</em> <code>int-api-router</code> rule; it may differ from the Pangolin dashboard URL. For Pangolin Cloud, enter <code>{cloudApiAddress}</code> and skip the self-hosted configuration. This app adds <code>/v1</code>.</p>
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
    <p>Create the CA in <a href="#certificate-title">Device certificates</a> above before installing it on a resource.</p>
    <form onSubmit={discover}>
      <label>Pangolin integration API address<input type="url" value={apiAddress} onChange={event => { setApiAddress(event.target.value); setResult(null); }} required maxLength={300} placeholder="https://api.example.com" autoComplete="url" disabled={busy || !ready} /></label>
      <p>API URL this app will use: <code>{apiUrl ?? 'Enter the API address above'}</code></p>
      {apiUrl && <p>Verify that <a href={`${apiUrl}/openapi.json`} target="_blank" rel="noreferrer"><code>{apiUrl}/openapi.json</code></a> returns JSON before continuing.</p>}
      <label>Pangolin Organization ID<input value={orgId} onChange={event => { setOrgId(event.target.value); setResult(null); }} required maxLength={100} pattern="[A-Za-z0-9_-]+" autoComplete="off" disabled={busy || !ready} /></label>
      <label>Pangolin API key<input type="password" value={key} onChange={event => { setKey(event.target.value); setResult(null); }} required maxLength={1024} autoComplete="off" spellCheck={false} disabled={busy || !ready} /></label>
      <button disabled={busy || !ready}>{busy ? 'Working…' : 'Find public resources'}</button>
    </form>
    {!ready && <p>Finish administrator setup before connecting Pangolin.</p>}
    <p className="status-message" role="status" aria-live="polite">{message}</p>
    {result && <div>
      <p><strong>{result.organization.name} · public resources</strong></p>
      {!result.mtlsRoutesAdvertised && <p role="alert">This Pangolin API did not advertise every route used for CA installation. You can try the resource below; any failure will appear beside it.</p>}
      <ul className="resource-list">{result.resources.resources.map(resource => {
        const candidate = resource.ssl && Boolean(resource.fullDomain);
        const row = feedback[resource.resourceId];
        return <li key={resource.resourceId}>
          <div><strong>{resource.name}</strong><br /><span>{resource.fullDomain ?? 'No hostname'}</span><br />
            <small>{resource.enabled ? 'Enabled' : 'Disabled'} · HTTPS {resource.ssl ? 'on' : 'off'} · mTLS {resource.mtls ? 'reported on' : 'reported off'}</small></div>
          {candidate ? <div className="resource-actions">
            {!installed[resource.resourceId] && (resource.enabled ? <small>Disable this resource in Pangolin before enabling mTLS through the app.</small> :
              <label className="check"><input type="checkbox" checked={Boolean(enableAfterInstall[resource.resourceId])} onChange={event => setEnableAfterInstall(previous => ({ ...previous, [resource.resourceId]: event.target.checked }))} disabled={busy} /> Enable mTLS after installing the CA</label>)}
            {!installed[resource.resourceId] ? <button type="button" disabled={busy || !key} onClick={() => void install(resource)}>Install CA cert</button> : <>
              {!mtlsEnabled[resource.resourceId] && !resource.enabled && <button type="button" disabled={busy || !key} onClick={() => void enable(resource)}>Enable mTLS</button>}
              <button type="button" disabled={busy} onClick={onInstalled}>Finish setup</button>
            </>}
          </div> :
            <span>Requires an HTTPS public resource with a hostname</span>}
          {row && <p className={`resource-feedback ${row.kind}`} role={row.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{row.text}</p>}
        </li>;
      })}</ul>
      <p className="footnote">Choose the HTTPS Home Assistant resource. The app checks its policy and trust before uploading the public CA. Turning on mTLS requires a disabled resource and immediately rejects clients without a trusted certificate when the resource is enabled. Test that an unenrolled client fails and an enrolled device connects.</p>
    </div>}
  </div>;
}
