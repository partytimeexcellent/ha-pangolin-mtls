import { spawn } from 'node:child_process';
import type { Writable } from 'node:stream';

export class PkiError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 409) { super(code); }
}

// Only server-constructed arguments are permitted. Passwords use anonymous pipes,
// never command arguments, the environment, stderr, or a shell.
export function openssl(args: string[], secrets: string[] = []): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('openssl', args, {
      shell: false, timeout: 30_000, killSignal: 'SIGKILL',
      env: { PATH: process.env.PATH, LANG: 'C' },
      stdio: ['ignore', 'pipe', 'pipe', ...secrets.map(() => 'pipe' as const)],
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let overflow = false;
    child.stdout!.on('data', (data: Buffer) => {
      size += data.length;
      if (size > 1_048_576) { overflow = true; child.kill('SIGKILL'); }
      else chunks.push(data);
    });
    // Drain stderr to prevent deadlock, but never retain or expose raw crypto errors.
    child.stderr!.on('data', () => {});
    secrets.forEach((secret, index) => {
      const pipe = child.stdio[index + 3] as Writable;
      pipe.on('error', () => {});
      pipe.end(secret + '\n');
    });
    child.on('error', () => reject(new PkiError('CRYPTO_FAILED', 500)));
    child.on('close', (code) => {
      if (code !== 0 || overflow) reject(new PkiError('CRYPTO_FAILED', 500));
      else resolve(Buffer.concat(chunks));
    });
  });
}
