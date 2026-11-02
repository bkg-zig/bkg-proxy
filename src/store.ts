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
export async function loadEffectiveRoutes(env: Env): Promise<RouteConfig> {
  if (env.ADMIN_KV) {
    try {
      const raw = await env.ADMIN_KV.get(ROUTES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RouteConfig;
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    } catch (error) {
      console.error('[Store] Failed to load routes from KV:', error);
    }
  }
  const configStr = env.ROUTES_CONFIG?.trim();
  if (configStr) {
    try {
      return JSON.parse(configStr) as RouteConfig;
    } catch (error) {
      console.error('[Store] Failed to parse ROUTES_CONFIG:', error);
    }
  }
  return bundledRoutes as RouteConfig;
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

/** A presented token is valid if it hashes to a stored client key. */
export async function isClientKey(env: Env, token: string): Promise<boolean> {
  if (!env.ADMIN_KV || !token.startsWith('blg_')) return false;
  const hash = await sha256Hex(token);
  const keys = await listClientKeys(env);
  return keys.some((k) => k.hash === hash);
}
