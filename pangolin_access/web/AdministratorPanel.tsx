import { useState } from 'react';
import { z } from 'zod';
import { protectedPost } from './pki-api';
const schema = z.object({ users: z.array(z.object({ id: z.string(), name: z.string() })), ids: z.array(z.string()), configuredIds: z.array(z.string()), revision: z.string().uuid() });
export function AdministratorPanel() {
  const [data, setData] = useState<z.output<typeof schema> | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function load() {
    setBusy(true);
    try {
      const next = schema.parse(await (await protectedPost('./api/administrators/list', {})).json());
      setData(next); setIds(next.ids.filter(id => next.users.some(u => u.id === id))); setMessage('Choose additional app administrators, then save.');
    } catch (error) { setMessage(error instanceof Error && /\([A-Z_]+, HTTP \d+\)$/.test(error.message) ? error.message : 'Could not load administrator names. Check your access and try again.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!data) return;
    setBusy(true);
    try {
      await protectedPost('./api/administrators/save', { ids, revision: data.revision });
      setData(null); setMessage('Administrator selection saved.');
    } catch (error) { setMessage(error instanceof Error && /\([A-Z_]+, HTTP \d+\)$/.test(error.message) ? error.message : 'Could not save administrator selection. Reload names before retrying.'); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="administrators-title">
    <h2 id="administrators-title">App administrators</h2>
    <p>Choose active Home Assistant administrators who may manage this app. Configured IDs remain recovery access. This does not select certificate recipients.</p>
    <button disabled={busy} onClick={load}>Load administrator names</button>
    {data && <fieldset disabled={busy}><legend>Additional administrators</legend>
      {data.users.map(user => <label key={user.id}>
        <input type="checkbox" checked={data.configuredIds.includes(user.id) || ids.includes(user.id)} disabled={data.configuredIds.includes(user.id)}
          onChange={event => setIds(event.target.checked ? [...ids, user.id] : ids.filter(id => id !== user.id))} />
        {user.name} <small>({user.id.slice(0, 8)}){data.configuredIds.includes(user.id) ? ' · configured recovery access' : ''}</small>
      </label>)}
      {data.ids.some(id => !data.users.some(u => u.id === id)) && <p>Saving removes accounts that are no longer eligible.</p>}
      <button onClick={save}>Save administrators</button>
    </fieldset>}
    <p role="status">{message}</p>
  </section>;
}
