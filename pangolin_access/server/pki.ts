import { zipSync } from 'fflate';
import { downloadFilename, identityFilename, profileFilename } from './download-names.js';
import { appleProfile, profileDisplayName } from './apple-profile.js';
import { DatabaseSync } from 'node:sqlite';
import { createHash, createPrivateKey, generateKeyPair, randomBytes, randomUUID, X509Certificate } from 'node:crypto';
import { promisify } from 'node:util';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { openssl, PkiError } from './openssl.js';

const generate = promisify(generateKeyPair);
const ttl = 5 * 60_000;
const day = 86_400_000;
const clientAuth = '1.3.6.1.5.5.7.3.2';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type Authority = { certificate: string; encrypted_key: string };
type Pending = { data: Buffer; expires: number; certificateId: string };
export type CertificateSummary = {
  id: string; name: string; platform: string; serial: string; fingerprint: string;
  issuedAt: string; expiresAt: string; exportStatus: string; replacesId: string | null; replacementConfirmedAt: string | null;
};

async function privateDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new PkiError('STORAGE_INVALID', 500);
  await chmod(path, 0o700);
}

export class PkiService {
  private busy = false;
  private closed = false;
  private pending = new Map<string, Pending>();
  private timer: NodeJS.Timeout;
  private constructor(private db: DatabaseSync, private unlock: string, private now: () => number, private temporaryRoot: string) {
    this.timer = setInterval(() => {
      try { this.expire(); }
      catch { for (const item of this.pending.values()) item.data.fill(0); this.pending.clear(); }
    }, 30_000);
    this.timer.unref();
  }

  static async open(directory: string, now: () => number = () => performance.timeOrigin + performance.now(), temporaryRoot = tmpdir()) {
    await privateDirectory(directory);
    const path = join(directory, 'state.sqlite');
    try { if (!(await lstat(path)).isFile()) throw new PkiError('STORAGE_INVALID', 500); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    const db = new DatabaseSync(path);
    try {
      await chmod(path, 0o600);
      db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
      const version = db.prepare('PRAGMA user_version').get()!.user_version;
      if (version !== 0 && version !== 1 && version !== 2) throw new PkiError('STORAGE_VERSION', 500);
      if (version === 0) db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE authority (id INTEGER PRIMARY KEY CHECK(id=1), certificate TEXT NOT NULL, encrypted_key TEXT NOT NULL) STRICT;
        CREATE TABLE certificates (id TEXT PRIMARY KEY, name TEXT NOT NULL, platform TEXT NOT NULL,
          serial TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL UNIQUE, issuedAt TEXT NOT NULL,
          expiresAt TEXT NOT NULL, certificate TEXT NOT NULL, exportStatus TEXT NOT NULL) STRICT;
        CREATE TABLE exports (token_hash TEXT PRIMARY KEY, certificate_id TEXT NOT NULL REFERENCES certificates(id),
          actor TEXT NOT NULL, expires REAL NOT NULL, consumed INTEGER NOT NULL DEFAULT 0) STRICT;
        CREATE TABLE audit (id INTEGER PRIMARY KEY, time TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, object_id TEXT NOT NULL) STRICT;
        PRAGMA user_version=1; COMMIT;`);
      if (version === 0 || version === 1) db.exec(`BEGIN IMMEDIATE;
        ALTER TABLE certificates ADD COLUMN replacesId TEXT REFERENCES certificates(id);
        ALTER TABLE certificates ADD COLUMN replacementConfirmedAt TEXT;
        CREATE TABLE reminders (object_id TEXT PRIMARY KEY, stage INTEGER, attemptedAt REAL NOT NULL) STRICT;
        PRAGMA user_version=2; COMMIT;`);
      // Buffers never survive restart; invalidate every old capability before serving.
      db.exec(`BEGIN IMMEDIATE; UPDATE certificates SET exportStatus='unavailable' WHERE exportStatus='pending';
        UPDATE exports SET consumed=1; COMMIT;`);
      const secretPath = join(directory, 'unlock.key');
      let unlock: string;
      try {
        const stat = await lstat(secretPath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new PkiError('STORAGE_INVALID', 500);
        unlock = await readFile(secretPath, 'utf8');
        if (!/^[a-f0-9]{64}$/.test(unlock)) throw new PkiError('STORAGE_INVALID', 500);
        await chmod(secretPath, 0o600);
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        if (db.prepare('SELECT id FROM authority').get()) throw new PkiError('UNLOCK_SECRET_MISSING', 500);
        unlock = randomBytes(32).toString('hex');
        await writeFile(secretPath, unlock, { flag: 'wx', mode: 0o600 });
      }
      const service = new PkiService(db, unlock, now, temporaryRoot);
      // A damaged or mismatched restored key must fail before any signing operation.
      const authority = service.authorityRow();
      try { if (authority) service.validateAuthority(authority); }
      catch (error) { clearInterval(service.timer); throw error; }
      return service;
    } catch (error) { db.close(); throw error; }
  }

  private authorityRow() { return this.db.prepare('SELECT certificate, encrypted_key FROM authority WHERE id=1').get() as Authority | undefined; }
  private validateAuthority(authority: Authority) {
    const cert = new X509Certificate(authority.certificate);
    const key = createPrivateKey({ key: authority.encrypted_key, passphrase: this.unlock });
    if (!cert.ca || !cert.verify(cert.publicKey) || !cert.checkPrivateKey(key)) throw new PkiError('STORAGE_INVALID', 500);
    return cert;
  }
  authority() {
    const row = this.authorityRow();
    if (!row) return null;
    const cert = new X509Certificate(row.certificate);
    return { fingerprint: cert.fingerprint256, serial: cert.serialNumber, issuedAt: new Date(cert.validFrom).toISOString(), expiresAt: new Date(cert.validTo).toISOString() };
  }
  publicCertificate() {
    const row = this.authorityRow();
    if (!row) throw new PkiError('CA_REQUIRED');
    return row.certificate;
  }
  inventory(): CertificateSummary[] {
    this.expire();
    return this.db.prepare('SELECT id, name, platform, serial, fingerprint, issuedAt, expiresAt, exportStatus, replacesId, replacementConfirmedAt FROM certificates ORDER BY rowid DESC LIMIT 100').all() as unknown as CertificateSummary[];
  }
  private audit(actor: string, action: string, id: string) {
    this.db.prepare('INSERT INTO audit(time,actor,action,object_id) VALUES(?,?,?,?)').run(new Date(this.now()).toISOString(), actor, action, id);
  }
  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy || this.closed) throw new PkiError('PKI_BUSY');
    this.busy = true;
    try { return await operation(); } finally { this.busy = false; }
  }
  private async temporary<T>(operation: (directory: string) => Promise<T>): Promise<T> {
    const directory = await mkdtemp(join(this.temporaryRoot, 'ha-pangolin-pki-'));
    await chmod(directory, 0o700);
    try { return await operation(directory); } finally { await rm(directory, { recursive: true, force: true }); }
  }
  private serial() { return '01' + randomBytes(16).toString('hex'); }
  private validateLeaf(pem: string, key: string, ca: X509Certificate) {
    const cert = new X509Certificate(pem);
    const time = this.now();
    if (cert.ca || !cert.verify(ca.publicKey) || !cert.checkPrivateKey(createPrivateKey(key)) ||
      !cert.keyUsage?.includes(clientAuth) || Date.parse(cert.validFrom) > time ||
      Date.parse(cert.validTo) <= time || Date.parse(cert.validTo) > Date.parse(ca.validTo)) {
      throw new PkiError('CERTIFICATE_INVALID', 500);
    }
    return cert;
  }

  async createAuthority(actor: string) {
    return this.exclusive(async () => {
      if (this.authorityRow()) throw new PkiError('CA_ALREADY_EXISTS');
      return this.temporary(async (directory) => {
        const keys = await generate('rsa', { modulusLength: 3072,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: this.unlock } });
        await writeFile(join(directory, 'key.pem'), keys.privateKey, { mode: 0o600 });
        await openssl(['req', '-new', '-x509', '-batch', '-key', join(directory, 'key.pem'), '-passin', 'fd:3',
          '-out', join(directory, 'ca.pem'), '-days', '1825', '-sha256', '-set_serial', '0x' + this.serial(),
          '-subj', '/CN=HA Pangolin Access ' + randomBytes(8).toString('hex'),
          '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0', '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
          '-addext', 'subjectKeyIdentifier=hash', '-addext', 'authorityKeyIdentifier=keyid:always'], [this.unlock]);
        const certificate = await readFile(join(directory, 'ca.pem'), 'utf8');
        this.validateAuthority({ certificate, encrypted_key: keys.privateKey });
        this.db.exec('BEGIN IMMEDIATE');
        try {
          this.db.prepare('INSERT INTO authority VALUES(1,?,?)').run(certificate, keys.privateKey);
          this.audit(actor, 'ca_created', '1'); this.db.exec('COMMIT');
        } catch (error) { this.db.exec('ROLLBACK'); throw error; }
        return this.authority();
      });
    });
  }

  async issue(input: { name: string; platform: string; lifetimeDays: number; replacesId?: string }, actor: string) {
    return this.exclusive(async () => {
      this.expire();
      if (this.pending.size >= 5) throw new PkiError('EXPORT_CAPACITY');
      if ((this.db.prepare('SELECT count(*) AS count FROM certificates').get()!.count as number) >= 100) throw new PkiError('INVENTORY_CAPACITY');
      if (!Number.isInteger(input.lifetimeDays) || input.lifetimeDays < 1 || input.lifetimeDays > 365 ||
        input.name.trim().length < 1 || input.name.length > 80 || /[\x00-\x1f\x7f]/.test(input.name) ||
        !['ios', 'ipados', 'macos', 'windows', 'android', 'other'].includes(input.platform)) throw new PkiError('INVALID_CERTIFICATE_INPUT', 400);
      if (input.replacesId && !this.inventory().some((item) => item.id === input.replacesId)) throw new PkiError('REPLACEMENT_INVALID', 400);
      const authority = this.authorityRow();
      if (!authority) throw new PkiError('CA_REQUIRED');
      const ca = this.validateAuthority(authority);
      if (Date.parse(ca.validFrom) > this.now() || this.now() + input.lifetimeDays * day > Date.parse(ca.validTo)) throw new PkiError('CA_LIFETIME');
      return this.temporary(async (directory) => {
        const id = randomUUID();
        const serial = this.serial();
        const password = randomBytes(24).toString('base64url');
        const keys = await generate('rsa', { modulusLength: 3072,
          publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
        const file = (name: string) => join(directory, name);
        await Promise.all([
          writeFile(file('leaf.key'), keys.privateKey, { mode: 0o600 }),
          writeFile(file('ca.key'), authority.encrypted_key, { mode: 0o600 }),
          writeFile(file('ca.pem'), authority.certificate, { mode: 0o600 }),
          writeFile(file('leaf.cnf'), `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=clientAuth\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\nsubjectAltName=URI:urn:uuid:${id}\n`, { mode: 0o600 }),
        ]);
        // The user-visible name never enters a subject, config file, path or command.
        await openssl(['req', '-new', '-batch', '-key', file('leaf.key'), '-subj', '/CN=' + id, '-out', file('leaf.csr')]);
        await openssl(['x509', '-req', '-in', file('leaf.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca.key'),
          '-passin', 'fd:3', '-set_serial', '0x' + serial, '-days', String(input.lifetimeDays), '-sha256',
          '-extfile', file('leaf.cnf'), '-out', file('leaf.pem')], [this.unlock]);
        const pem = await readFile(file('leaf.pem'), 'utf8');
        const cert = this.validateLeaf(pem, keys.privateKey, ca);
        await openssl(['verify', '-purpose', 'sslclient', '-CAfile', file('ca.pem'), file('leaf.pem')]);
        await openssl(['pkcs12', '-export', '-inkey', file('leaf.key'), '-in', file('leaf.pem'), '-certfile', file('ca.pem'),
          '-name', 'HA Pangolin ' + id, '-keypbe', 'AES-256-CBC', '-certpbe', 'AES-256-CBC', '-macalg', 'sha256',
          '-iter', '100000', '-passout', 'fd:3', '-out', file('client.p12')], [password]);
        // Read-back verifies the password, MAC and export format before recording success.
        await openssl(['pkcs12', '-in', file('client.p12'), '-passin', 'fd:3', '-noout'], [password]);
        const data = await readFile(file('client.p12'));
        const token = randomBytes(32).toString('hex');
        const tokenHash = hash(token);
        const expires = this.now() + ttl;
        this.db.exec('BEGIN IMMEDIATE');
        try {
          this.db.prepare('INSERT INTO certificates(id,name,platform,serial,fingerprint,issuedAt,expiresAt,certificate,exportStatus,replacesId) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, input.name, input.platform,
            cert.serialNumber, cert.fingerprint256, new Date(cert.validFrom).toISOString(), new Date(cert.validTo).toISOString(), pem, 'pending', input.replacesId ?? null);
          this.db.prepare('INSERT INTO exports(token_hash,certificate_id,actor,expires) VALUES(?,?,?,?)').run(tokenHash, id, actor, expires);
          this.audit(actor, 'certificate_issued', id); this.db.exec('COMMIT');
        } catch (error) { this.db.exec('ROLLBACK'); data.fill(0); throw error; }
        this.pending.set(tokenHash, { data, expires, certificateId: id });
        return { id, password, token, expiresAt: expires, zipFilename: downloadFilename(input.platform, 'zip'), profileDisplayName: profileDisplayName(input.name, new Date(cert.validTo).toISOString()), certificate: this.inventory().find((item) => item.id === id)! };
      });
    });
  }

  download(id: string, token: string, actor: string, format: 'p12' | 'zip' | 'mobileconfig' = 'p12'): Buffer {
    this.expire();
    if (!/^[a-f0-9]{64}$/.test(token)) throw new PkiError('EXPORT_UNAVAILABLE', 410);
    const key = hash(token);
    const pending = this.pending.get(key);
    if (!pending || pending.certificateId !== id) throw new PkiError('EXPORT_UNAVAILABLE', 410);
    const certificate = this.inventory().find((item) => item.id === id);
    if (!certificate) throw new PkiError('EXPORT_UNAVAILABLE', 410);
    let data: Buffer;
    if (format === 'p12') data = Buffer.from(pending.data);
    else {
      const profile = appleProfile(certificate, pending.data);
      try {
        data = format === 'mobileconfig' ? Buffer.from(profile) : Buffer.from(zipSync({
          [identityFilename]: pending.data,
          [profileFilename]: profile,
        }, { level: 0 }));
      } finally { profile.fill(0); }
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.db.prepare('UPDATE exports SET consumed=1 WHERE token_hash=? AND certificate_id=? AND actor=? AND expires>? AND consumed=0').run(key, id, actor, this.now());
      if (result.changes !== 1) throw new PkiError('EXPORT_UNAVAILABLE', 410);
      this.db.prepare("UPDATE certificates SET exportStatus='downloaded' WHERE id=?").run(id);
      this.audit(actor, 'package_downloaded', id); this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); data.fill(0); throw error; }
    pending.data.fill(0); this.pending.delete(key);
    return data;
  }
  confirmReplacement(id: string, actor: string) {
    const record = this.inventory().find((item) => item.id === id);
    if (!record?.replacesId || record.exportStatus !== 'downloaded') throw new PkiError('REPLACEMENT_INVALID', 400);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!record.replacementConfirmedAt) {
        this.db.prepare('UPDATE certificates SET replacementConfirmedAt=? WHERE id=?').run(new Date(this.now()).toISOString(), id);
        this.audit(actor, 'replacement_test_confirmed', id);
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return { confirmed: true };
  }
  reminderState(id: string) {
    return this.db.prepare('SELECT stage, attemptedAt FROM reminders WHERE object_id=?').get(id) as { stage: number | null; attemptedAt: number } | undefined;
  }
  recordReminderAttempt(id: string, time: number) {
    this.db.prepare('INSERT INTO reminders(object_id,stage,attemptedAt) VALUES(?,NULL,?) ON CONFLICT(object_id) DO UPDATE SET attemptedAt=excluded.attemptedAt').run(id, time);
  }
  recordReminderSent(id: string, stage: number) {
    this.db.prepare('UPDATE reminders SET stage=? WHERE object_id=?').run(stage, id);
  }
  private expire() {
    for (const [key, pending] of this.pending) if (pending.expires <= this.now()) {
      pending.data.fill(0); this.pending.delete(key);
      this.db.prepare("UPDATE certificates SET exportStatus='expired' WHERE id=?").run(pending.certificateId);
      this.db.prepare('UPDATE exports SET consumed=1 WHERE token_hash=?').run(key);
    }
  }
  async close() {
    if (this.closed) return;
    this.closed = true; clearInterval(this.timer);
    while (this.busy) await delay(20);
    for (const pending of this.pending.values()) pending.data.fill(0);
    this.pending.clear(); this.unlock = ''; this.db.close();
  }
}
