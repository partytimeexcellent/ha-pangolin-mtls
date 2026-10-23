import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { checkAccess } from './access-check';
import './style.css';

function App() {
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
      <span className="badge">Phase 2 · Ingress prototype</span>
      <h2 id="prototype-title">Verify administration access</h2>
      <p>This first build checks your Home Assistant identity and protects requests against cross-site actions.</p>
      <button onClick={check} disabled={busy}>{busy ? 'Checking…' : 'Check my access'}</button>
      <p role="status" aria-live="polite">{result}</p>
    </section>
    <aside><h2>Certificates are not enabled yet</h2>
      <p>This build cannot create credentials or change Pangolin. Real Home Assistant ingress validation comes before certificate issuance.</p>
    </aside>
    <p className="footnote">Home Assistant login remains required. Device retirement alone does not revoke a certificate.</p>
    <p className="footnote">Build {import.meta.env.VITE_APP_VERSION}</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
