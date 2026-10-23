import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';
import './style.css';

const sessionSchema = z.object({ sessionId: z.string().regex(/^[a-f0-9]{64}$/), csrfToken: z.string().regex(/^[a-f0-9]{64}$/) });
const resultSchema = z.object({ authorized: z.literal(true), signingEnabled: z.literal(false) });

function App() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('Not checked');
  async function check() {
    setBusy(true);
    setResult('Checking…');
    try {
      const sessionResponse = await fetch('./api/session', { cache: 'no-store', credentials: 'same-origin' });
      if (!sessionResponse.ok) throw new Error();
      const session = sessionSchema.parse(await sessionResponse.json());
      const response = await fetch('./api/authorization-check', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'content-type': 'application/json', 'x-access-session': session.sessionId, 'x-csrf-token': session.csrfToken },
        body: '{}',
      });
      if (!response.ok) throw new Error();
      resultSchema.parse(await response.json());
      setResult('Authorization check passed. Certificate signing remains disabled.');
    } catch {
      setResult('Check failed. Confirm your allowed user ID, Home Assistant origin and ingress access.');
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
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
