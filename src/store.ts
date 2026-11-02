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
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Effective routes: KV override (admin dashboard) > ROUTES_CONFIG env > bundled routes.json. */
export async function loadEffectiveRoutes(
  env: Env,
  settings?: Settings
): Promise<RouteConfig> {
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
        p.provider === 'openai-compatible' &&
        p.baseUrl === 'https://integrate.api.nvidia.com/v1'
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
  name: string
): Promise<{ record: ClientKeyRecord; plainKey: string }> {
  const plainKey = `blg_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
  const record: ClientKeyRecord = {
    id: crypto.randomUUID(),
    name: name.trim() || 'API-Key',
    prefix: plainKey.slice(0, 12),
    hash: await sha256Hex(plainKey),
    createdAt: new Date().toISOString(),
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
  hash: string;
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
    keyRpm: Object.fromEntries(UPSTREAM_KEY_NAMES.map((k) => [k, 60])),
    keyEnabled: Object.fromEntries(UPSTREAM_KEY_NAMES.map((k) => [k, true])),
    authMode: 'master+keys',
    upstreamUrl: '',
    maxTokensCap: 0,
    modelLimits: {},
    defaultRangeDays: 30,
    retentionDays: 30,
    sloPercent: 99.9,
    users: [],
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
      users: Array.isArray(parsed.users) ? parsed.users : [],
      modelLimits: parsed.modelLimits ?? {},
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
    if (!(Number.isFinite(rpm) && rpm >= 0)) return `model limit for ${model} must be 0 or positive`;
  }
  return null;
}

export async function saveSettings(env: Env, settings: Settings): Promise<void> {
  if (!env.ADMIN_KV) throw new Error('ADMIN_KV not configured');
  await env.ADMIN_KV.put(SETTINGS_KEY, JSON.stringify(settings));
}

export function totalCapacity(settings: Settings): number {
  return UPSTREAM_KEY_NAMES.reduce(
    (sum, name) => sum + (settings.keyEnabled[name] === false ? 0 : (settings.keyRpm[name] ?? 60)),
    0
  );
}

export async function findClientKey(
  env: Env,
  token: string
): Promise<ClientKeyRecord | null> {
  if (!env.ADMIN_KV || !token.startsWith('blg_')) return null;
  const hash = await sha256Hex(token);
  const keys = await listClientKeys(env);
  return keys.find((k) => k.hash === hash) ?? null;
}

/** A presented token is valid if it hashes to a stored client key. */
export async function isClientKey(env: Env, token: string): Promise<boolean> {
  return (await findClientKey(env, token)) !== null;
}
