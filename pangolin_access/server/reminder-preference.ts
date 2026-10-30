import { randomUUID } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';
import { z } from 'zod';

const stateSchema = z.strictObject({ version: z.literal(1), enabled: z.boolean() });
type State = z.output<typeof stateSchema>;

export class ReminderPreference {
  private state: State;
  private busy = false;
  private constructor(private file: string, enabled: boolean) {
    this.state = { version: 1, enabled };
  }
  static async open(file: string, legacyEnabled = false) {
    const preference = new ReminderPreference(file, legacyEnabled);
    try {
      const handle = await open(file, 'r');
      try {
        if ((await handle.stat()).size > 256) throw new Error('Invalid reminder preference.');
        preference.state = stateSchema.parse(JSON.parse(await handle.readFile('utf8')));
      } finally { await handle.close(); }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      await preference.write(preference.state);
    }
    return preference;
  }
  enabled() { return this.state.enabled; }
  async setEnabled(enabled: boolean) {
    if (this.busy) throw new Error('Reminder preference update already running.');
    this.busy = true;
    try { await this.write({ version: 1, enabled }); }
    finally { this.busy = false; }
  }
  private async write(next: State) {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(next)); await handle.sync(); }
      finally { await handle.close(); }
      await rename(temporary, this.file);
      this.state = next;
    } finally { await unlink(temporary).catch(() => {}); }
  }
}
