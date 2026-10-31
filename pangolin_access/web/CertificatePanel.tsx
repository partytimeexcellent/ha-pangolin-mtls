import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { checked, protectedPost } from './pki-api';
import { DeviceInstallGuides } from './DeviceInstallGuides';

const authoritySchema = z.object({ fingerprint: z.string(), serial: z.string(), issuedAt: z.string(), expiresAt: z.string() });
const certificateSchema = z.object({ id: z.string().uuid(), name: z.string(), platform: z.string(), serial: z.string(), fingerprint: z.string(), issuedAt: z.string(), expiresAt: z.string(), exportStatus: z.string(), replacesId: z.string().uuid().nullable(), replacementConfirmedAt: z.string().nullable() });
const inventorySchema = z.object({ authority: authoritySchema.nullable(), certificates: z.array(certificateSchema), reminders: z.object({ enabled: z.boolean(), deliveryFailed: z.boolean(), thresholds: z.array(z.number()) }) });
const packageSchema = z.object({ id: z.string().uuid(), password: z.string(), token: z.string().regex(/^[a-f0-9]{64}$/), expiresAt: z.number(), profileDisplayName: z.string(), zipFilename: z.string(), certificate: z.object({ platform: z.string() }) });
type Package = z.infer<typeof packageSchema>;

export function CertificatePanel() {
  const [adding, setAdding] = useState(false);
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
    setAdding(true); setReplacing(cert); setName(cert.name); setPlatform(cert.platform === 'ipados' ? 'ios' : cert.platform); setDays(90);
    setMessage('Create a replacement, install it on your device, then test access and confirm below.');
    document.getElementById('device-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function confirmReplacement(id: string) {
    await action(async () => {
      await protectedPost(`./api/certificates/${id}/confirm-replacement`, { confirm: true });
      await refresh(); setMessage('Your test confirmation was saved. Reminders for the old certificate are off. The old certificate remains valid until it expires.');
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
        if (data.signingEnabled) { await refresh(); setMessage(''); }
        else setMessage('Certificate service is unavailable. Check the Home Assistant HTTPS URL and restart the app.');
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
        ? error.message : 'The operation did not complete. Reopen the Web UI and review your certificates before trying again.');
    } finally { setBusy(false); }
  }
  async function createAuthority() {
    await action(async () => {
      await protectedPost('./api/ca', { confirm: true }); await refresh();
      setMessage('Certificate authority created locally. Pangolin has not been changed.');
    });
  }
  async function toggleReminders() {
    if (!inventory) return;
    const next = !inventory.reminders.enabled;
    await action(async () => {
      await protectedPost('./api/reminders', { enabled: next });
      await refresh();
      setMessage(next ? 'Expiry reminders are on. Home Assistant will show notices when a certificate reaches a reminder threshold.' :
        'Expiry reminders are off. Existing Home Assistant notices remain until dismissed.');
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
      anchor.href = url; anchor.download = format === 'zip' ? bundle.zipFilename : format === 'p12' ? 'Home Assistant identity.p12' : 'Install for Safari.mobileconfig';
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDownloaded(true); await refresh();
      setMessage(format === 'mobileconfig' ? 'Safari profile downloaded once. Complete installation in iPhone or iPad Settings using the separate package password.' :
        format === 'zip' ? 'Certificate package downloaded once. Extract it in Files and follow the iPhone or iPad instructions below.' :
          'Certificate downloaded once. Follow the instructions for your device below to import the .p12.');
    });
  }
  return <section aria-labelledby="certificate-title">
    <h2 id="certificate-title">Device certificates</h2>
    <p>Create the certificate authority here first, then install its public CA on the Pangolin resource below. After mTLS is enabled, create a certificate for each device.</p>
    {message && <p className="status-message" role="status" aria-live="polite">{message}</p>}
    {enabled && inventory && <>
      <div className="overview"><div><strong>{inventory.certificates.length}</strong><span>Certificates created</span></div><div><strong>{inventory.certificates.filter(cert => Date.parse(cert.expiresAt) - clock <= 30 * 86_400_000).length}</strong><span>Expiring soon or expired</span></div><div><strong>{inventory.reminders.enabled ? 'On' : 'Off'}</strong><span>Expiry reminders</span></div></div>
      <details className="subdetails"><summary>Expiry reminders</summary><p>Show notices in the Home Assistant notification panel at 30, 14, 7 and 1 day before expiry and after expiry. Checks run at startup and hourly while this app is running. Turning reminders on can send a notice for an already-expiring certificate.</p><button type="button" disabled={busy} onClick={toggleReminders}>{inventory.reminders.enabled ? 'Turn off reminders' : 'Turn on reminders'}</button></details>
      {inventory.reminders.deliveryFailed && <p role="alert">A reminder could not be delivered. The app will retry; review certificate dates here.</p>}
      {!inventory.authority ? <>
        <div className="empty-state"><h3>Create your certificate authority</h3><p>This is the trusted issuer for your device certificates. Create it once, then add its public certificate to Pangolin before testing remote access.</p><details className="subdetails"><summary>How the signing key is stored</summary><p>The signing key is encrypted, with its unlock secret stored on the same system. Protect your Home Assistant host and backups: access to both files can expose the key.</p></details>
        <label className="check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I’m ready to create a certificate authority for my devices</label>
        <button disabled={busy || !confirmed} onClick={createAuthority}>Create certificate authority</button></div>
      </> : <>
        <details className="authority-details"><summary>Certificate authority</summary><p>Certificates work remotely after you add this authority to Pangolin’s trusted CAs.</p><p>Expires {new Date(inventory.authority.expiresAt).toLocaleDateString()} · {expiry(inventory.authority.expiresAt)}</p>
        <p className="fingerprint">SHA-256: {inventory.authority.fingerprint}</p>
        <a href="./api/ca/certificate" download="ha-pangolin-ca.pem">Download public CA certificate</a>
        <p>Keep a protected Home Assistant backup. Separate recovery exports and CA rotation are not available in this app.</p></details>
        <details className="add-device" open={adding || inventory.certificates.length === 0 || Boolean(replacing)} onToggle={event => setAdding(event.currentTarget.open)}>
          <summary>{replacing ? `Replace ${replacing.name}` : 'Add a device'}</summary>
          <form id="device-form" onSubmit={issue}>
          {replacing && <><p>The old certificate will remain valid. Install the replacement and test a new connection before confirming it below.</p><button type="button" disabled={busy} onClick={() => setReplacing(null)}>Cancel replacement</button></>}
          <label>Device name<input placeholder="e.g. Alex’s iPhone" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="off" /></label>
          <div className="form-grid"><label>Device type<select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="ios">iPhone or iPad</option><option value="macos">Mac</option><option value="windows">Windows PC</option><option value="android">Android phone or tablet</option><option value="other">Other device</option>
          </select></label>
          <label>Valid for (days)<input type="number" value={days} onChange={(e) => setDays(e.target.valueAsNumber)} min={1} max={365} required /></label></div>
          <button disabled={busy || Boolean(bundle && !downloaded)} type="submit">{replacing ? 'Create replacement' : 'Create device certificate'}</button>
        </form></details>
      </>}
      {bundle && <aside>
        <h3>Install on your device</h3>
        <p>Save this certificate’s password separately. The download expires at {new Date(bundle.expiresAt).toLocaleTimeString()} and can be used once. Download on the intended device, or transfer the file there securely.</p>
        <button onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide password' : 'Show package password'}</button>
        {showPassword && <p className="fingerprint"><code>{bundle.password}</code></p>}
        {['ios', 'ipados'].includes(bundle.certificate.platform) ?
          <button onClick={() => download('zip')} disabled={busy || downloaded}>{downloaded ? 'Certificate package downloaded' : 'Download certificate package (.zip)'}</button> :
          <button onClick={() => download('p12')} disabled={busy || downloaded}>{downloaded ? 'Certificate downloaded' : 'Download certificate (.p12)'}</button>}
        <DeviceInstallGuides profileDisplayName={bundle.profileDisplayName} />
        <p>Downloading a file does not install the certificate. Restarting the app or leaving this page can make an unused download unavailable.</p>
      </aside>}
      {inventory.certificates.length > 0 && <>
        <h3>Your certificates</h3>
        <div className="certificate-list">{inventory.certificates.map((cert) => <article className="certificate-card" key={cert.id}><div className="section-heading"><div><h4>{cert.name}</h4><p className="muted">{({ ios: 'iPhone or iPad', ipados: 'iPad', macos: 'Mac', windows: 'Windows PC', android: 'Android phone or tablet', other: 'Other device' } as Record<string, string>)[cert.platform] ?? cert.platform}</p></div><span className="badge">{expiry(cert.expiresAt)}</span></div>
            <p>Expires {new Date(cert.expiresAt).toLocaleDateString()} · {({ downloaded: 'Certificate downloaded', pending: 'Download pending', expired: 'Download unavailable', unavailable: 'Download unavailable' } as Record<string, string>)[cert.exportStatus] ?? 'Download unavailable'}</p>
            <details className="subdetails"><summary>Certificate details</summary><p className="fingerprint">Serial: {cert.serial}<br />SHA-256: {cert.fingerprint}</p></details>
            <div className="certificate-actions">{inventory.certificates.some((item) => item.replacesId === cert.id && item.replacementConfirmedAt) ? <p>Replacement tested. This older certificate remains valid until expiry; reminders suppressed.</p> : <button disabled={busy || Boolean(bundle && !downloaded)} onClick={() => replace(cert)}>Replace certificate</button>}
            {cert.replacesId && <><p>Replaces {inventory.certificates.find((item) => item.id === cert.replacesId)?.name ?? 'an older identity'}.</p>
            {cert.replacementConfirmedAt ? <p>Device test confirmed.</p> : <><p>Import this identity into the intended app, close and reopen it and test access over cellular or another external network. Avoid an existing session or local connection.</p>
            <label className="check"><input type="checkbox" checked={Boolean(tested[cert.id])} onChange={(event) => setTested({ ...tested, [cert.id]: event.target.checked })} /> I imported this replacement and tested access</label>
            <button disabled={busy || !tested[cert.id] || cert.exportStatus !== 'downloaded'} onClick={() => confirmReplacement(cert.id)}>Confirm replacement tested</button></>}</>}
            </div></article>)}</div>
        <p>This list records certificates you created. Installation is not checked automatically. Replacements do not invalidate earlier certificates.</p>
        <details><summary>Lost device or certificate removal</summary><p>Individual certificate revocation is not supported by the inspected Pangolin shared-CA setup. Replace certificate creates a new identity but does not block the old one. Removing an identity from your phone also cannot revoke a copied identity.</p><p>For a lost device, disabling the affected resource in Pangolin is broad emergency containment. Restoring access safely can require a new CA and re-enrollment of every trusted device. Never remove the final trusted CA to block access: Pangolin turns mTLS off when no CA remains. CA rotation and remote revocation controls are not implemented here.</p></details>
      </>}
    </>}
  </section>;
}
