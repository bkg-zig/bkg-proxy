export interface OverviewData {
  me?: { name: string; role: string };
  routes: Record<string, Array<{ provider: string; model: string; baseUrl?: string }>>;
  clientKeys: Array<{ id: string; name: string; prefix: string; createdAt: string; owner: string }>;
  upstreamKeys: Record<string, boolean>;
  proxyAuthSet: boolean;
  adminKv: boolean;
}

export interface SettingsData {
  keyRpm: Record<string, number>;
  keyEnabled: Record<string, boolean>;
  authMode: string;
  upstreamUrl: string;
  maxTokensCap: number;
  modelLimits: Record<string, number>;
  defaultRangeDays: number;
  retentionDays: number;
  sloPercent: number;
  users: Array<{ name: string; role: string; createdAt: string }>;
  heartbeatSec: number;
  streamIdleSec: number;
  maxWaitSec: number;
  modelsTtlMin: number;
  maxInflight: number;
  strictPassthrough: boolean;
  keyOwners: Record<string, string>;
}

export type Row = Record<string, string | number | null>;

export interface AnalyticsData {
  empty?: boolean;
  range: { from: number; to: number; bucketMs: number; preset: string };
  health: Array<{ name: string; ok: boolean; detail: string }>;
  overview: {
    requests: number; successes: number; errors: number; availability: number;
    promptTokens: number; completionTokens: number; reasoningTokens: number;
    toolCalls: number; rate429: number; governor: number;
    avgLatencyMs: number; avgTtftMs: number; nowRpm: number; capacityNow: number; saturation: number;
  };
  series: {
    requests: Row[]; outcomes: Row[]; models: Row[]; rate429: Row[];
  };
  models: Array<Row & {
    route: string; upstreamModel: string; requests: number; successes: number;
    avgTtftMs: number; avgLatencyMs: number; avgGenerationMs: number;
    promptTokens: number; completionTokens: number; reasoningTokens: number;
    toolCalls: number; truncated: number; streamed: number;
  }>;
  clients: Array<Row & {
    client: string; requests: number; successes: number; toolCalls: number;
    avgMessages: number; avgTemperature: number; avgTopP: number; avgMaxTokens: number;
    streamed: number; tokens: number; avgLatencyMs: number; agents: string;
  }>;
  reliability: {
    availability: number; sloPercent: number;
    errorBudgetTotal: number; errorBudgetUsed: number; errorBudgetRemaining: number;
    latency: { queueMs: number; ttftMs: number; generationMs: number; totalMs: number };
    taxonomy: Row[]; heatmap: Row[]; governor: number;
  };
  capacity: {
    nowRpm: number; capacityNow: number; saturation: number;
    peakRpm: number; peakCapacity: number; peakShortfall: number;
    perKey: Array<{ key: string; present: boolean; enabled: boolean; rpmLimit: number; lastMinute: number; rangeRequests: number; range429: number }>;
  };
  queue: { waiting: number };
  modelPressure: Array<{ route: string; until: number; level: number }>;
  history: { rows: number; approxBytes: number; firstSample: number | null; lastSample: number | null; retentionDays: number };
}

const adminToken = () => sessionStorage.getItem('blg_admin') ?? '';
export const clientToken = () => sessionStorage.getItem('blg_client') ?? '';
export const setTokens = (admin: string, client: string) => {
  sessionStorage.setItem('blg_admin', admin);
  sessionStorage.setItem('blg_client', client);
};

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `Fehler ${res.status}`);
  return data as T;
}

export function adminApi<T>(path: string, options?: RequestInit): Promise<T> {
  return fetch(path, {
    ...options,
    headers: { 'x-admin-token': adminToken(), 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  }).then((r) => parse<T>(r));
}

export function clientFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...options,
    headers: { Authorization: `Bearer ${clientToken()}`, 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  });
}

export async function loginPassword(name: string, password: string): Promise<{ name: string; role: string }> {
  const res = await fetch('/admin/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
  const data = await parse<{ user: { name: string; role: string } }>(res);
  return data.user;
}

export const fmt = (n: number | string | null | undefined) => Number(n ?? 0).toLocaleString('de-DE');
export const ms = (n: number | string | null | undefined) => `${fmt(Math.round(Number(n ?? 0)))} ms`;
export const pct = (n: number | string | null | undefined) => `${Number(n ?? 0).toFixed(1)} %`;
