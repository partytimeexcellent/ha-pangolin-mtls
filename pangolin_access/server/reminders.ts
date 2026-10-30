import { createHash } from 'node:crypto';
import type { PkiService } from './pki.js';

export const reminderThresholds = [30, 14, 7, 1, 0] as const;
export function expiryStage(expiresAt: string, now: number): number | undefined {
  const days = (Date.parse(expiresAt) - now) / 86_400_000;
  if (!Number.isFinite(days)) return undefined;
  return [...reminderThresholds].reverse().find((threshold) => days <= threshold);
}
export type Notice = { title: string; message: string; notification_id: string };
export type SendNotice = (notice: Notice) => Promise<void>;

// The destination and service are fixed; the token never enters a URL or log.
export function homeAssistantNotifier(token: string, request: typeof fetch = fetch): SendNotice {
  if (!token) throw new Error('Notification credential unavailable.');
  return async (notice) => {
    const response = await request('http://supervisor/core/api/services/persistent_notification/create', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5_000),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(notice),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('Notification delivery failed.');
  };
}

export class ExpiryReminders {
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopped = false;
  private failed = false;
  constructor(private pki: PkiService, private send?: SendNotice, private now: () => number = Date.now) {}
  status() { return { enabled: Boolean(this.send), deliveryFailed: this.failed, thresholds: reminderThresholds }; }
  start() {
    if (!this.send || this.timer) return;
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, 60 * 60_000);
    this.timer.unref();
  }
  async configure(send?: SendNotice) {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.running;
    if (this.stopped) return;
    this.send = send;
    this.failed = false;
    this.start();
  }
  tick(): Promise<void> {
    if (this.stopped || !this.send) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.deliver().catch(() => { this.failed = true; }).finally(() => { this.running = undefined; });
    return this.running;
  }
  private async deliver() {
    const time = this.now();
    const certs = this.pki.inventory();
    const replaced = new Set(certs.filter((cert) => cert.replacementConfirmedAt).map((cert) => cert.replacesId));
    const authority = this.pki.authority();
    const objects = [
      ...(authority ? [{ id: `ca:${authority.fingerprint}`, name: 'Certificate authority', expiresAt: authority.expiresAt, ca: true }] : []),
      ...certs.filter((cert) => !replaced.has(cert.id)).map((cert) => ({ ...cert, ca: false })),
    ];
    let failed = false;
    for (const object of objects) {
      if (this.stopped) break;
      const stage = expiryStage(object.expiresAt, time);
      if (stage === undefined) continue;
      const state = this.pki.reminderState(object.id);
      if (state && (time - state.attemptedAt < 60 * 60_000 || (state.stage !== null && state.stage <= stage))) continue;
      this.pki.recordReminderAttempt(object.id, time);
      // Display names cannot introduce Markdown links or instructions in HA notifications.
      const label = object.name.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 80) || 'Device';
      try {
        await this.send!({ title: 'HA Pangolin Access: certificate expiry',
          message: `${label}: ${stage === 0 ? 'expired' : `expires within ${stage} day(s)`}. Open HA Pangolin Access to ${object.ca ? 'plan CA replacement and re-enroll devices' : 'issue and test a replacement'}. This reminder does not change access.`,
          notification_id: 'ha_pangolin_expiry_' + createHash('sha256').update(object.id).digest('hex'),
        });
        this.pki.recordReminderSent(object.id, stage);
      } catch { failed = true; }
    }
    this.failed = failed;
  }
  async close() { this.stopped = true; clearInterval(this.timer); await this.running; }
}
