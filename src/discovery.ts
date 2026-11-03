import { Env, RouteConfig } from './types';
import { Settings, UPSTREAM_KEY_NAMES } from './store';

export interface DiscoveredModel {
  id: string;
  source: 'nvidia' | 'cloudflare';
  status: 'works' | 'fails' | 'unchecked';
  checkedAt: number;
  error?: string;
}

export interface DiscoveryState {
  models: Record<string, DiscoveredModel>;
  lastRun: number;
  lastSummary: string;
}

const STATE_KEY = 'discovery_state';
const BLOCKLIST_KEY = 'discovery_blocklist';
const NVIDIA_MODELS_URL = 'https://integrate.api.nvidia.com/v1/models';
const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

// Not chat models: embeddings, detectors, parsers, guards, rerankers, audio.
const SKIP_PATTERN =
  /(embed|nvclip|vila|deplot|kosmos|fuyu|neva|detector|parse|guard|safety|riva|translate|reward|recorder|stt|tts|rerank|clip|ocr|ising|proteina)/i;

// Cloudflare chat candidates from the account catalog (probed via AI binding).
export const CF_CANDIDATES = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/meta/llama-3.2-3b-instruct',
  '@cf/meta/llama-3.2-1b-instruct',
  '@cf/meta/llama-3.1-8b-instruct-fp8',
  '@cf/openai/gpt-oss-120b',
  '@cf/openai/gpt-oss-20b',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/qwen/qwen2.5-coder-32b-instruct',
  '@cf/qwen/qwq-32b',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/google/gemma-2b-it-lora',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/mistral/mistral-7b-instruct-v0.2-lora',
  '@cf/nvidia/nemotron-3-120b-a12b',
  '@cf/zai-org/glm-4.7-flash',
  '@cf/zai-org/glm-5.2',
  '@cf/zai-org/glm-5.3',
  '@cf/zai-org/glm-5.3-flash',
  '@cf/moonshotai/kimi-k2.6',
  '@cf/moonshotai/kimi-k2.7-code',
  '@cf/aisingapore/gemma-sea-lion-v4-27b-it',
  '@cf/ibm-granite/granite-4.0-h-micro',
  '@cf/swiss-ai/apertus-v1.5-8b',
  '@cf/utter-project/eurollm-9b-it',
  '@cf/deepseek-ai/deepseek-v4-flash-0731',
  '@cf/qwen/qwen3.8-27b',
];

export async function loadDiscoveryState(env: Env): Promise<DiscoveryState> {
  try {
    const raw = await env.ADMIN_KV?.get(STATE_KEY);
    if (raw) return JSON.parse(raw) as DiscoveryState;
  } catch {
    // fall through to empty state
  }
  return { models: {}, lastRun: 0, lastSummary: '' };
}

async function saveDiscoveryState(env: Env, state: DiscoveryState): Promise<void> {
  try {
    await env.ADMIN_KV?.put(STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('[Discovery] save failed:', error);
  }
}

export async function loadBlocklist(env: Env): Promise<string[]> {
  try {
    const raw = await env.ADMIN_KV?.get(BLOCKLIST_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addToBlocklist(env: Env, model: string): Promise<void> {
  const list = await loadBlocklist(env);
  if (!list.includes(model)) {
    list.push(model);
    try {
      await env.ADMIN_KV?.put(BLOCKLIST_KEY, JSON.stringify(list));
    } catch {
      // best effort
    }
  }
}

export async function clearBlocklist(env: Env): Promise<void> {
  try {
    await env.ADMIN_KV?.delete(BLOCKLIST_KEY);
  } catch {
    // best effort
  }
}

async function fetchNvidiaModelIds(env: Env): Promise<string[]> {
  for (const name of UPSTREAM_KEY_NAMES) {
    const key = env[name];
    if (!key) continue;
    try {
      const res = await fetch(NVIDIA_MODELS_URL, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      return (data.data ?? []).map((m) => m.id).filter((id) => !SKIP_PATTERN.test(id));
    } catch {
      // try next key
    }
  }
  return [];
}

async function probeNvidia(env: Env, model: string): Promise<{ ok: boolean; error?: string }> {
  for (const name of UPSTREAM_KEY_NAMES) {
    const settingsOk = env[name];
    if (!settingsOk) continue;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25_000);
      const res = await fetch(NVIDIA_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settingsOk}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
          max_tokens: 32,
          temperature: 0,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) return { ok: true };
      if (res.status === 403 && name !== UPSTREAM_KEY_NAMES[UPSTREAM_KEY_NAMES.length - 1]) {
        continue; // a dead/entitlement-less key must not condemn the model
      }
      return { ok: false, error: `HTTP ${res.status}` };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.name : 'network' };
    }
  }
  return { ok: false, error: 'no key available' };
}

async function probeCloudflare(env: Env, model: string): Promise<{ ok: boolean; error?: string }> {
  if (!env.AI) return { ok: false, error: 'no AI binding' };
  try {
    const result = (await env.AI.run(model, {
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      max_tokens: 32,
    })) as { response?: string; choices?: Array<{ message?: { content?: string } }> };
    const text = result.response ?? result.choices?.[0]?.message?.content ?? '';
    return text ? { ok: true } : { ok: false, error: 'empty response' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 90) : 'error' };
  }
}

const STALE_MS = 7 * 86_400_000;

/**
 * One discovery batch: refresh the catalog, probe the next unchecked or
 * stale models (bounded, so cron and button runs stay fast), persist state.
 */
export async function runDiscovery(env: Env, batchSize = 20): Promise<DiscoveryState> {
  const state = await loadDiscoveryState(env);
  const nvidiaIds = await fetchNvidiaModelIds(env);
  for (const id of nvidiaIds) {
    if (!state.models[id]) {
      state.models[id] = { id, source: 'nvidia', status: 'unchecked', checkedAt: 0 };
    }
  }
  for (const id of CF_CANDIDATES) {
    if (!state.models[id]) {
      state.models[id] = { id, source: 'cloudflare', status: 'unchecked', checkedAt: 0 };
    }
  }

  const now = Date.now();
  const due = Object.values(state.models)
    .filter((m) => m.status === 'unchecked' || now - m.checkedAt > STALE_MS)
    .sort((a, b) => a.checkedAt - b.checkedAt)
    .slice(0, batchSize);

  let probed = 0;
  const queue = [...due];
  const workers = Array.from({ length: 5 }, async () => {
    for (;;) {
      const model = queue.shift();
      if (!model) return;
      const result =
        model.source === 'nvidia' ? await probeNvidia(env, model.id) : await probeCloudflare(env, model.id);
      model.status = result.ok ? 'works' : 'fails';
      model.checkedAt = Date.now();
      model.error = result.ok ? undefined : result.error;
      probed++;
    }
  });
  await Promise.all(workers);

  const all = Object.values(state.models);
  state.lastRun = Date.now();
  state.lastSummary = `${all.filter((m) => m.status === 'works').length} funktionieren, ${all.filter((m) => m.status === 'fails').length} gehen nicht, ${all.filter((m) => m.status === 'unchecked').length} warten noch (${probed} gerade geprüft)`;
  await saveDiscoveryState(env, state);
  return state;
}

/** Merge auto-discovered working models into routes as direct model routes. */
export async function mergeDiscoveredRoutes(
  env: Env,
  settings: Settings,
  routes: RouteConfig
): Promise<RouteConfig> {
  if (settings.autoDiscover === false) return routes;
  const [state, blocklist] = await Promise.all([loadDiscoveryState(env), loadBlocklist(env)]);
  const merged: RouteConfig = { ...routes };
  for (const model of Object.values(state.models)) {
    if (model.status !== 'works') continue;
    if (merged[model.id] || blocklist.includes(model.id)) continue;
    merged[model.id] =
      model.source === 'nvidia'
        ? [
            {
              provider: 'openai-compatible',
              baseUrl: settings.upstreamUrl || 'https://integrate.api.nvidia.com/v1',
              model: model.id,
              apiKeys: UPSTREAM_KEY_NAMES,
            },
          ]
        : [{ provider: 'cloudflare-ai', model: model.id, apiKeys: [] }];
  }
  return merged;
}
