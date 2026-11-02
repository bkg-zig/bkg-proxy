import { Env } from './types';
import { Settings, totalCapacity, UPSTREAM_KEY_NAMES } from './store';
import { ensureSchema } from './metrics';

export interface RangeSelection {
  from: number;
  to: number;
  preset: string;
  bucketMs: number;
}

function bucketFor(spanMs: number): number {
  if (spanMs <= 2 * 3_600_000) return 60_000;
  if (spanMs <= 48 * 3_600_000) return 300_000;
  if (spanMs <= 14 * 86_400_000) return 3_600_000;
  return 86_400_000;
}

export async function resolveRange(
  env: Env,
  settings: Settings,
  params: URLSearchParams
): Promise<RangeSelection> {
  const to = params.get('to') ? Number(params.get('to')) : Date.now();
  const preset = params.get('range') ?? 'default';
  let from: number;
  if (params.get('from')) {
    from = Number(params.get('from'));
  } else if (preset === 'all') {
    from = 0;
  } else if (preset.endsWith('h')) {
    from = to - Number(preset.slice(0, -1)) * 3_600_000;
  } else if (preset.endsWith('d')) {
    from = to - Number(preset.slice(0, -1)) * 86_400_000;
  } else {
    // Default view follows now across the configured default range, but a new
    // server starts at its first sample instead of an empty recent slice.
    from = to - settings.defaultRangeDays * 86_400_000;
    if (env.DB && (await ensureSchema(env))) {
      const first = await env.DB.prepare('SELECT MIN(ts) AS f FROM requests').first<{
        f: number | null;
      }>();
      if (first?.f && first.f > from) from = first.f;
    }
  }
  if (!Number.isFinite(from) || from < 0) from = 0;
  const bucketMs = bucketFor(Math.max(to - from, 1));
  return { from, to, preset, bucketMs };
}

type Row = Record<string, number | string | null>;

async function all(env: Env, sql: string, ...binds: Array<number | string>): Promise<Row[]> {
  if (!env.DB) return [];
  const result = await env.DB.prepare(sql)
    .bind(...binds)
    .all<Row>();
  return result.results ?? [];
}

export async function getAnalytics(env: Env, settings: Settings, params: URLSearchParams) {
  if (!env.DB || !(await ensureSchema(env))) {
    return { empty: true, reason: 'D1 metrics database not available' };
  }
  const range = await resolveRange(env, settings, params);
  const { from, to, bucketMs } = range;
  const bucket = `(ts / ${bucketMs}) * ${bucketMs}`;
  const capacityNow = totalCapacity(settings);

  const totalsRows = await all(
    env,
    `SELECT COUNT(*) AS requests,
       SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS successes,
       SUM(CASE WHEN status = 429 THEN 1 ELSE 0 END) AS rate429,
       SUM(CASE WHEN outcome = 'governor' THEN 1 ELSE 0 END) AS governor,
       COALESCE(SUM(prompt_tokens),0) AS promptTokens,
       COALESCE(SUM(completion_tokens),0) AS completionTokens,
       COALESCE(SUM(reasoning_tokens),0) AS reasoningTokens,
       COALESCE(SUM(tool_calls),0) AS toolCalls,
       COALESCE(AVG(latency_ms),0) AS avgLatency,
       COALESCE(AVG(ttft_ms),0) AS avgTtft,
       COALESCE(AVG(generation_ms),0) AS avgGeneration
     FROM requests WHERE ts >= ? AND ts <= ?`,
    from,
    to
  );
  const totals = totalsRows[0] ?? {};
  const requests = Number(totals.requests ?? 0);
  const successes = Number(totals.successes ?? 0);
  const errors = requests - successes;
  const availability = requests ? (successes / requests) * 100 : 100;
  const errorBudgetTotal = Math.floor((1 - settings.sloPercent / 100) * requests);
  const historyRows = await all(
    env,
    'SELECT COUNT(*) AS c, MIN(ts) AS first, MAX(ts) AS last FROM requests'
  );

  const requestSeries = await all(
    env,
    `SELECT ${bucket} AS t, COUNT(*) AS requests,
       COALESCE(SUM(prompt_tokens + completion_tokens),0) AS tokens,
       COALESCE(SUM(tool_calls),0) AS toolCalls,
       COALESCE(AVG(capacity_total),0) AS capacity
     FROM requests WHERE ts >= ? AND ts <= ? GROUP BY t ORDER BY t`,
    from,
    to
  );

  const outcomeSeries = await all(
    env,
    `SELECT ${bucket} AS t, outcome, COUNT(*) AS c
     FROM requests WHERE ts >= ? AND ts <= ? GROUP BY t, outcome ORDER BY t`,
    from,
    to
  );

  const models = await all(
    env,
    `SELECT route, upstream_model AS upstreamModel, COUNT(*) AS requests,
       SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS successes,
       COALESCE(AVG(ttft_ms),0) AS avgTtftMs,
       COALESCE(AVG(latency_ms),0) AS avgLatencyMs,
       COALESCE(AVG(generation_ms),0) AS avgGenerationMs,
       COALESCE(SUM(prompt_tokens),0) AS promptTokens,
       COALESCE(SUM(completion_tokens),0) AS completionTokens,
       COALESCE(SUM(reasoning_tokens),0) AS reasoningTokens,
       COALESCE(SUM(tool_calls),0) AS toolCalls,
       COALESCE(SUM(truncated),0) AS truncated,
       SUM(CASE WHEN stream = 1 THEN 1 ELSE 0 END) AS streamed
     FROM requests WHERE ts >= ? AND ts <= ? GROUP BY route, upstream_model
     ORDER BY requests DESC`,
    from,
    to
  );

  const modelSeries = await all(
    env,
    `SELECT ${bucket} AS t, route, COALESCE(AVG(ttft_ms),0) AS ttft,
       COALESCE(AVG(latency_ms),0) AS latency,
       COALESCE(AVG(generation_ms),0) AS generation,
       COALESCE(SUM(completion_tokens),0) AS completionTokens
     FROM requests WHERE ts >= ? AND ts <= ? GROUP BY t, route ORDER BY t`,
    from,
    to
  );

  const clients = await all(
    env,
    `SELECT client, COUNT(*) AS requests,
       SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS successes,
       COALESCE(SUM(tool_calls),0) AS toolCalls,
       COALESCE(AVG(messages),0) AS avgMessages,
       COALESCE(AVG(temperature),0) AS avgTemperature,
       COALESCE(AVG(top_p),0) AS avgTopP,
       COALESCE(AVG(max_tokens),0) AS avgMaxTokens,
       SUM(CASE WHEN stream = 1 THEN 1 ELSE 0 END) AS streamed,
       COALESCE(SUM(prompt_tokens + completion_tokens),0) AS tokens,
       COALESCE(AVG(latency_ms),0) AS avgLatencyMs,
       GROUP_CONCAT(DISTINCT agent) AS agents
     FROM requests WHERE ts >= ? AND ts <= ? GROUP BY client ORDER BY requests DESC`,
    from,
    to
  );

  const errorTaxonomy = await all(
    env,
    `SELECT error_class AS errorClass, status, COUNT(*) AS c
     FROM requests WHERE ts >= ? AND ts <= ? AND NOT (status BETWEEN 200 AND 299)
     GROUP BY error_class, status ORDER BY c DESC`,
    from,
    to
  );

  const heatmap = await all(
    env,
    `SELECT CAST(strftime('%H', ts / 1000, 'unixepoch') AS INTEGER) AS hour,
       COUNT(*) AS requests,
       SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 0 ELSE 1 END) AS errors
     FROM requests WHERE ts >= ? AND ts <= ? GROUP BY hour ORDER BY hour`,
    from,
    to
  );

  const perKeyRange = await all(
    env,
    `SELECT upstream_key AS k, COUNT(*) AS c,
       SUM(CASE WHEN status = 429 THEN 1 ELSE 0 END) AS rate429
     FROM requests WHERE ts >= ? AND ts <= ? AND upstream_key != '' GROUP BY upstream_key`,
    from,
    to
  );
  const perKeyMinute = await all(
    env,
    `SELECT upstream_key AS k, COUNT(*) AS c FROM requests
     WHERE ts >= ? AND upstream_key != '' GROUP BY upstream_key`,
    Date.now() - 60_000
  );
  const rate429Series = await all(
    env,
    `SELECT ${bucket} AS t, upstream_key AS k, COUNT(*) AS c
     FROM requests WHERE ts >= ? AND ts <= ? AND status = 429
     GROUP BY t, upstream_key ORDER BY t`,
    from,
    to
  );

  const nowRows = await all(
    env,
    'SELECT COUNT(*) AS c FROM requests WHERE ts >= ?',
    Date.now() - 60_000
  );
  const nowRpm = Number(nowRows[0]?.c ?? 0);

  const peakRows = await all(
    env,
    `SELECT (ts / 60000) * 60000 AS minute, COUNT(*) AS c,
       COALESCE(AVG(capacity_total),0) AS capacity
     FROM requests WHERE ts >= ? AND ts <= ? GROUP BY minute ORDER BY c DESC LIMIT 1`,
    from,
    to
  );
  const peak = peakRows[0] ?? { c: 0, capacity: capacityNow };

  const history = historyRows[0] ?? { c: 0, first: null, last: null };
  const historyCount = Number(history.c ?? 0);

  return {
    empty: historyCount === 0,
    range,
    settings: {
      sloPercent: settings.sloPercent,
      defaultRangeDays: settings.defaultRangeDays,
      retentionDays: settings.retentionDays,
      capacityNow,
    },
    health: [
      { name: 'Worker', ok: true, detail: 'responding' },
      { name: 'Metrics DB (D1)', ok: true, detail: `${historyCount} samples` },
      {
        name: 'Config (KV)',
        ok: Boolean(env.ADMIN_KV),
        detail: env.ADMIN_KV ? 'bound' : 'missing',
      },
      { name: 'Images (Workers AI)', ok: Boolean(env.AI), detail: env.AI ? 'bound' : 'missing' },
      {
        name: 'NVIDIA keys',
        ok: UPSTREAM_KEY_NAMES.some((k) => Boolean(env[k])),
        detail: `${UPSTREAM_KEY_NAMES.filter((k) => Boolean(env[k])).length}/${UPSTREAM_KEY_NAMES.length} present`,
      },
      {
        name: 'Last sample',
        ok: history.last ? Date.now() - Number(history.last) < 3_600_000 : false,
        detail: history.last ? new Date(Number(history.last)).toISOString() : 'none yet',
      },
    ],
    overview: {
      requests,
      successes,
      errors,
      availability,
      promptTokens: Number(totals.promptTokens ?? 0),
      completionTokens: Number(totals.completionTokens ?? 0),
      reasoningTokens: Number(totals.reasoningTokens ?? 0),
      toolCalls: Number(totals.toolCalls ?? 0),
      rate429: Number(totals.rate429 ?? 0),
      governor: Number(totals.governor ?? 0),
      avgLatencyMs: Number(totals.avgLatency ?? 0),
      avgTtftMs: Number(totals.avgTtft ?? 0),
      nowRpm,
      capacityNow,
      saturation: capacityNow ? (nowRpm / capacityNow) * 100 : 0,
    },
    series: {
      requests: requestSeries,
      outcomes: outcomeSeries,
      models: modelSeries,
      rate429: rate429Series,
    },
    models,
    clients,
    reliability: {
      availability,
      sloPercent: settings.sloPercent,
      errorBudgetTotal,
      errorBudgetUsed: errors,
      errorBudgetRemaining: Math.max(errorBudgetTotal - errors, 0),
      latency: {
        queueMs: Math.max(
          Number(totals.avgLatency ?? 0) -
            Number(totals.avgTtft ?? 0) -
            Number(totals.avgGeneration ?? 0),
          0
        ),
        ttftMs: Number(totals.avgTtft ?? 0),
        generationMs: Number(totals.avgGeneration ?? 0),
        totalMs: Number(totals.avgLatency ?? 0),
      },
      taxonomy: errorTaxonomy,
      heatmap,
      governor: Number(totals.governor ?? 0),
    },
    capacity: {
      nowRpm,
      capacityNow,
      saturation: capacityNow ? (nowRpm / capacityNow) * 100 : 0,
      peakRpm: Number(peak.c ?? 0),
      peakCapacity: Number(peak.capacity ?? capacityNow),
      peakShortfall: Math.max(Number(peak.c ?? 0) - Number(peak.capacity ?? capacityNow), 0),
      perKey: UPSTREAM_KEY_NAMES.map((name) => {
        const rangeRow = perKeyRange.find((r) => r.k === name);
        const minuteRow = perKeyMinute.find((r) => r.k === name);
        return {
          key: name,
          present: Boolean(env[name]),
          enabled: settings.keyEnabled[name] !== false,
          rpmLimit: settings.keyRpm[name] ?? 60,
          lastMinute: Number(minuteRow?.c ?? 0),
          rangeRequests: Number(rangeRow?.c ?? 0),
          range429: Number(rangeRow?.rate429 ?? 0),
        };
      }),
    },
    history: {
      rows: historyCount,
      approxBytes: historyCount * 180,
      firstSample: history.first,
      lastSample: history.last,
      retentionDays: settings.retentionDays,
    },
  };
}
