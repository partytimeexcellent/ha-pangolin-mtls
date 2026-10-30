import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { protectedPost } from './pki-api';

const resourceSchema = z.object({ resourceId: z.number(), niceId: z.string(), name: z.string(), fullDomain: z.string().nullable(), ssl: z.boolean(), mtls: z.boolean(), enabled: z.boolean() });
const resultSchema = z.object({ checkedAt: z.string(), organization: z.object({ name: z.string() }), mtlsRoutesAdvertised: z.boolean(),
  resources: z.object({ resources: z.array(resourceSchema), pagination: z.object({ total: z.number() }) }) });
type Resource = z.infer<typeof resourceSchema>;
const safeError = (error: unknown, fallback: string) => error instanceof Error && /\([A-Z_]+, HTTP \d+\)$/.test(error.message) ? error.message : fallback;

export function PangolinPanel({ ready }: { ready: boolean }) {
  const [orgId, setOrgId] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<z.infer<typeof resultSchema> | null>(null);
  const [message, setMessage] = useState('');
  const [installed, setInstalled] = useState<Record<number, string>>({});
  async function discover(event: FormEvent) {
    event.preventDefault(); setBusy(true); setResult(null); setInstalled({}); setMessage('Finding public resources…');
    try {
      const response = await protectedPost('./api/pangolin/check', { orgId, apiKey: key });
      const data = resultSchema.parse(await response.json());
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
        orgId, apiKey: key, resourceIdentifier: resource.niceId, hostname: resource.fullDomain, confirm: true,
      });
      const outcome = z.object({ status: z.enum(['installed', 'already-installed']), fingerprint: z.string() }).parse(await response.json());
      setInstalled(previous => ({ ...previous, [resource.resourceId]: outcome.status }));
      setMessage(outcome.status === 'installed' ? `CA installed on ${resource.fullDomain}. Enable mTLS for this resource in Pangolin, then test both allowed and denied access.` :
        `This CA is already trusted on ${resource.fullDomain}. Check whether mTLS is enabled, then test access.`);
    } catch (error) {
      setMessage(safeError(error, 'Installation outcome is uncertain. Inspect the resource in Pangolin before trying again.'));
    } finally { setBusy(false); }
  }
  return <section aria-labelledby="pangolin-title" className="pangolin-setup">
    <h2 id="pangolin-title">Connect Pangolin and install the CA</h2>
    <p>First create the certificate authority in <a href="#certificate-title">Device certificates</a> below, then return here. Choose the public resource for Home Assistant and install the authority’s public certificate. The private signing key stays in this app.</p>
    <ol className="install-steps">
      <li>In Pangolin, enable the <strong>integration API</strong> and create an organization API key. Give it Get Organization, List Sites, List Organization Domains, List Resources, Get Resource, Get Resource Policy, List Targets, and Create Resource mTLS Certificate permissions.</li>
      <li>In this app’s Configuration, enter the <strong>HTTPS Pangolin integration API URL ending in /v1</strong>, then save and restart. Enter the organization ID and API key below.</li>
      <li>Find public resources and select the HTTPS Home Assistant resource. The app checks its policy and current trust before uploading the public CA.</li>
      <li>In Pangolin, <strong>enable client certificate (mTLS)</strong> on that resource. Then test: a client without a certificate must fail, while a device with its imported certificate must connect. Home Assistant sign-in still applies.</li>
    </ol>
    <p>The API key stays in this page’s memory for these actions; it is not saved. Close the page when finished. The app does not automatically enable mTLS.</p>
    <form onSubmit={discover}>
      <label>Organization ID<input value={orgId} onChange={event => { setOrgId(event.target.value); setResult(null); }} required maxLength={100} pattern="[A-Za-z0-9_-]+" autoComplete="off" disabled={busy || !ready} /></label>
      <label>API key<input type="password" value={key} onChange={event => { setKey(event.target.value); setResult(null); }} required maxLength={1024} autoComplete="off" spellCheck={false} disabled={busy || !ready} /></label>
      <button disabled={busy || !ready}>{busy ? 'Working…' : 'Find public resources'}</button>
    </form>
    {!ready && <p>Finish administrator setup before connecting Pangolin.</p>}
    <p className="status-message" role="status" aria-live="polite">{message}</p>
    {result && <div>
      <h3>{result.organization.name} · public resources</h3>
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
      <p className="footnote">The app checks shared policy, resource type, hostname conflicts and existing trust when you select Install. A successful upload confirms CA trust in the API; test a real TLS connection before relying on protection.</p>
    </div>}
  </section>;
}
