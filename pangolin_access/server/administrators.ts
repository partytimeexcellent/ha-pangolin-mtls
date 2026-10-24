import { open, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const id = z.string().regex(/^[a-f0-9]{32}$/);
export const selectionSchema = z.strictObject({ ids: z.array(id).max(20), revision: z.string().uuid() });
const stateSchema = selectionSchema.extend({ version: z.literal(1) });
export class AdministratorError extends Error {
  constructor(public code: string, public statusCode = 503) { super(code); }
}
export function eligibleUsers(value: unknown) {
  const users = z.array(z.object({ id, name: z.string().max(256).nullable(), is_owner: z.boolean(),
    is_active: z.boolean(), system_generated: z.boolean(), group_ids: z.array(z.string().max(100)).max(100) })).max(1000).parse(value);
  if (new Set(users.map(u => u.id)).size !== users.length) throw new AdministratorError('ADMIN_DIRECTORY_UNAVAILABLE');
  return users.filter(u => u.is_active && !u.system_generated && (u.is_owner || u.group_ids.includes('system-admin')))
    .map(u => ({ id: u.id, name: u.name || 'Unnamed administrator' }));
}
export type UserDirectory = () => Promise<ReturnType<typeof eligibleUsers>>;

// Fixed read-only Supervisor proxy. No browser credential or destination input.
export function coreUserDirectory(token: string, connect = () => new WebSocket('ws://supervisor/core/websocket')): UserDirectory {
  let active: Promise<ReturnType<typeof eligibleUsers>> | undefined;
  const read = () => new Promise<ReturnType<typeof eligibleUsers>>((resolve, reject) => {
    const ws = connect();
    let phase = 0;
    let done = false;
    const finish = (users?: ReturnType<typeof eligibleUsers>) => {
      if (done) return;
      done = true; clearTimeout(timer); ws.close();
      if (users) resolve(users); else reject(new AdministratorError('ADMIN_DIRECTORY_UNAVAILABLE'));
    };
    const timer = setTimeout(() => finish(), 5000);
    ws.onerror = () => finish(); ws.onclose = () => finish();
    ws.onmessage = event => {
      try {
        if (typeof event.data !== 'string' || Buffer.byteLength(event.data) > 256 * 1024) return finish();
        const message = JSON.parse(event.data);
        if (phase === 0 && message.type === 'auth_required') {
          phase = 1; ws.send(JSON.stringify({ type: 'auth', access_token: token }));
        } else if (phase === 1 && message.type === 'auth_ok') {
          phase = 2; ws.send(JSON.stringify({ id: 1, type: 'config/auth/list' }));
        } else if (phase === 2 && message.type === 'result' && message.id === 1 && message.success === true) {
          finish(eligibleUsers(message.result));
        } else finish();
      } catch { finish(); }
    };
  });
  return () => {
    active ??= read().finally(() => { active = undefined; });
    return active;
  };
}

export class Administrators {
  private state = { version: 1 as const, ids: [] as string[], revision: randomUUID() as string };
  private busy = false;
  private constructor(private file: string, private directory: UserDirectory) {}
  static async open(file: string, directory: UserDirectory) {
    const service = new Administrators(file, directory);
    try {
      const handle = await open(file, 'r');
      try {
        if ((await handle.stat()).size > 8192) throw new Error('Invalid administrator state');
        service.state = stateSchema.parse(JSON.parse(await handle.readFile('utf8')));
      } finally { await handle.close(); }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    return service;
  }
  has(user: string) { return this.state.ids.includes(user); }
  async users() {
    try { return await this.directory(); }
    catch { throw new AdministratorError('ADMIN_DIRECTORY_UNAVAILABLE'); }
  }
  async authorized(user: string) { return this.has(user) && (await this.users()).some(u => u.id === user); }
  async view(actor: string, configured: string[]) {
    const users = await this.users();
    if (!users.some(u => u.id === actor)) throw new AdministratorError('ADMIN_PRIVILEGE_REQUIRED', 403);
    return { users, ids: this.state.ids, revision: this.state.revision, configuredIds: configured };
  }
  async save(actor: string, configured: string[], input: z.output<typeof selectionSchema>) {
    if (this.busy || input.revision !== this.state.revision) throw new AdministratorError('ADMIN_SELECTION_CHANGED', 409);
    this.busy = true;
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const view = await this.view(actor, configured);
      if (input.ids.some(id => configured.includes(id) || !view.users.some(u => u.id === id)) ||
          new Set(input.ids).size !== input.ids.length || (!configured.includes(actor) && !input.ids.includes(actor))) {
        throw new AdministratorError('ADMIN_SELECTION_INVALID', 400);
      }
      const next = { version: 1 as const, ids: input.ids, revision: randomUUID() };
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(next)); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, this.file);
      this.state = next;
      return { saved: true };
    } finally { this.busy = false; await unlink(temporary).catch(() => {}); }
  }
}
