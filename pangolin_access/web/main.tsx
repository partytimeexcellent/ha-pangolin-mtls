import { AdministratorPanel } from './AdministratorPanel';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { checked } from './pki-api';
import { createRoot } from 'react-dom/client';
import { checkAccess } from './access-check';
import { CertificatePanel } from './CertificatePanel';
import { PangolinPanel } from './PangolinPanel';
import './style.css';

function App() {
  const [advanced, setAdvanced] = useState(false);
  const [externalUrl, setExternalUrl] = useState<{ homeAssistantUrl: string; homeAssistantUrlSource: string } | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const response = await checked(await fetch('./api/status', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(10_000) }));
        setExternalUrl(z.object({ homeAssistantUrl: z.string().url(), homeAssistantUrlSource: z.enum(['configuration', 'home-assistant']) }).parse(await response.json()));
      } catch { /* Existing access-check flow reports authorization failures safely. */ }
    })();
  }, []);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('Not checked');
  async function check() {
    setBusy(true);
    setResult('Checking…');
    try {
      setResult(await checkAccess());
    } finally { setBusy(false); }
  }
  return <main>
    <p className="eyebrow">HOME ASSISTANT · DEVELOPMENT</p>
    <h1>Pangolin Access</h1>
    <p className="intro">Secure access starts with a trusted administrator.</p>
    <section aria-labelledby="prototype-title">
      <span className="badge">Phase 2 · Certificate prototype</span>
      <h2 id="prototype-title">Verify administration access</h2>
      {externalUrl && <p>Home Assistant External URL: <span className="fingerprint">{externalUrl.homeAssistantUrl}</span> ({externalUrl.homeAssistantUrlSource === 'home-assistant' ? 'from Home Assistant settings' : 'app configuration override'}). Edit the app Configuration if you open this app at another address.</p>}
      <p>Check your Home Assistant identity and request protection before managing certificates.</p>
      <button onClick={check} disabled={busy}>{busy ? 'Checking…' : 'Check my access'}</button>
      <p role="status" aria-live="polite">{result}</p>
    </section>
    <CertificatePanel />
    <AdministratorPanel />
    <details className="advanced" onToggle={(event) => setAdvanced(event.currentTarget.open)}>
      <summary>Advanced: Pangolin setup and diagnostics</summary>
      {advanced && <PangolinPanel />}
    </details>
    <p className="footnote">Home Assistant login remains required. Individual certificate revocation is unavailable with the current Pangolin shared-CA setup.</p>
    <p className="footnote">Build {import.meta.env.VITE_APP_VERSION}</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
