import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { checked, protectedPost } from './pki-api';

const authoritySchema = z.object({ fingerprint: z.string(), serial: z.string(), issuedAt: z.string(), expiresAt: z.string() });
const certificateSchema = z.object({ id: z.string().uuid(), name: z.string(), platform: z.string(), serial: z.string(), fingerprint: z.string(), issuedAt: z.string(), expiresAt: z.string(), exportStatus: z.string(), replacesId: z.string().uuid().nullable(), replacementConfirmedAt: z.string().nullable() });
const inventorySchema = z.object({ authority: authoritySchema.nullable(), certificates: z.array(certificateSchema), reminders: z.object({ enabled: z.boolean(), deliveryFailed: z.boolean(), thresholds: z.array(z.number()) }) });
const packageSchema = z.object({ id: z.string().uuid(), password: z.string(), token: z.string().regex(/^[a-f0-9]{64}$/), expiresAt: z.number(), profileDisplayName: z.string() });
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
  const [replacing, setReplacing] = useState<z.infer<typeof certificateSchema> | null>(null);
  const [tested, setTested] = useState<Record<string, boolean>>({});
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  function expiry(expiresAt: string) {
    const days = Math.ceil((Date.parse(expiresAt) - clock) / 86_400_000);
    return days <= 0 ? 'Expired' : `${days} day${days === 1 ? '' : 's'} left${days <= 30 ? ' — replacement due' : ''}`;
  }
  function replace(cert: z.infer<typeof certificateSchema>) {
    setReplacing(cert); setName(cert.name); setPlatform(cert.platform); setDays(90);
    setMessage('Step 1: issue a fresh identity. Step 2: import it on your device. Step 3: test a new connection, then confirm below.');
    document.getElementById('device-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function confirmReplacement(id: string) {
    await action(async () => {
      await protectedPost(`./api/certificates/${id}/confirm-replacement`, { confirm: true });
      await refresh(); setMessage('Your test confirmation was saved. Old-certificate reminders are suppressed; its certificate remains valid until expiry.');
    });
  }

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
      const response = await protectedPost('./api/certificates', { name, platform, lifetimeDays: days, ...(replacing ? { replacesId: replacing.id } : {}) });
      setBundle(packageSchema.parse(await response.json())); setReplacing(null); await refresh();
      setMessage('Certificate issued. Save its password separately, then download the package within five minutes.');
    });
  }
  async function download(format: 'p12' | 'zip' | 'mobileconfig') {
    if (!bundle) return;
    await action(async () => {
      const response = await protectedPost(`./api/certificates/${bundle.id}/download`, { token: bundle.token, format });
      if (!response.headers.get('content-type')?.startsWith(format === 'zip' ? 'application/zip' : format === 'mobileconfig' ? 'application/x-apple-aspen-config' : 'application/x-pkcs12')) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `ha-device-${bundle.id}.${format}`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDownloaded(true); await refresh();
      setMessage(format === 'mobileconfig' ? 'Safari profile delivered once. Complete installation in iOS Settings using the separate package password. Delivery does not prove installation.' : 'Package delivered once. Import the .p12 into Companion; the ZIP also contains the named Safari profile. Use the separate password. Delivery does not prove installation.');
    });
  }
  return <section aria-labelledby="certificate-title">
    <span className="badge">Local certificate prototype</span>
    <h2 id="certificate-title">Certificate authority and devices</h2>
    <p>Pangolin configuration is unchanged by these controls. Certificates grant remote access only when the server trusts their CA.</p>
    <p role="status" aria-live="polite">{message}</p>
    {enabled && inventory && <>
      <p>Home Assistant expiry reminders: {inventory.reminders.enabled ? 'enabled (persistent notifications)' : 'off — enable_home_assistant_notifications in Configuration enables persistent notifications'}. Checks run at startup and hourly while this app is running, at 30, 14, 7 and 1 day, then expiry.</p>
      {inventory.reminders.deliveryFailed && <p role="alert">A reminder could not be delivered. The app will retry; review certificate dates here.</p>}
      {!inventory.authority ? <>
        <p>The CA signing key is encrypted with a locally stored unlock secret. A full host or backup compromise can expose both.</p>
        <label className="check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Create a dedicated local CA for this prototype</label>
        <button disabled={busy || !confirmed} onClick={createAuthority}>Create certificate authority</button>
      </> : <>
        <p>CA expires {new Date(inventory.authority.expiresAt).toLocaleDateString()} · {expiry(inventory.authority.expiresAt)}</p>
        <p className="fingerprint">SHA-256: {inventory.authority.fingerprint}</p>
        <a href="./api/ca/certificate" download="ha-pangolin-ca.pem">Download public CA certificate</a>
        <p>Take a protected Home Assistant backup after CA creation. Separate encrypted recovery export and rotation are not implemented yet.</p>
        <form id="device-form" onSubmit={issue}>
          <h3>{replacing ? `Replace ${replacing.name}` : 'Issue a device identity'}</h3>
          {replacing && <><p>The old identity remains usable. The new identity has a fresh key and password, signed by the same CA. No Pangolin trust change is needed when that CA is already trusted.</p><button type="button" disabled={busy} onClick={() => setReplacing(null)}>Cancel replacement</button></>}
          <label>Device name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="off" /></label>
          <label>Platform<select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="ios">iOS</option><option value="ipados">iPadOS</option><option value="macos">macOS</option><option value="other">Other</option>
          </select></label>
          <label>Lifetime in days<input type="number" value={days} onChange={(e) => setDays(e.target.valueAsNumber)} min={1} max={365} required /></label>
          <button disabled={busy || Boolean(bundle && !downloaded)} type="submit">{replacing ? 'Issue replacement' : 'Issue certificate'}</button>
        </form>
      </>}
      {bundle && <aside>
        <h3>Temporary enrollment package</h3>
        <p>Safari profile name: {bundle.profileDisplayName}</p>
        <p>Expires {new Date(bundle.expiresAt).toLocaleTimeString()}. Keep the package and password separate.</p>
        <button onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide password' : 'Show package password'}</button>
        {showPassword && <p className="fingerprint"><code>{bundle.password}</code></p>}
        <button onClick={() => download('p12')} disabled={busy || downloaded}>{downloaded ? 'Package downloaded' : 'Download .p12 once'}</button>
        <button onClick={() => download('zip')} disabled={busy || downloaded}>Download iPhone ZIP once</button>
        <button onClick={() => download('mobileconfig')} disabled={busy || downloaded}>Download Safari profile once</button>
        <p>Choose one download. For both apps, choose iPhone ZIP: extract in Files, import the .p12 inside Companion, then open the .mobileconfig to install the named Safari identity in Settings. Safari-only users can choose the profile directly. Keep the password separate.</p>
        <p>The profile contains only the encrypted identity; it has no password, MDM enrollment or root trust settings. It is unsigned, so iOS may show Not Signed or Unverified. Review the expected name and identity before installing. ZIP adds no encryption. Actual iOS profile installation still needs verification.</p>
        <p>Restarting the app or leaving this page can make a pending package unrecoverable. No reusable download link is created.</p>
      </aside>}
      {inventory.certificates.length > 0 && <>
        <h3>Issued certificates</h3>
        <div className="table-scroll"><table><thead><tr><th>Device</th><th>Expires</th><th>Export</th><th>Certificate identity</th><th>Replacement</th></tr></thead>
          <tbody>{inventory.certificates.map((cert) => <tr key={cert.id}><td>{cert.name}<br />{cert.platform}</td>
            <td>{new Date(cert.expiresAt).toLocaleDateString()}<br />{expiry(cert.expiresAt)}</td><td>{cert.exportStatus}</td>
            <td className="fingerprint">Serial: {cert.serial}<br />SHA-256: {cert.fingerprint}</td>
            <td>{inventory.certificates.some((item) => item.replacesId === cert.id && item.replacementConfirmedAt) ? <p>Replacement tested. This older certificate remains valid until expiry; reminders suppressed.</p> : <button disabled={busy || Boolean(bundle && !downloaded)} onClick={() => replace(cert)}>Replace certificate</button>}
            {cert.replacesId && <><p>Replaces {inventory.certificates.find((item) => item.id === cert.replacesId)?.name ?? 'an older identity'}.</p>
            {cert.replacementConfirmedAt ? <p>Device test confirmed.</p> : <><p>Import this identity into the intended app, close and reopen it and test access over cellular or another external network. Avoid an existing session or local connection.</p>
            <label className="check"><input type="checkbox" checked={Boolean(tested[cert.id])} onChange={(event) => setTested({ ...tested, [cert.id]: event.target.checked })} /> I imported this replacement and tested access</label>
            <button disabled={busy || !tested[cert.id] || cert.exportStatus !== 'downloaded'} onClick={() => confirmReplacement(cert.id)}>Confirm replacement tested</button></>}</>}
            </td></tr>)}</tbody></table></div>
        <p>These are issuance records, not verified enrollments. Issuing a replacement does not invalidate an older certificate.</p>
      </>}
    </>}
  </section>;
}
