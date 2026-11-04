import { Env, RouteConfig } from './types';
import bundledRoutes from '../routes.json';

const ROUTES_KEY = 'routes';
const CLIENT_KEYS_KEY = 'client_keys';

export interface ClientKeyRecord {
  id: string;
  name: string;
  prefix: string;
  hash: string;
  createdAt: string;
  /** Dashboard user that minted this key (Master for the admin token). */
  owner?: string;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Effective routes: KV override (admin dashboard) > ROUTES_CONFIG env > bundled routes.json. */
export async function loadEffectiveRoutes(env: Env, settings?: Settings): Promise<RouteConfig> {
  let routes: RouteConfig | null = null;
  if (env.ADMIN_KV) {
    try {
      const raw = await env.ADMIN_KV.get(ROUTES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RouteConfig;
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          routes = parsed;
        }
      }
    } catch (error) {
      console.error('[Store] Failed to load routes from KV:', error);
    }
  }
  if (!routes) {
    const configStr = env.ROUTES_CONFIG?.trim();
    if (configStr) {
      try {
        routes = JSON.parse(configStr) as RouteConfig;
      } catch (error) {
        console.error('[Store] Failed to parse ROUTES_CONFIG:', error);
      }
    }
  }
  if (!routes) {
    routes = bundledRoutes as RouteConfig;
  }
  // Settings upstream URL overrides the default NVIDIA base URL live.
  if (settings?.upstreamUrl) {
    const cloned: RouteConfig = {};
    for (const [name, providers] of Object.entries(routes)) {
      cloned[name] = providers.map((p) =>
        p.provider === 'openai-compatible' && p.baseUrl === 'https://integrate.api.nvidia.com/v1'
          ? { ...p, baseUrl: settings.upstreamUrl }
          : p
      );
    }
    return cloned;
  }
  return routes;
}

export async function saveRoutes(env: Env, routes: RouteConfig): Promise<void> {
  if (!env.ADMIN_KV) throw new Error('ADMIN_KV not configured');
  await env.ADMIN_KV.put(ROUTES_KEY, JSON.stringify(routes));
}

export async function resetRoutes(env: Env): Promise<void> {
  if (!env.ADMIN_KV) throw new Error('ADMIN_KV not configured');
  await env.ADMIN_KV.delete(ROUTES_KEY);
}

export async function listClientKeys(env: Env): Promise<ClientKeyRecord[]> {
  if (!env.ADMIN_KV) return [];
  try {
    const raw = await env.ADMIN_KV.get(CLIENT_KEYS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ClientKeyRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[Store] Failed to load client keys:', error);
    return [];
  }
}

async function saveClientKeys(env: Env, keys: ClientKeyRecord[]): Promise<void> {
  if (!env.ADMIN_KV) throw new Error('ADMIN_KV not configured');
  await env.ADMIN_KV.put(CLIENT_KEYS_KEY, JSON.stringify(keys));
}

/** Creates a client API key. The plaintext is returned once and never stored. */
export async function createClientKey(
  env: Env,
  name: string,
  owner = 'Master'
): Promise<{ record: ClientKeyRecord; plainKey: string }> {
  const plainKey = `bKG_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
  const record: ClientKeyRecord = {
    id: crypto.randomUUID(),
    name: name.trim() || 'API-Key',
    prefix: plainKey.slice(0, 12),
    hash: await sha256Hex(plainKey),
    createdAt: new Date().toISOString(),
    owner,
  };
  const keys = await listClientKeys(env);
  keys.push(record);
  await saveClientKeys(env, keys);
  return { record, plainKey };
}

export async function deleteClientKey(env: Env, id: string): Promise<boolean> {
  const keys = await listClientKeys(env);
  const next = keys.filter((k) => k.id !== id);
  if (next.length === keys.length) return false;
  await saveClientKeys(env, next);
  return true;
}

export interface AdminUser {
  name: string;
  /** SHA-256 of a login token (legacy dashboard users). */
  hash?: string;
  /** PBKDF2 password record: pbkdf2$iterations$saltHex$hashHex */
  passwordHash?: string;
  role: 'superuser' | 'admin' | 'user';
  sessionVersion: number;
  createdAt: string;
}

export interface Settings {
  keyRpm: Record<string, number>;
  keyEnabled: Record<string, boolean>;
  authMode: 'master+keys' | 'master' | 'keys';
  upstreamUrl: string;
  maxTokensCap: number;
  modelLimits: Record<string, number>;
  defaultRangeDays: number;
  retentionDays: number;
  sloPercent: number;
  users: AdminUser[];
  heartbeatSec: number;
  streamIdleSec: number;
  maxWaitSec: number;
  modelsTtlMin: number;
  maxInflight: number;
  strictPassthrough: boolean;
  autoDiscover: boolean;
  keyOwners: Record<string, string>;
}

export const UPSTREAM_KEY_NAMES = [
  'NVIDIA_KEY_1',
  'NVIDIA_KEY_2',
  'NVIDIA_KEY_3',
  'NVIDIA_KEY_5',
  'NVIDIA_KEY_6',
  'NVIDIA_KEY_7',
];

export function defaultSettings(): Settings {
  return {
    keyRpm: Object.fromEntries(UPSTREAM_KEY_NAMES.map((k) => [k, 40])),
    keyEnabled: Object.fromEntries(UPSTREAM_KEY_NAMES.map((k) => [k, true])),
    authMode: 'master+keys',
    upstreamUrl: '',
    maxTokensCap: 0,
    modelLimits: {},
    defaultRangeDays: 30,
    retentionDays: 30,
    sloPercent: 99.9,
    users: [],
    heartbeatSec: 15,
    streamIdleSec: 60,
    maxWaitSec: 120,
    modelsTtlMin: 10,
    maxInflight: 0,
    strictPassthrough: false,
    autoDiscover: true,
    keyOwners: {},
  };
}

const SETTINGS_KEY = 'settings';

export async function loadSettings(env: Env): Promise<Settings> {
  const base = defaultSettings();
  if (!env.ADMIN_KV) return base;
  try {
    const raw = await env.ADMIN_KV.get(SETTINGS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...base,
      ...parsed,
      keyRpm: { ...base.keyRpm, ...(parsed.keyRpm ?? {}) },
      keyEnabled: { ...base.keyEnabled, ...(parsed.keyEnabled ?? {}) },
      users: (Array.isArray(parsed.users) ? parsed.users : []).map((u) => ({
        ...u,
        role: u.role ?? ('admin' as const),
        sessionVersion: u.sessionVersion ?? 1,
      })),
      modelLimits: parsed.modelLimits ?? {},
      keyOwners: parsed.keyOwners ?? {},
    };
  } catch (error) {
    console.error('[Store] Failed to load settings:', error);
    return base;
  }
}

export function validateSettings(input: Settings): string | null {
  if (!['master+keys', 'master', 'keys'].includes(input.authMode)) {
    return 'authMode must be master+keys, master or keys';
  }
  if (input.upstreamUrl) {
    try {
      const url = new URL(input.upstreamUrl);
      if (url.protocol !== 'https:') return 'upstreamUrl must be an https URL';
    } catch {
      return 'upstreamUrl must be a valid URL';
    }
  }
  if (!(input.defaultRangeDays >= 1)) return 'defaultRangeDays must be at least 1';
  if (!(input.retentionDays === 0 || input.retentionDays >= input.defaultRangeDays)) {
    return 'retentionDays must be 0 (unlimited) or at least the default time range';
  }
  if (!(input.sloPercent > 90 && input.sloPercent <= 100)) {
    return 'sloPercent must be above 90 and at most 100';
  }
  if (!(input.maxTokensCap >= 0)) return 'maxTokensCap must be 0 or positive';
  for (const [key, rpm] of Object.entries(input.keyRpm)) {
    if (!(Number.isFinite(rpm) && rpm >= 0)) return `keyRpm for ${key} must be 0 or positive`;
  }
  for (const [model, rpm] of Object.entries(input.modelLimits)) {
    if (!(Number.isFinite(rpm) && rpm >= 0))
      return `model limit for ${model} must be 0 or positive`;
  }
  return null;
}

export async function saveSettings(env: Env, settings: Settings): Promise<void> {
  if (!env.ADMIN_KV) throw new Error('ADMIN_KV not configured');
  await env.ADMIN_KV.put(SETTINGS_KEY, JSON.stringify(settings));
}

export function totalCapacity(settings: Settings): number {
  return UPSTREAM_KEY_NAMES.reduce(
    (sum, name) => sum + (settings.keyEnabled[name] === false ? 0 : (settings.keyRpm[name] ?? 40)),
    0
  );
}

// Cloudflare Workers' WebCrypto caps PBKDF2 at 100_000 iterations —
// anything higher fails at runtime with "iteration counts above 100000
// are not supported". Existing hashes keep working: verifyPassword reads
// the iteration count from the stored record.
const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    256
  );
  const hex = (buf: ArrayBuffer | Uint8Array) =>
    [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${hex(salt)}$${hex(bits)}`;
}

export async function verifyPassword(password: string, record: string): Promise<boolean> {
  try {
    const [scheme, iterText, saltHex, hashHex] = record.split('$');
    if (scheme !== 'pbkdf2') return false;
    const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: Number(iterText),
        hash: 'SHA-256',
      },
      key,
      256
    );
    const actual = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (actual.length !== hashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ hashHex.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

export async function findClientKey(env: Env, token: string): Promise<ClientKeyRecord | null> {
  // New keys start with bKG_; keys issued before the rename start with blg_
  // and must keep working, so both prefixes are accepted here.
  if (!env.ADMIN_KV || !(token.startsWith('bKG_') || token.startsWith('blg_'))) return null;
  const hash = await sha256Hex(token);
  const keys = await listClientKeys(env);
  return keys.find((k) => k.hash === hash) ?? null;
}

/** A presented token is valid if it hashes to a stored client key. */
export async function isClientKey(env: Env, token: string): Promise<boolean> {
  return (await findClientKey(env, token)) !== null;
}
