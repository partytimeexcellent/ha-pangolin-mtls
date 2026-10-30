import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { z } from 'zod';

export class PangolinError extends Error {
  constructor(public code: string, public statusCode = 502, public stage?: PangolinStage) { super(code); }
}
export type PangolinStage = 'specification' | 'organization' | 'sites' | 'domains' | 'resources' |
  'resource' | 'policies' | 'targets' | 'trust' | 'hostname' | 'recheck';

export const apiUrlSchema = z.string().max(300).transform((value, ctx) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        !['/v1', '/v1/'].includes(url.pathname) || isIP(url.hostname.replace(/^\[|\]$/g, '')) ||
        !url.hostname.includes('.') || url.hostname.endsWith('.')) throw new Error();
    return `${url.origin}/v1`;
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Use the public HTTPS integration API URL ending in /v1.' });
    return z.NEVER;
  }
});

const denied = new BlockList();
for (const [ip, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as const) denied.addSubnet(ip, bits, 'ipv4');
denied.addSubnet('192.88.99.0', 24, 'ipv4');
denied.addSubnet('2001::', 23, 'ipv6');
denied.addSubnet('2001:db8::', 32, 'ipv6');
denied.addSubnet('2002::', 16, 'ipv6');
denied.addSubnet('3fff::', 20, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
export function publicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !denied.check(address, 'ipv4') : family === 6 &&
    globalV6.check(address, 'ipv6') && !denied.check(address, 'ipv6');
}

export type ReadJson = (path: string, authenticated: boolean) => Promise<unknown>;
export type WriteJson = (path: string, body: unknown) => Promise<unknown>;

// Resolve once, reject mixed/private answers, and pin the socket while retaining TLS hostname verification.
export async function publicReader(base: string, key: string, signal: AbortSignal): Promise<ReadJson> {
  const pinned = await publicEndpoint(base, signal);
  return (path, authenticated) => readPinnedJson(new URL(`/v1${path}`, pinned.url.origin), pinned.address, key, authenticated, signal);
}

async function publicEndpoint(base: string, signal: AbortSignal) {
  const url = new URL(apiUrlSchema.parse(base));
  let addresses;
  try { addresses = await Promise.race([
    lookup(url.hostname, { all: true }),
    new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new PangolinError('PANGOLIN_NETWORK')), { once: true })),
  ]); } catch { throw new PangolinError('PANGOLIN_NETWORK'); }
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) throw new PangolinError('PANGOLIN_ADDRESS_BLOCKED', 400);
  return { url, address: addresses[0]! };
}

export async function publicWriter(base: string, key: string, signal: AbortSignal): Promise<WriteJson> {
  const pinned = await publicEndpoint(base, signal);
  return (path, body) => requestPinnedJson(new URL(`/v1${path}`, pinned.url.origin), pinned.address, key, signal, 'PUT', body);
}

export function readPinnedJson(url: URL, pinned: { address: string; family: number }, key: string, authenticated: boolean, signal: AbortSignal, send: typeof request = request): Promise<unknown> {
  return requestPinnedJson(url, pinned, authenticated ? key : '', signal, 'GET', undefined, send);
}

function requestPinnedJson(url: URL, pinned: { address: string; family: number }, key: string, signal: AbortSignal,
  method: 'GET' | 'PUT', body?: unknown, send: typeof request = request): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const fail = (code: string) => reject(new PangolinError(code));
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = send(url, {
      method, signal, agent: false, family: pinned.family,
      headers: { accept: 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}) },
      lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
    }, (res) => {
      const status = res.statusCode;
      if (status !== 200 && status !== 201) {
        res.destroy();
        return fail(status === 401 ? 'PANGOLIN_AUTH_FAILED' : status === 403 ? 'PANGOLIN_PERMISSION_DENIED' :
          status === 404 ? 'PANGOLIN_NOT_FOUND' : status && status >= 300 && status < 400 ? 'PANGOLIN_REDIRECT' : 'PANGOLIN_UPSTREAM');
      }
      if (!/^application\/json(?:\s*;|$)/i.test(res.headers['content-type'] ?? '')) { res.destroy(); return fail('PANGOLIN_CONTRACT'); }
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) { res.destroy(); fail('PANGOLIN_RESPONSE_LIMIT'); }
        else chunks.push(chunk);
      });
      res.on('error', () => fail('PANGOLIN_NETWORK'));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { fail('PANGOLIN_CONTRACT'); }
      });
    });
    req.setTimeout(5_000, () => req.destroy());
    req.on('error', () => fail('PANGOLIN_NETWORK'));
    req.end(payload);
  });
}

const text = z.string().max(300);
const id = z.number().int().nonnegative();
const pagination = z.object({ total: id });
function envelope<T extends z.ZodType>(schema: T) {
  return z.object({ success: z.literal(true), error: z.literal(false), data: schema });
}
const org = envelope(z.object({ org: z.object({ orgId: text, name: text }) }));
const sites = envelope(z.object({ sites: z.array(z.object({ siteId: id, niceId: text, name: text, online: z.boolean().optional() })).max(20), pagination }));
const domains = envelope(z.object({ domains: z.array(z.object({ domainId: text, baseDomain: text, verified: z.boolean() })).max(20), pagination }));
const resources = envelope(z.object({ resources: z.array(z.object({ resourceId: id, niceId: text, name: text, fullDomain: text.nullable(), ssl: z.boolean(), mtls: z.boolean(), enabled: z.boolean() })).max(20), pagination }));
const paths = ['/org/{orgId}', '/org/{orgId}/sites', '/org/{orgId}/domains', '/org/{orgId}/public-resources'];
const mtlsRoutes = [
  ['/public-resource/{resourceId}', 'get'],
  ['/public-resource/{resourceId}/policies', 'get'],
  ['/public-resource/{resourceId}/targets', 'get'],
  ['/public-resource-policy/{resourcePolicyId}/mtls/certificates', 'get'],
  ['/public-resource-policy/{resourcePolicyId}/mtls/certificate', 'put'],
] as const;

export async function inspectPangolin(read: ReadJson, orgId: string) {
  let stage: PangolinStage = 'specification';
  try {
    const spec = z.object({ openapi: z.string().regex(/^3\./), paths: z.record(z.string(), z.record(z.string(), z.unknown())) }).parse(await read('/openapi.json', false));
    if (paths.some(path => !spec.paths[path]?.get)) throw new PangolinError('PANGOLIN_CONTRACT');
    const prefix = `/org/${encodeURIComponent(orgId)}`;
    stage = 'organization';
    const organization = org.parse(await read(prefix, true)).data.org;
    if (organization.orgId !== orgId) throw new PangolinError('PANGOLIN_CONTRACT');
    stage = 'sites';
    const siteData = sites.parse(await read(`${prefix}/sites?pageSize=20&page=1`, true)).data;
    stage = 'domains';
    const domainData = domains.parse(await read(`${prefix}/domains?limit=20&offset=0`, true)).data;
    stage = 'resources';
    const resourceData = resources.parse(await read(`${prefix}/public-resources?pageSize=20&page=1`, true)).data;
    if (resourceData.pagination.total > 200) throw new PangolinError('PANGOLIN_SEARCH_INCOMPLETE', 409);
    for (let page = 2; resourceData.resources.length < resourceData.pagination.total; page++) {
      const next = resources.parse(await read(`${prefix}/public-resources?pageSize=20&page=${page}`, true)).data;
      if (next.pagination.total !== resourceData.pagination.total || !next.resources.length) throw new PangolinError('PANGOLIN_SNAPSHOT_CHANGED', 409);
      resourceData.resources.push(...next.resources);
    }
    if (resourceData.resources.length !== resourceData.pagination.total ||
      new Set(resourceData.resources.map(item => item.resourceId)).size !== resourceData.resources.length) throw new PangolinError('PANGOLIN_SNAPSHOT_CHANGED', 409);
    return { checkedAt: new Date().toISOString(), organization, sites: siteData, domains: domainData, resources: resourceData,
      mtlsRoutesAdvertised: mtlsRoutes.every(([path, method]) => Boolean(spec.paths[path]?.[method])),
      scope: 'read-only-resources' as const };
  } catch (error) {
    if (error instanceof PangolinError) throw new PangolinError(error.code, error.statusCode, stage);
    throw new PangolinError('PANGOLIN_CONTRACT', 502, stage);
  }
}
