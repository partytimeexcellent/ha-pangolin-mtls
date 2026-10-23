import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { checked, protectedPost } from './pki-api';

const authoritySchema = z.object({ fingerprint: z.string(), serial: z.string(), issuedAt: z.string(), expiresAt: z.string() });
const certificateSchema = z.object({ id: z.string().uuid(), name: z.string(), platform: z.string(), serial: z.string(), fingerprint: z.string(), issuedAt: z.string(), expiresAt: z.string(), exportStatus: z.string() });
const inventorySchema = z.object({ authority: authoritySchema.nullable(), certificates: z.array(certificateSchema) });
const packageSchema = z.object({ id: z.string().uuid(), password: z.string(), token: z.string().regex(/^[a-f0-9]{64}$/), expiresAt: z.number() });
type Package = z.infer<typeof packageSchema>;

export function CertificatePanel() {
  const [enabled, setEnabled] = useState(false);
  const [inventory, setInventory] = useState<z.infer<typeof inventorySchema> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Loading certificate status…');
  const [confirmed, setConfirmed] = useState(false);
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('ios');
  const [days, setDays] = useState(90);
  const [bundle, setBundle] = useState<Package | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  async function refresh() {
    const response = await checked(await fetch('./api/pki', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(10_000) }));
    setInventory(inventorySchema.parse(await response.json()));
  }
  useEffect(() => {
    void (async () => {
      try {
        const status = await checked(await fetch('./api/status', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(10_000) }));
        const data = z.object({ signingEnabled: z.boolean() }).parse(await status.json());
        setEnabled(data.signingEnabled);
        if (data.signingEnabled) { await refresh(); setMessage('Ready. No certificates are created automatically.'); }
        else setMessage('Certificate management is off. Enable it in this app’s Configuration when ready.');
      } catch { setMessage('Could not load certificate status. Reopen the Web UI or check your access.'); }
    })();
  }, []);

  useEffect(() => {
    if (!bundle) return;
    const timer = setTimeout(() => {
      setBundle(null); setShowPassword(false);
      setMessage('The temporary package and password display expired. Downloaded copies remain your responsibility.');
      void refresh().catch(() => {});
    }, Math.max(0, bundle.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [bundle]);

  async function action(operation: () => Promise<void>) {
    setBusy(true);
    try { await operation(); }
    catch (error) {
      // Only pki-api's fixed messages are displayed; never show raw parsing/network exceptions.
      setMessage(error instanceof Error && /\([A-Z_]+, HTTP \d+\)$/.test(error.message)
        ? error.message : 'The operation did not complete. Reopen the Web UI and inspect the inventory before retrying.');
    } finally { setBusy(false); }
  }
  async function createAuthority() {
    await action(async () => {
      await protectedPost('./api/ca', { confirm: true }); await refresh();
      setMessage('Certificate authority created locally. Pangolin has not been changed.');
    });
  }
  async function issue(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      setBundle(null); setShowPassword(false); setDownloaded(false);
      const response = await protectedPost('./api/certificates', { name, platform, lifetimeDays: days });
      setBundle(packageSchema.parse(await response.json())); await refresh();
      setMessage('Certificate issued. Save its password separately, then download the package within five minutes.');
    });
  }
  async function download() {
    if (!bundle) return;
    await action(async () => {
      const response = await protectedPost(`./api/certificates/${bundle.id}/download`, { token: bundle.token });
      if (!response.headers.get('content-type')?.startsWith('application/x-pkcs12')) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `ha-device-${bundle.id}.p12`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDownloaded(true); await refresh();
      setMessage('Package delivered once. Import it into Companion using the separate password. Delivery does not prove installation.');
    });
  }
  return <section aria-labelledby="certificate-title">
    <span className="badge">Local certificate prototype</span>
    <h2 id="certificate-title">Certificate authority and devices</h2>
    <p>No Pangolin connection is made by this build. Certificates grant no remote access until a server explicitly trusts their CA.</p>
    <p role="status" aria-live="polite">{message}</p>
    {enabled && inventory && <>
      {!inventory.authority ? <>
        <p>The CA signing key is encrypted with a locally stored unlock secret. A full host or backup compromise can expose both.</p>
        <label className="check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Create a dedicated local CA for this prototype</label>
        <button disabled={busy || !confirmed} onClick={createAuthority}>Create certificate authority</button>
      </> : <>
        <p>CA expires {new Date(inventory.authority.expiresAt).toLocaleDateString()}</p>
        <p className="fingerprint">SHA-256: {inventory.authority.fingerprint}</p>
        <a href="./api/ca/certificate" download="ha-pangolin-ca.pem">Download public CA certificate</a>
        <p>Take a protected Home Assistant backup after CA creation. Separate encrypted recovery export and rotation are not implemented yet.</p>
        <form onSubmit={issue}>
          <h3>Issue a device identity</h3>
          <label>Device name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="off" /></label>
          <label>Platform<select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="ios">iOS</option><option value="ipados">iPadOS</option><option value="macos">macOS</option><option value="other">Other</option>
          </select></label>
          <label>Lifetime in days<input type="number" value={days} onChange={(e) => setDays(e.target.valueAsNumber)} min={1} max={365} required /></label>
          <button disabled={busy || Boolean(bundle && !downloaded)} type="submit">Issue certificate</button>
        </form>
      </>}
      {bundle && <aside>
        <h3>Temporary enrollment package</h3>
        <p>Expires {new Date(bundle.expiresAt).toLocaleTimeString()}. Keep the package and password separate.</p>
        <button onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide password' : 'Show package password'}</button>
        {showPassword && <p className="fingerprint"><code>{bundle.password}</code></p>}
        <button onClick={download} disabled={busy || downloaded}>{downloaded ? 'Package downloaded' : 'Download .p12 once'}</button>
        <p>Restarting the app or leaving this page can make a pending package unrecoverable. No reusable download link is created.</p>
      </aside>}
      {inventory.certificates.length > 0 && <>
        <h3>Issued certificates</h3>
        <div className="table-scroll"><table><thead><tr><th>Device</th><th>Expires</th><th>Export</th><th>Certificate identity</th></tr></thead>
          <tbody>{inventory.certificates.map((cert) => <tr key={cert.id}><td>{cert.name}<br />{cert.platform}</td>
            <td>{new Date(cert.expiresAt).toLocaleDateString()}</td><td>{cert.exportStatus}</td>
            <td className="fingerprint">Serial: {cert.serial}<br />SHA-256: {cert.fingerprint}</td></tr>)}</tbody></table></div>
        <p>These are issuance records, not verified enrollments. Issuing a replacement does not invalidate an older certificate.</p>
      </>}
    </>}
  </section>;
}
