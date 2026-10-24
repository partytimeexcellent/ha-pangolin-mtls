import { AdministratorPanel } from './AdministratorPanel';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { checked, protectedPost } from './pki-api';
import { createRoot } from 'react-dom/client';
import { checkAccess } from './access-check';
import { CertificatePanel } from './CertificatePanel';
import { PangolinPanel } from './PangolinPanel';
import './style.css';

function App() {
  const [setupComplete, setSetupComplete] = useState(false);
  const [ready, setReady] = useState(false);
  const [setupOpen, setSetupOpen] = useState(true);
  const [verified, setVerified] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [externalUrl, setExternalUrl] = useState<{ homeAssistantUrl: string; homeAssistantUrlSource: string } | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const response = await checked(await fetch('./api/status', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(10_000) }));
        const administration = z.object({ setupComplete: z.boolean() }).parse(await (await checked(await fetch('./api/administration-status', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(10_000) }))).json());
        setReady(administration.setupComplete); setSetupComplete(administration.setupComplete); setSetupOpen(!administration.setupComplete);
        setExternalUrl(z.object({ homeAssistantUrl: z.string().url(), homeAssistantUrlSource: z.enum(['configuration', 'home-assistant']) }).parse(await response.json()));
      } catch { /* Existing access-check flow reports authorization failures safely. */ }
    })();
  }, []);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('Confirm your account to continue.');
  async function check() {
    setBusy(true);
    setResult('Checking…');
    try {
      const message = await checkAccess();
      setResult(message.startsWith('Authorization check passed.') ? 'Your account has access. Choose who can manage this app below.' : message); setVerified(message.startsWith('Authorization check passed.'));
    } finally { setBusy(false); }
  }
  async function finish() {
    setBusy(true);
    try {
      await protectedPost('./api/authorization-check', {});
      await protectedPost('./api/administrators/finish', {});
      setReady(true); setSetupComplete(true); setSetupOpen(false); setResult('Administration setup complete.');
    } catch { setResult('Could not finish setup. Save your administrator selection and check access again.'); }
    finally { setBusy(false); }
  }
  return <main>
    <header className="page-header"><p className="eyebrow">HOME ASSISTANT</p>
    <h1>Pangolin Access</h1>
    <p className="intro">Create and manage certificates for your devices.</p></header>
    <details className="administration" open={setupOpen} onToggle={event => setSetupOpen(event.currentTarget.open)}>
      <summary>{setupComplete ? 'App access · Set up' : 'Set up app access'}</summary>
      <h2>Who can manage this app?</h2>
      <p>You must be signed in as an active Home Assistant administrator to set up this app. We’ll find your account automatically. No user ID copying is needed.</p>
      {externalUrl && <details className="subdetails"><summary>Home Assistant address</summary><p>External URL: <span className="fingerprint">{externalUrl.homeAssistantUrl}</span> ({externalUrl.homeAssistantUrlSource === 'home-assistant' ? 'from Home Assistant settings' : 'app configuration override'}). Change Home Assistant URL override in Configuration if you use a different address.</p></details>}
      <p className="step-label">1 · Confirm your access</p>
      <button onClick={check} disabled={busy}>{busy ? 'Checking…' : 'Check my access'}</button>
      <p role="status" aria-live="polite">{result}</p>
      {verified && <AdministratorPanel onSaved={() => { setSetupComplete(false); setResult('Selection saved. Select Finish setup to confirm access and continue.'); }} />}
      {verified && <button onClick={finish} disabled={busy}>Finish setup</button>}
    </details>
    {ready ? <CertificatePanel /> : <div className="empty-state"><h2>Your devices will appear here</h2><p>Finish setting up app access to start creating device certificates.</p></div>}
    <details className="advanced" onToggle={(event) => setAdvanced(event.currentTarget.open)}>
      <summary>Pangolin connection checks</summary>
      {advanced && <PangolinPanel />}
    </details>
    <footer className="page-footer"><p>Home Assistant sign-in is always required.</p><p>Version {import.meta.env.VITE_APP_VERSION} · Early access</p></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
