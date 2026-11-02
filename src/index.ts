import { Env, OpenAIChatRequest, ProviderConfig, RouteConfig } from './types';
import { AnthropicRequest } from './anthropic-types';
import { Router } from './router';
import {
  ProxyError,
  createErrorResponse,
  withTimeout,
  isRetryableError,
  shouldRotateKey,
} from './utils/error-handler';
import { createProvider } from './providers';
import { AnthropicProvider } from './providers/anthropic';
import {
  convertAnthropicRequestToOpenAI,
  convertOpenAIResponseToAnthropic,
  AnthropicStreamAdapter,
} from './utils/anthropic-adapter';
import { generateId } from './utils/response-mapper';
import {
  loadEffectiveRoutes,
  saveRoutes,
  resetRoutes,
  listClientKeys,
  createClientKey,
  deleteClientKey,
  findClientKey,
  loadSettings,
  saveSettings,
  validateSettings,
  totalCapacity,
  sha256Hex,
  Settings,
} from './store';
import { recordMetric, keyUsageLastMinute, routeUsageLastMinute, errorClassForStatus, wrapStreamForMetrics } from './metrics';
import { getAnalytics } from './analytics';

interface ClientIdentity { label: string; kind: string }
import { dashboardHtml } from './dashboard';
import { createAudioStream, getVoices, DEFAULT_VOICE } from './tts/tts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-admin-token',
  'Access-Control-Max-Age': '86400',
};

const ALL_NVIDIA_KEYS = [
  'NVIDIA_KEY_1',
  'NVIDIA_KEY_2',
  'NVIDIA_KEY_3',
  'NVIDIA_KEY_5',
  'NVIDIA_KEY_6',
  'NVIDIA_KEY_7',
];
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

const IMAGE_MODELS: Record<string, { id: string; contentType: string } | 'pollinations'> = {
  sdxl: { id: '@cf/stabilityai/stable-diffusion-xl-base-1.0', contentType: 'image/png' },
  'sdxl-lightning': {
    id: '@cf/bytedance/stable-diffusion-xl-lightning',
    contentType: 'image/jpeg',
  },
  dreamshaper: { id: '@cf/lykon/dreamshaper-8-lcm', contentType: 'image/png' },
  'pollinations-flux': 'pollinations',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Health check — no auth required
      if ((path === '/health' || path === '/') && request.method === 'GET') {
        return json({
          status: 'ok',
          service: 'ai-worker-proxy',
          dashboard: '/dashboard',
          timestamp: new Date().toISOString(),
        });
      }

      // Admin dashboard page — the page itself is public, all data/actions need ADMIN_TOKEN
      if ((path === '/dashboard' || path === '/admin') && request.method === 'GET') {
        return new Response(dashboardHtml(), {
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS },
        });
      }

      // Admin API — separate ADMIN_TOKEN auth
      if (path.startsWith('/admin/api/')) {
        return await handleAdmin(request, env, path);
      }

      // Everything below requires auth (master token or dashboard-created client key)
      const settings = await loadSettings(env);
      const identity = await verifyAuth(request, env, settings);
      if (!identity) {
        throw new ProxyError('Unauthorized', 401, 'invalid_auth');
      }
      const agent = (request.headers.get('User-Agent') ?? '').slice(0, 120);

      // Models list (requires auth, matching OpenAI behavior)
      if (
        request.method === 'GET' &&
        (path === '/models' ||
          path === '/v1/models' ||
          path === '/anthropic/models' ||
          path === '/anthropic/v1/models')
      ) {
        const router = new Router(env, await loadEffectiveRoutes(env, settings));
        return json({
          object: 'list',
          data: router.getAvailableModels(),
        });
      }

      // Image generation — POST only
      if (request.method === 'POST' && path === '/v1/images/generations') {
        return await handleImageGeneration(request, env, identity, agent, settings, ctx);
      }

      // Speech (Microsoft Edge TTS) — OpenAI-style and upstream-style
      if (request.method === 'POST' && (path === '/v1/audio/speech' || path === '/tts')) {
        return await handleSpeech(request, env, identity, agent, settings, ctx);
      }
      if (request.method === 'GET' && (path === '/v1/audio/voices' || path === '/voices')) {
        try {
          const voices = await getVoices();
          return json({
            voices: voices.map((v) => ({
              ShortName: v.ShortName,
              Locale: v.Locale,
              Gender: v.Gender,
              FriendlyName: v.FriendlyName,
            })),
          });
        } catch (error) {
          console.error('[TTS] voice list failed:', error);
          throw new ProxyError('Failed to fetch voices', 502);
        }
      }

      // Anthropic-format chat completions — POST only
      if (
        request.method === 'POST' &&
        (path === '/anthropic/v1/messages' || path === '/anthropic/messages')
      ) {
        return await handleAnthropicChat(request, env, identity, agent, settings, ctx);
      }

      // OpenAI-format chat completions — POST only
      if (
        request.method === 'POST' &&
        (path === '/' || path === '/v1/chat/completions' || path === '/chat/completions')
      ) {
        return await handleChatCompletion(request, env, identity, agent, settings, ctx);
      }

      throw new ProxyError('Not found', 404);
    } catch (error) {
      console.error('[Worker] Error:', error);
      const errorResponse = createErrorResponse(error);
      const headers = new Headers(errorResponse.headers);
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        headers.set(key, value);
      }
      return new Response(errorResponse.body, { status: errorResponse.status, headers });
    }
  },
};

// =============================================================================
// Admin API (dashboard backend, ADMIN_TOKEN)
// =============================================================================

async function handleAdmin(request: Request, env: Env, path: string): Promise<Response> {
  if (!(await verifyAdmin(request, env))) {
    throw new ProxyError('Admin unauthorized', 401, 'invalid_admin_auth');
  }

  if (request.method === 'GET' && path === '/admin/api/overview') {
    const routes = await loadEffectiveRoutes(env);
    const clientKeys = (await listClientKeys(env)).map(({ id, name, prefix, createdAt }) => ({
      id,
      name,
      prefix,
      createdAt,
    }));
    return json({
      routes,
      clientKeys,
      upstreamKeys: Object.fromEntries(
        [
          'NVIDIA_KEY_1',
          'NVIDIA_KEY_2',
          'NVIDIA_KEY_3',
          'NVIDIA_KEY_5',
          'NVIDIA_KEY_6',
          'NVIDIA_KEY_7',
        ].map((name) => [name, Boolean(env[name])])
      ),
      proxyAuthSet: Boolean(env.PROXY_AUTH_TOKEN),
      adminKv: Boolean(env.ADMIN_KV),
    });
  }

  if (request.method === 'GET' && path === '/admin/api/stats') {
    const sources: Record<string, string> = {
      balanced: 'https://nimstats.maurodruwel.be/top',
      speed: 'https://nimstats.maurodruwel.be/top/speed',
      intelligence: 'https://nimstats.maurodruwel.be/top/intelligence',
    };
    const result: Record<string, unknown> = { fetchedAt: new Date().toISOString() };
    await Promise.all(
      Object.entries(sources).map(async ([name, sourceUrl]) => {
        try {
          const response = await fetch(sourceUrl, {
            headers: { Accept: 'application/json' },
            cf: { cacheTtl: 600, cacheEverything: true },
          } as RequestInit);
          result[name] = response.ok ? await response.json() : { error: `HTTP ${response.status}` };
        } catch (error) {
          result[name] = { error: error instanceof Error ? error.message : 'fetch failed' };
        }
      })
    );
    return json(result);
  }

  if (request.method === 'POST' && path === '/admin/api/models') {
    const body = (await request.json()) as {
      name?: string;
      model?: string;
      baseUrl?: string;
      apiKeys?: string[];
    };
    const name = body.name?.trim();
    const model = body.model?.trim();
    if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(name)) {
      throw new ProxyError('Invalid model name', 400);
    }
    if (!model) {
      throw new ProxyError('Upstream model is required', 400);
    }
    const routes = await loadEffectiveRoutes(env);
    routes[name] = [
      {
        provider: 'openai-compatible',
        baseUrl: body.baseUrl?.trim() || NVIDIA_BASE_URL,
        model,
        apiKeys: body.apiKeys?.length ? body.apiKeys : ALL_NVIDIA_KEYS,
      },
    ];
    await saveRoutes(env, routes);
    return json({ ok: true, name, routes });
  }

  if (request.method === 'DELETE' && path.startsWith('/admin/api/models/')) {
    const name = decodeURIComponent(path.slice('/admin/api/models/'.length));
    const routes: RouteConfig = await loadEffectiveRoutes(env);
    if (!routes[name]) {
      throw new ProxyError(`Model not found: ${name}`, 404);
    }
    delete routes[name];
    await saveRoutes(env, routes);
    return json({ ok: true, name, routes });
  }

  if (request.method === 'POST' && path === '/admin/api/routes/reset') {
    await resetRoutes(env);
    return json({ ok: true, routes: await loadEffectiveRoutes(env) });
  }

  if (request.method === 'POST' && path === '/admin/api/keys') {
    const body = (await request.json()) as { name?: string };
    const { record, plainKey } = await createClientKey(env, body.name ?? '');
    return json(
      {
        ok: true,
        key: plainKey,
        record: {
          id: record.id,
          name: record.name,
          prefix: record.prefix,
          createdAt: record.createdAt,
        },
      },
      201
    );
  }

  if (request.method === 'DELETE' && path.startsWith('/admin/api/keys/')) {
    const id = decodeURIComponent(path.slice('/admin/api/keys/'.length));
    const deleted = await deleteClientKey(env, id);
    if (!deleted) {
      throw new ProxyError('Key not found', 404);
    }
    return json({ ok: true, id });
  }

  if (request.method === 'GET' && path === '/admin/api/analytics') {
    const settings = await loadSettings(env);
    return json(await getAnalytics(env, settings, new URL(request.url).searchParams));
  }

  if (request.method === 'GET' && path === '/admin/api/settings') {
    const settings = await loadSettings(env);
    return json({
      ...settings,
      users: settings.users.map((u) => ({ name: u.name, createdAt: u.createdAt })),
    });
  }

  if (request.method === 'PUT' && path === '/admin/api/settings') {
    const body = (await request.json()) as Settings;
    const current = await loadSettings(env);
    const next: Settings = {
      ...current,
      ...body,
      // Users are managed via the users endpoints, never overwritten by a settings save.
      users: current.users,
    };
    const error = validateSettings(next);
    if (error) {
      throw new ProxyError(`Invalid settings: ${error}`, 400);
    }
    await saveSettings(env, next);
    return json({ ok: true, settings: { ...next, users: next.users.map((u) => ({ name: u.name, createdAt: u.createdAt })) } });
  }

  if (request.method === 'POST' && path === '/admin/api/users') {
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim();
    if (!name) throw new ProxyError('User name is required', 400);
    const settings = await loadSettings(env);
    if (settings.users.some((u) => u.name === name)) {
      throw new ProxyError('User already exists', 409);
    }
    const plainToken = `admusr_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
    settings.users.push({ name, hash: await sha256Hex(plainToken), createdAt: new Date().toISOString() });
    await saveSettings(env, settings);
    return json({ ok: true, token: plainToken, user: { name } }, 201);
  }

  if (request.method === 'DELETE' && path.startsWith('/admin/api/users/')) {
    const name = decodeURIComponent(path.slice('/admin/api/users/'.length));
    const settings = await loadSettings(env);
    const before = settings.users.length;
    settings.users = settings.users.filter((u) => u.name !== name);
    if (settings.users.length === before) throw new ProxyError('User not found', 404);
    await saveSettings(env, settings);
    return json({ ok: true, name });
  }

  throw new ProxyError('Admin route not found', 404);
}

// =============================================================================
// Image generation
// =============================================================================

async function handleImageGeneration(
  request: Request,
  env: Env,
  identity: ClientIdentity,
  agent: string,
  settings: Settings,
  ctx: ExecutionContext
): Promise<Response> {
  const startedAt = Date.now();
  const body = (await request.json()) as { prompt?: string; model?: string; seed?: number };
  const prompt = body.prompt?.trim();
  if (!prompt) {
    throw new ProxyError('Invalid request: prompt is required', 400);
  }
  if (prompt.length > 2000) {
    throw new ProxyError('Invalid request: prompt too long (max 2000)', 400);
  }
  const modelName = body.model?.trim() || 'sdxl-lightning';
  const known = IMAGE_MODELS[modelName];
  const seed =
    typeof body.seed === 'number' && Number.isFinite(body.seed)
      ? Math.floor(body.seed)
      : Math.floor(Math.random() * 1_000_000) + 1;

  const metricBase = {
    ts: startedAt,
    route: modelName,
    client: identity.label,
    agent,
    upstreamKey: '',
    capacityTotal: totalCapacity(settings),
    stream: 0,
    temperature: null,
    topP: null,
    maxTokens: null,
    messages: 1,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    toolCalls: 0,
    truncated: 0,
  };
  if (known === 'pollinations' || modelName === 'pollinations-flux') {
    const imageUrl = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${new URLSearchParams(
      { seed: String(seed), width: '1024', height: '1024', model: 'flux', nologo: 'true' }
    ).toString()}`;
    ctx.waitUntil(
      recordMetric(
        env,
        {
          ...metricBase,
          upstreamModel: 'pollinations/flux',
          status: 200,
          outcome: 'success',
          errorClass: 'none',
          latencyMs: Date.now() - startedAt,
          ttftMs: Date.now() - startedAt,
          generationMs: 0,
        },
        settings.retentionDays
      )
    );
    return json({
      created: Math.floor(Date.now() / 1000),
      model: modelName,
      seed,
      data: [{ url: imageUrl }],
    });
  }

  const cfModel =
    known ??
    (modelName.startsWith('@cf/') ? { id: modelName, contentType: 'image/png' } : undefined);
  if (!cfModel) {
    throw new ProxyError(`Unknown image model: ${modelName}`, 400);
  }
  if (!env.AI) {
    throw new ProxyError('Cloudflare AI binding not available', 500);
  }
  const result = await env.AI.run(cfModel.id, { prompt });
  ctx.waitUntil(recordMetric(env, { ...metricBase, upstreamModel: cfModel.id, status: 200, outcome: 'success', errorClass: 'none', latencyMs: Date.now() - startedAt, ttftMs: Date.now() - startedAt, generationMs: 0 }, settings.retentionDays));
  return new Response(result as BodyInit, {
    headers: { 'Content-Type': cfModel.contentType, ...CORS_HEADERS },
  });
}

// =============================================================================
// Speech handler (Edge TTS)
// =============================================================================

async function handleSpeech(
  request: Request,
  env: Env,
  identity: ClientIdentity,
  agent: string,
  settings: Settings,
  ctx: ExecutionContext
): Promise<Response> {
  const startedAt = Date.now();
  const body = (await request.json()) as {
    input?: string;
    text?: string;
    voice?: string;
  };
  const text = (body.input ?? body.text ?? '').trim();
  if (!text) {
    throw new ProxyError('Invalid request: text/input is required', 400);
  }
  if (text.length > 2000) {
    throw new ProxyError('Invalid request: text too long (max 2000)', 400);
  }
  const voice = body.voice?.trim() || DEFAULT_VOICE;
  try {
    const stream = await createAudioStream({ text, voice });
    // Prime the first chunk so upstream failures surface as 502, not a broken stream
    const reader = stream.getReader();
    const first = await reader.read();
    let firstConsumed = false;
    const primed = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (!firstConsumed) {
            firstConsumed = true;
            if (first.done) {
              controller.close();
              return;
            }
            controller.enqueue(first.value);
            return;
          }
          const chunk = await reader.read();
          if (chunk.done) {
            controller.close();
            return;
          }
          controller.enqueue(chunk.value);
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel(reason) {
        await reader.cancel(reason);
      },
    });
    ctx.waitUntil(recordMetric(env, {
      ts: startedAt, route: 'tts', upstreamModel: voice, client: identity.label, agent,
      upstreamKey: '', status: 200, outcome: 'success', errorClass: 'none',
      latencyMs: Date.now() - startedAt, ttftMs: Date.now() - startedAt, generationMs: 0,
      promptTokens: 0, completionTokens: 0, reasoningTokens: 0, toolCalls: 0, truncated: 0,
      stream: 1, temperature: null, topP: null, maxTokens: null, messages: 1,
      capacityTotal: totalCapacity(settings),
    }, settings.retentionDays));
    return new Response(primed, {
      headers: { 'Content-Type': 'audio/mpeg', ...CORS_HEADERS },
    });
  } catch (error) {
    console.error('[TTS] synthesis failed:', error);
    throw new ProxyError('Failed to synthesize audio', 502);
  }
}

// =============================================================================
// OpenAI-format handler (existing)
// =============================================================================

async function handleChatCompletion(
  request: Request,
  env: Env,
  identity: ClientIdentity,
  agent: string,
  settings: Settings,
  ctx: ExecutionContext
): Promise<Response> {
  const startedAt = Date.now();
  const body = await request.json();
  const chatRequest = body as OpenAIChatRequest;

  if (!chatRequest.messages || !Array.isArray(chatRequest.messages)) {
    throw new ProxyError('Invalid request: messages array is required', 400);
  }
  if (!chatRequest.model) {
    throw new ProxyError('Invalid request: model is required', 400);
  }
  if (settings.maxTokensCap > 0) {
    chatRequest.max_tokens = Math.min(chatRequest.max_tokens ?? settings.maxTokensCap, settings.maxTokensCap);
  }

  const baseMetric = {
    ts: startedAt,
    route: chatRequest.model,
    upstreamModel: '',
    client: identity.label,
    agent,
    upstreamKey: '',
    capacityTotal: totalCapacity(settings),
    stream: chatRequest.stream ? 1 : 0,
    temperature: chatRequest.temperature ?? null,
    topP: chatRequest.top_p ?? null,
    maxTokens: chatRequest.max_tokens ?? null,
    messages: chatRequest.messages.length,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    toolCalls: 0,
    truncated: 0,
  };
  const record = (partial: Record<string, unknown>) =>
    recordMetric(env, { ...baseMetric, ...partial } as never, settings.retentionDays);

  // Model governor: per-model RPM limit from Settings engages before upstream.
  const limit = settings.modelLimits[chatRequest.model];
  if (limit && limit > 0 && (await routeUsageLastMinute(env, chatRequest.model)) >= limit) {
    ctx.waitUntil(record({ status: 429, outcome: 'governor', errorClass: 'rate_limit', latencyMs: Date.now() - startedAt, ttftMs: 0, generationMs: 0 }));
    throw new ProxyError(`Model limit reached for ${chatRequest.model} (${limit}/min)`, 429);
  }

  console.log(`[Worker] model=${chatRequest.model} stream=${chatRequest.stream || false}`);

  const router = new Router(env, await loadEffectiveRoutes(env, settings), {
    settings,
    keyUsage: await keyUsageLastMinute(env),
  });
  let response;
  try {
    response = await router.executeWithFallback(chatRequest, 'openai');
  } catch (error) {
    const status = error instanceof ProxyError ? error.statusCode : 500;
    ctx.waitUntil(
      record({
        status,
        outcome: 'upstream_error',
        errorClass: errorClassForStatus(status),
        latencyMs: Date.now() - startedAt,
        ttftMs: Date.now() - startedAt,
        generationMs: 0,
      })
    );
    throw error;
  }
  const latencyMs = Date.now() - startedAt;

  if (!response.success) {
    const status = response.statusCode || 500;
    ctx.waitUntil(record({
      status, outcome: 'upstream_error', errorClass: errorClassForStatus(status),
      upstreamModel: response.upstreamModel ?? '', upstreamKey: response.keyUsed ?? '',
      latencyMs, ttftMs: latencyMs, generationMs: 0,
    }));
    throw new ProxyError(response.error || 'All providers failed', status);
  }

  if (response.stream) {
    const wrapped = wrapStreamForMetrics(response.stream, (stats, totalMs) => {
      void record({
        status: 200, outcome: 'success', errorClass: 'none',
        upstreamModel: stats.upstreamModel || response.upstreamModel || '',
        upstreamKey: response.keyUsed ?? '',
        latencyMs: totalMs, ttftMs: stats.ttftMs || totalMs,
        generationMs: stats.ttftMs ? totalMs - stats.ttftMs : 0,
        promptTokens: stats.promptTokens, completionTokens: stats.completionTokens,
        reasoningTokens: stats.reasoningTokens, toolCalls: stats.toolCalls,
        truncated: stats.truncated,
      });
    }, startedAt);
    return new Response(wrapped, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...CORS_HEADERS,
      },
    });
  }

  const usage = (response.response as { usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } } } | undefined)?.usage;
  const choice = response.response?.choices?.[0];
  ctx.waitUntil(record({
    status: 200, outcome: 'success', errorClass: 'none',
    upstreamModel: response.upstreamModel ?? '', upstreamKey: response.keyUsed ?? '',
    latencyMs, ttftMs: latencyMs, generationMs: 0,
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    toolCalls: choice?.message?.tool_calls?.length ?? 0,
    truncated: choice?.finish_reason === 'length' ? 1 : 0,
  }));
  return json(response.response);
}

// =============================================================================
// Anthropic-format handler (dual-path)
// =============================================================================

async function handleAnthropicChat(
  request: Request,
  env: Env,
  identity: ClientIdentity,
  agent: string,
  settings: Settings,
  ctx: ExecutionContext
): Promise<Response> {
  const body: AnthropicRequest = await request.json();

  if (!body.messages || !Array.isArray(body.messages)) {
    throw new ProxyError('Invalid request: messages array is required', 400);
  }
  if (!body.model) {
    throw new ProxyError('Invalid request: model is required', 400);
  }

  console.log(`[AnthropicHandler] model=${body.model} stream=${body.stream || false}`);
  void identity; void agent; void ctx;

  const router = new Router(env, await loadEffectiveRoutes(env, settings), {
    settings,
    keyUsage: await keyUsageLastMinute(env),
  });
  const providers = router.getProvidersForModel(body.model);

  const hasAnthropicNative = providers.some(
    (p) => p.provider === 'anthropic' || p.provider === 'anthropic-compatible'
  );

  if (hasAnthropicNative) {
    return await handleAnthropicNativePath(body, providers, env, router);
  }

  return await handleAnthropicConversionPath(body, router);
}

async function handleAnthropicNativePath(
  body: AnthropicRequest,
  providers: ProviderConfig[],
  env: Env,
  router: Router
): Promise<Response> {
  let lastError: unknown = null;

  for (const config of providers) {
    if (config.provider !== 'anthropic' && config.provider !== 'anthropic-compatible') {
      continue;
    }

    let provider: AnthropicProvider;
    try {
      provider = createProvider(config, env) as AnthropicProvider;
    } catch (error) {
      console.error(
        `[AnthropicNativePath] Failed to create provider ${config.provider}/${config.model}:`,
        error
      );
      lastError = error;
      continue;
    }
    const apiKeys = resolveApiKeys(config, env);

    if (apiKeys.length === 0) {
      console.warn(
        `[AnthropicNativePath] No API keys found for provider: ${config.provider}/${config.model}`
      );
      lastError = new Error(`No API keys configured for ${config.provider}/${config.model}`);
      continue;
    }

    for (const apiKey of apiKeys) {
      try {
        const timeoutMs = Number(env.PROVIDER_TIMEOUT_MS) || undefined;
        const result = await withTimeout(provider.nativeChat(body, apiKey), timeoutMs);
        if (!result.success) {
          lastError = result.error;
          if (!shouldRotateKey(result.statusCode, result.error)) {
            break;
          }
          continue;
        }

        if (result.stream) {
          return new Response(result.stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              ...CORS_HEADERS,
            },
          });
        }

        return json(result.rawResponse);
      } catch (error: unknown) {
        lastError = error;
        if (!isRetryableError(error)) {
          break;
        }
      }
    }
  }

  const otherProviders = providers.filter(
    (p) => p.provider !== 'anthropic' && p.provider !== 'anthropic-compatible'
  );
  if (otherProviders.length > 0) {
    return await handleAnthropicConversionPath(body, router, otherProviders);
  }

  const err = lastError as { message?: string; statusCode?: number } | null;
  throw new ProxyError(
    `All providers failed: ${err?.message || lastError}`,
    err?.statusCode || 500
  );
}

async function handleAnthropicConversionPath(
  body: AnthropicRequest,
  router: Router,
  overrideProviders?: ProviderConfig[]
): Promise<Response> {
  const openaiRequest = convertAnthropicRequestToOpenAI(body);

  const response = await router.executeWithFallback(openaiRequest, 'anthropic', overrideProviders);

  if (!response.success) {
    throw new ProxyError(response.error || 'All providers failed', response.statusCode || 500);
  }

  if (response.stream) {
    const adapter = new AnthropicStreamAdapter(body.model, `msg_${generateId()}`);
    const anthropicStream = response.stream.pipeThrough(adapter.createTransformStream());
    return new Response(anthropicStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...CORS_HEADERS,
      },
    });
  }

  if (!response.response) {
    throw new ProxyError('Provider returned success but no response data', 502);
  }

  return json(convertOpenAIResponseToAnthropic(response.response, body.model));
}

// =============================================================================
// Helpers
// =============================================================================

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function extractToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    return authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  }
  return request.headers.get('x-api-key');
}

async function verifyAuth(
  request: Request,
  env: Env,
  settings: Settings
): Promise<ClientIdentity | null> {
  const token = extractToken(request);
  if (!token) return null;

  if (settings.authMode !== 'keys' && env.PROXY_AUTH_TOKEN && constantTimeEqual(token, env.PROXY_AUTH_TOKEN)) {
    return { label: 'Master', kind: 'master' };
  }
  if (settings.authMode !== 'master') {
    const record = await findClientKey(env, token);
    if (record) return { label: record.name, kind: 'client-key' };
  }
  return null;
}

async function verifyAdmin(request: Request, env: Env): Promise<boolean> {
  const token = request.headers.get('x-admin-token') ?? extractToken(request);
  if (!token) return false;
  if (env.ADMIN_TOKEN && constantTimeEqual(token, env.ADMIN_TOKEN)) return true;
  // Dashboard users from Settings (tokens stored hashed)
  const settings = await loadSettings(env);
  if (settings.users.length) {
    const hash = await sha256Hex(token);
    if (settings.users.some((u) => u.hash === hash)) return true;
  }
  if (!env.ADMIN_TOKEN && settings.users.length === 0) {
    console.error('[verifyAdmin] ADMIN_TOKEN not configured — rejecting admin requests');
  }
  return false;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function resolveApiKeys(config: ProviderConfig, env: Env): string[] {
  const keys: string[] = [];
  for (const keyName of config.apiKeys ?? []) {
    const value = env[keyName];
    if (value) {
      keys.push(value);
    } else {
      console.warn(`[resolveApiKeys] API key not found in env: ${keyName}`);
    }
  }
  return keys;
}
