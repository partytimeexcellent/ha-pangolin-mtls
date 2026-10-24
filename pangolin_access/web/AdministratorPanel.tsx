import { useState } from 'react';
import { z } from 'zod';
import { protectedPost } from './pki-api';
const schema = z.object({ users: z.array(z.object({ id: z.string(), name: z.string() })), ids: z.array(z.string()), configuredIds: z.array(z.string()), currentUserId: z.string(), revision: z.string().uuid() });
export function AdministratorPanel({ onSaved }: { onSaved?: () => void }) {
  const [data, setData] = useState<z.output<typeof schema> | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function load() {
    setBusy(true);
    try {
      const next = schema.parse(await (await protectedPost('./api/administrators/list', {})).json());
      setData(next); setIds(next.ids.length || next.configuredIds.length ? next.ids.filter(id => next.users.some(u => u.id === id)) : [next.currentUserId]); setMessage('Keep your account selected and choose anyone else who should manage certificates.');
    } catch (error) { setMessage(error instanceof Error && /\([A-Z_]+, HTTP \d+\)$/.test(error.message) ? error.message : 'Could not load administrator names. Check your access and try again.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!data) return;
    setBusy(true);
    try {
      await protectedPost('./api/administrators/save', { ids, revision: data.revision });
      setData(null); setMessage('Administrator selection saved.'); onSaved?.();
    } catch (error) { setMessage(error instanceof Error && /\([A-Z_]+, HTTP \d+\)$/.test(error.message) ? error.message : 'Could not save administrator selection. Reload names before retrying.'); }
    finally { setBusy(false); }
  }
  return <div aria-labelledby="administrators-title">
    <p className="step-label">2 · Choose administrators</p><h3 id="administrators-title">App administrators</h3>
    <p>Selected administrators can create and download device certificates. This list controls app access; it does not assign certificates to people.</p>
    <button disabled={busy} onClick={load}>Choose administrators</button>
    {data && <fieldset disabled={busy}><legend>App administrators</legend>
      {data.users.map(user => <label className="check" key={user.id}>
        <input type="checkbox" checked={data.configuredIds.includes(user.id) || ids.includes(user.id)} disabled={data.configuredIds.includes(user.id)}
          onChange={event => setIds(event.target.checked ? [...ids, user.id] : ids.filter(id => id !== user.id))} />
        <span>{user.name}{user.id === data.currentUserId && <small className="account-note">Your account</small>}{data.users.filter(candidate => candidate.name === user.name).length > 1 && <small className="account-note">Account {user.id.slice(0, 8)}</small>}{data.configuredIds.includes(user.id) && <small className="account-note">Recovery access · managed in Configuration</small>}</span>
      </label>)}
      {data.ids.some(id => !data.users.some(u => u.id === id)) && <p>Saving removes accounts that are no longer eligible.</p>}
      <button onClick={save}>Save administrators</button>
    </fieldset>}
    <p role="status">{message}</p>
  </div>;
}
