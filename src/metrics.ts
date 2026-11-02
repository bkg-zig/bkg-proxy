import { Env } from './types';

export interface MetricRow {
  ts: number;
  route: string;
  upstreamModel: string;
  client: string;
  agent: string;
  upstreamKey: string;
  status: number;
  outcome: string;
  errorClass: string;
  latencyMs: number;
  ttftMs: number;
  generationMs: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  toolCalls: number;
  truncated: number;
  stream: number;
  temperature: number | null;
  topP: number | null;
  maxTokens: number | null;
  messages: number;
  capacityTotal: number;
}

let schemaReady = false;

export async function ensureSchema(env: Env): Promise<boolean> {
  if (!env.DB) return false;
  if (schemaReady) return true;
  const db = env.DB;
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS requests (
        ts INTEGER NOT NULL, route TEXT, upstream_model TEXT, client TEXT, agent TEXT,
        upstream_key TEXT, status INTEGER, outcome TEXT, error_class TEXT,
        latency_ms INTEGER, ttft_ms INTEGER, generation_ms INTEGER,
        prompt_tokens INTEGER, completion_tokens INTEGER, reasoning_tokens INTEGER,
        tool_calls INTEGER, truncated INTEGER, stream INTEGER,
        temperature REAL, top_p REAL, max_tokens INTEGER, messages INTEGER,
        capacity_total INTEGER
      )`
      )
      .run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_requests_ts ON requests(ts)').run();
    schemaReady = true;
    return true;
  } catch (error) {
    console.error('[Metrics] schema failed:', error);
    return false;
  }
}

export async function recordMetric(env: Env, row: MetricRow, retentionDays: number): Promise<void> {
  try {
    if (!(await ensureSchema(env)) || !env.DB) return;
    await env.DB.prepare(
      `INSERT INTO requests (ts, route, upstream_model, client, agent, upstream_key, status,
        outcome, error_class, latency_ms, ttft_ms, generation_ms, prompt_tokens,
        completion_tokens, reasoning_tokens, tool_calls, truncated, stream, temperature,
        top_p, max_tokens, messages, capacity_total)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
      .bind(
        row.ts,
        row.route,
        row.upstreamModel,
        row.client,
        row.agent,
        row.upstreamKey,
        row.status,
        row.outcome,
        row.errorClass,
        Math.round(row.latencyMs),
        Math.round(row.ttftMs),
        Math.round(row.generationMs),
        row.promptTokens,
        row.completionTokens,
        row.reasoningTokens,
        row.toolCalls,
        row.truncated,
        row.stream,
        row.temperature,
        row.topP,
        row.maxTokens,
        row.messages,
        row.capacityTotal
      )
      .run();
    // Opportunistic retention pruning (about 1% of writes)
    if (retentionDays > 0 && Math.random() < 0.01) {
      const cutoff = Date.now() - retentionDays * 86_400_000;
      await env.DB.prepare('DELETE FROM requests WHERE ts < ?').bind(cutoff).run();
    }
  } catch (error) {
    console.error('[Metrics] insert failed:', error);
  }
}

/** Requests in the last 60 seconds per upstream key name. */
export async function keyUsageLastMinute(env: Env): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    if (!(await ensureSchema(env)) || !env.DB) return out;
    const result = await env.DB.prepare(
      'SELECT upstream_key AS k, COUNT(*) AS c FROM requests WHERE ts >= ? GROUP BY upstream_key'
    )
      .bind(Date.now() - 60_000)
      .all<{ k: string; c: number }>();
    for (const row of result.results ?? []) {
      if (row.k) out[row.k] = row.c;
    }
  } catch (error) {
    console.error('[Metrics] key usage failed:', error);
  }
  return out;
}

export async function routeUsageLastMinute(env: Env, route: string): Promise<number> {
  try {
    if (!(await ensureSchema(env)) || !env.DB) return 0;
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS c FROM requests WHERE ts >= ? AND route = ?'
    )
      .bind(Date.now() - 60_000, route)
      .first<{ c: number }>();
    return row?.c ?? 0;
  } catch {
    return 0;
  }
}

export function errorClassForStatus(status: number): string {
  if (status === 0) return 'network';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limit';
  if (status === 408 || status === 504) return 'timeout';
  if (status >= 500) return 'upstream_5xx';
  if (status >= 400) return 'client_4xx';
  return 'none';
}

interface StreamStats {
  ttftMs: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  toolCalls: number;
  truncated: number;
  upstreamModel: string;
}

/** Pass-through wrapper that observes an OpenAI SSE stream for metrics. */
export function wrapStreamForMetrics(
  stream: ReadableStream<Uint8Array>,
  onDone: (stats: StreamStats, latencyMs: number) => void,
  startedAt: number
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = '';
  let firstAt = 0;
  const stats: StreamStats = {
    ttftMs: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    toolCalls: 0,
    truncated: 0,
    upstreamModel: '',
  };
  const seenToolCalls = new Set<number>();

  const observe = (text: string) => {
    buffer += text;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:') || trimmed === 'data: [DONE]') continue;
      try {
        const chunk = JSON.parse(trimmed.slice(5)) as {
          model?: string;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            completion_tokens_details?: { reasoning_tokens?: number };
          };
          choices?: Array<{
            finish_reason?: string | null;
            delta?: { tool_calls?: Array<{ index?: number }> };
            message?: { tool_calls?: unknown[] };
          }>;
        };
        if (!firstAt) {
          firstAt = Date.now();
          stats.ttftMs = firstAt - startedAt;
        }
        if (chunk.model) stats.upstreamModel = chunk.model;
        if (chunk.usage) {
          stats.promptTokens = chunk.usage.prompt_tokens ?? stats.promptTokens;
          stats.completionTokens = chunk.usage.completion_tokens ?? stats.completionTokens;
          stats.reasoningTokens =
            chunk.usage.completion_tokens_details?.reasoning_tokens ?? stats.reasoningTokens;
        }
        for (const choice of chunk.choices ?? []) {
          if (choice.finish_reason === 'length') stats.truncated = 1;
          for (const call of choice.delta?.tool_calls ?? []) {
            seenToolCalls.add(call.index ?? 0);
          }
        }
        stats.toolCalls = seenToolCalls.size;
      } catch {
        // Partial JSON lines are buffered; malformed chunks are ignored for metrics.
      }
    }
  };

  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        observe(decoder.decode(chunk, { stream: true }));
        controller.enqueue(chunk);
      },
      flush() {
        onDone(stats, Date.now() - startedAt);
      },
    })
  );
}
