import { AdministratorPanel } from './AdministratorPanel';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { checked, protectedPost } from './pki-api';
import { createRoot } from 'react-dom/client';
import { checkAccess } from './access-check';
import { CertificatePanel } from './CertificatePanel';
import { PangolinPanel } from './PangolinPanel';
import './style.css';

const pangolinSetupKey = 'ha-pangolin-ca-installed';
function savedPangolinSetup() {
  try { return localStorage.getItem(pangolinSetupKey) === 'true'; }
  catch { return false; }
}

function App() {
  const [ready, setReady] = useState(false);
  const [homeOpen, setHomeOpen] = useState(true);
  const [pangolinOpen, setPangolinOpen] = useState(false);
  const [pangolinComplete, setPangolinComplete] = useState(savedPangolinSetup);
  const [adminSaved, setAdminSaved] = useState(false);
  const [externalUrl, setExternalUrl] = useState<{ homeAssistantUrl: string; homeAssistantUrlSource: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  useEffect(() => {
    void (async () => {
      try {
        const response = await checked(await fetch('./api/status', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(10_000) }));
        const administration = z.object({ setupComplete: z.boolean() }).parse(await (await checked(await fetch('./api/administration-status', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(10_000) }))).json());
        setReady(administration.setupComplete);
        setHomeOpen(!administration.setupComplete);
        setPangolinOpen(administration.setupComplete && !savedPangolinSetup());
        setExternalUrl(z.object({ homeAssistantUrl: z.string().url(), homeAssistantUrlSource: z.enum(['configuration', 'home-assistant']) }).parse(await response.json()));
      } catch { /* Access failures are reported by the access check. */ }
    })();
  }, []);
  async function check() {
    setBusy(true); setResult('Checking access…');
    try {
      const message = await checkAccess();
      if (!message.startsWith('Authorization check passed.')) { setResult(message); return; }
      if (!ready) {
        await protectedPost('./api/administrators/finish', {});
        setReady(true); setHomeOpen(false); setPangolinOpen(true);
        setResult('Home Assistant setup complete. Continue with Pangolin setup.');
      } else setResult('Access confirmed.');
    } catch { setResult('Could not finish setup. Save your administrator selection and check access again.'); }
    finally { setBusy(false); }
  }
  function pangolinInstalled() {
    try { localStorage.setItem(pangolinSetupKey, 'true'); } catch { /* Collapse for this page even if storage is unavailable. */ }
    setPangolinComplete(true); setPangolinOpen(false);
  }
  return <main>
    <header className="page-header"><h1>Pangolin Access</h1></header>
    <details className="administration" open={homeOpen} onToggle={event => setHomeOpen(event.currentTarget.open)}>
      <summary>Home Assistant setup{ready ? ' · Complete' : ''}</summary>
      <p className="step-label">URL</p>
      {externalUrl ? <p><strong>{externalUrl.homeAssistantUrl}</strong> · {externalUrl.homeAssistantUrlSource === 'home-assistant' ? 'Home Assistant external URL' : 'App configuration override'}. Change the Home Assistant URL override in Configuration if this is not the address you use to open the app.</p>
        : <p>Set an HTTPS external URL in Home Assistant, or enter the Home Assistant URL override in this app’s Configuration.</p>}
      <AdministratorPanel onSaved={() => { setAdminSaved(true); setResult('Administrator selection saved. Check access to finish.'); }} />
      <p className="step-label">Check access</p>
      <button onClick={check} disabled={busy || (!ready && !adminSaved)}>{busy ? 'Checking…' : 'Check access'}</button>
      {!ready && !adminSaved && <p>Save your administrator selection first.</p>}
      <p role="status" aria-live="polite">{result}</p>
    </details>
    <details className="administration" open={pangolinOpen} onToggle={event => setPangolinOpen(event.currentTarget.open)}>
      <summary>Pangolin setup{pangolinComplete ? ' · Completed in this browser' : ''}</summary>
      <PangolinPanel ready={ready} onInstalled={pangolinInstalled} />
    </details>
    {pangolinComplete && <p className="status-message" role="status">This browser recorded a successful CA installation. Verify the resource’s current trust in Pangolin, enable client certificate (mTLS), then test access with and without a device certificate.</p>}
    {ready ? <CertificatePanel /> : <div className="empty-state"><h2>Device certificates</h2><p>Finish Home Assistant setup to create certificates.</p></div>}
    <footer className="page-footer"><p>Home Assistant sign-in is always required.</p><p>Version {import.meta.env.VITE_APP_VERSION} · Early access</p></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
