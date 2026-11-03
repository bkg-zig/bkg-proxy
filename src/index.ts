import { Env, OpenAIChatRequest, ProviderConfig, ProviderResponse, RouteConfig } from './types';
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
  hashPassword,
  verifyPassword,
  Settings,
} from './store';
import {
  recordMetric,
  keyUsageLastMinute,
  routeUsageLastMinute,
  errorClassForStatus,
  wrapStreamForMetrics,
} from './metrics';
import { getAnalytics } from './analytics';
import { addDocument, listDocuments, deleteDocument, queryRag, embedTexts } from './rag';
import { runDiscovery, loadDiscoveryState, mergeDiscoveredRoutes, addToBlocklist, clearBlocklist } from './discovery';

async function effectiveRoutes(env: Env, settings: Settings) {
  const routes = await loadEffectiveRoutes(env, settings);
  return mergeDiscoveredRoutes(env, settings, routes);
}
import { slotCounts, joinQueue, queueHeartbeat, isQueueHead, leaveQueue } from './limiter';

interface ClientIdentity {
  label: string;
  kind: string;
}
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
  'flux-schnell': { id: '@cf/black-forest-labs/flux-1-schnell', contentType: 'image/jpeg' },
  'lucid-origin': { id: '@cf/leonardo/lucid-origin', contentType: 'image/jpeg' },
  'pollinations-flux': 'pollinations',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      const url = new URL(request.url);
      // Hand-typed clients often send //anthropic/ — collapse duplicate slashes.
      const path = url.pathname.replace(/\/{2,}/g, '/');

      // Health check — no auth required
      if ((path === '/health' || path === '/') && request.method === 'GET') {
        return json({
          status: 'ok',
          service: 'ai-worker-proxy',
          dashboard: '/dashboard',
          timestamp: new Date().toISOString(),
        });
      }

      // React studio frontend — the page itself is public, all data/actions need auth.
      // On studio.eysho.info the app lives directly on the domain (no /dashboard),
      // the API stays on api.eysho.info under /v1. /dashboard keeps working elsewhere.
      const isStudioHost = url.hostname === 'studio.eysho.info';
      const isApiPath =
        path.startsWith('/v1/') ||
        path.startsWith('/admin/') ||
        path.startsWith('/anthropic') ||
        path === '/health' ||
        path === '/tts' ||
        path === '/voices';
      if (
        request.method === 'GET' &&
        (path === '/dashboard' ||
          path.startsWith('/dashboard/') ||
          path.startsWith('/assets/') ||
          (isStudioHost && !isApiPath))
      ) {
        if (!env.ASSETS) {
          return new Response('Frontend not built. Run: npm run build:web', { status: 503 });
        }
        const assetUrl = new URL(request.url);
        assetUrl.pathname = path.startsWith('/dashboard/')
          ? path.slice('/dashboard'.length)
          : path === '/dashboard' || (isStudioHost && !path.startsWith('/assets/'))
            ? '/'
            : path;
        if (assetUrl.pathname === '') assetUrl.pathname = '/';
        return env.ASSETS.fetch(new Request(assetUrl, request));
      }

      // Admin API — separate ADMIN_TOKEN / user-session auth
      if (path === '/admin/api/login' || path === '/admin/api/logout') {
        return await handleLogin(request, env, path);
      }
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
        return json({ object: 'list', data: await cachedModels(env, settings) });
      }

      // Image generation — POST only
      if (request.method === 'POST' && path === '/v1/images/generations') {
        return await handleImageGeneration(request, env, identity, agent, settings, ctx);
      }

      // Speech (Microsoft Edge TTS) — OpenAI-style and upstream-style
      if (request.method === 'POST' && (path === '/v1/audio/speech' || path === '/tts')) {
        return await handleSpeech(request, env, identity, agent, settings, ctx);
      }
      if (
        request.method === 'GET' &&
        (path === '/v1/audio/voices' || path === '/v1/voices' || path === '/voices')
      ) {
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

      // Embeddings (OpenAI-style, Workers AI bge-m3)
      if (request.method === 'POST' && path === '/v1/embeddings') {
        const body = (await request.json()) as { input?: string | string[] };
        const texts = Array.isArray(body.input) ? body.input : body.input ? [body.input] : [];
        if (!texts.length) throw new ProxyError('Invalid request: input is required', 400);
        const vectors = await embedTexts(env, texts);
        return json({
          object: 'list',
          model: '@cf/baai/bge-m3',
          data: vectors.map((embedding, index) => ({ object: 'embedding', index, embedding })),
          usage: { prompt_tokens: 0, total_tokens: 0 },
        });
      }

      // Knowledge base (RAG, Vectorize + D1 like DevAssist/Tocyn)
      if (request.method === 'POST' && path === '/v1/rag/documents') {
        const body = (await request.json()) as { title?: string; text?: string };
        if (!body.text?.trim()) throw new ProxyError('Invalid request: text is required', 400);
        const doc = await addDocument(
          env,
          identity.label,
          body.title?.trim() || 'Ohne Titel',
          body.text
        );
        return json({ ok: true, document: doc }, 201);
      }
      if (request.method === 'GET' && path === '/v1/rag/documents') {
        return json({ documents: await listDocuments(env) });
      }
      if (request.method === 'DELETE' && path.startsWith('/v1/rag/documents/')) {
        const id = decodeURIComponent(path.slice('/v1/rag/documents/'.length));
        const deleted = await deleteDocument(env, id);
        if (!deleted) throw new ProxyError('Document not found', 404);
        return json({ ok: true, id });
      }
      if (request.method === 'POST' && path === '/v1/rag/query') {
        return await handleRagQuery(request, env, settings);
      }

      // Speech-to-text (Whisper on Workers AI)
      if (request.method === 'POST' && path === '/v1/audio/transcriptions') {
        return await handleTranscription(request, env);
      }

      // Anthropic-format chat completions — POST only
      // (/anthropic and /anthropic/ are accepted as short aliases for hand-typed curls;
      // SDKs use /anthropic/v1/messages)
      if (
        request.method === 'POST' &&
        (path === '/anthropic/v1/messages' ||
          path === '/anthropic/messages' ||
          path === '/anthropic' ||
          path === '/anthropic/')
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
      const requestPath = new URL(request.url).pathname;
      if (requestPath.startsWith('/anthropic')) {
        const proxyError = error instanceof ProxyError ? error : null;
        const status = proxyError?.statusCode ?? 500;
        const type =
          status === 401
            ? 'authentication_error'
            : status === 404
              ? 'not_found_error'
              : status === 429
                ? 'rate_limit_error'
                : status === 400
                  ? 'invalid_request_error'
                  : 'api_error';
        return new Response(
          JSON.stringify({
            type: 'error',
            error: { type, message: proxyError?.message ?? 'Internal server error' },
          }),
          { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      }
      const errorResponse = createErrorResponse(error);
      const headers = new Headers(errorResponse.headers);
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        headers.set(key, value);
      }
      return new Response(errorResponse.body, { status: errorResponse.status, headers });
    }
  },

  // Daily automatic model discovery (Cron Trigger in wrangler.toml)
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const settings = await loadSettings(env);
    if (settings.autoDiscover === false) return;
    ctx.waitUntil(runDiscovery(env, 30));
  },
};

// =============================================================================
// Admin API (dashboard backend, ADMIN_TOKEN)
// =============================================================================

async function handleAdmin(request: Request, env: Env, path: string): Promise<Response> {
  const admin = await verifyAdminIdentity(request, env);
  if (!admin) {
    throw new ProxyError('Admin unauthorized', 401, 'invalid_admin_auth');
  }
  const isAdmin = admin.role === 'admin' || admin.role === 'superuser';
  const adminOnly =
    (request.method === 'PUT' && path === '/admin/api/settings') ||
    path.startsWith('/admin/api/users') ||
    (request.method !== 'GET' && path.startsWith('/admin/api/models')) ||
    path === '/admin/api/routes/reset';
  if (adminOnly && !isAdmin) {
    throw new ProxyError('Admin role required', 403, 'forbidden');
  }

  if (request.method === 'GET' && path === '/admin/api/overview') {
    const routes = await effectiveRoutes(env, await loadSettings(env));
    const clientKeys = (await listClientKeys(env))
      .filter((k) => admin.role !== 'user' || (k.owner ?? 'Master') === admin.name)
      .map(({ id, name, prefix, createdAt, owner }) => ({
        id,
        name,
        prefix,
        createdAt,
        owner: owner ?? 'Master',
      }));
    return json({
      me: admin,
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
    await invalidateModelsCache(env);
    return json({ ok: true, name, routes });
  }

  if (request.method === 'DELETE' && path.startsWith('/admin/api/models/')) {
    const name = decodeURIComponent(path.slice('/admin/api/models/'.length));
    const routes: RouteConfig = await loadEffectiveRoutes(env);
    if (!routes[name]) {
      // Auto-discovered model: hide it via the blocklist so it stays gone.
      await addToBlocklist(env, name);
      await invalidateModelsCache(env);
      return json({ ok: true, name, discovered: true });
    }
    delete routes[name];
    await saveRoutes(env, routes);
    await addToBlocklist(env, name);
    await invalidateModelsCache(env);
    await invalidateModelsCache(env);
    return json({ ok: true, name, routes });
  }

  if (request.method === 'POST' && path === '/admin/api/routes/reset') {
    await resetRoutes(env);
    await clearBlocklist(env);
    await invalidateModelsCache(env);
    return json({ ok: true, routes: await loadEffectiveRoutes(env) });
  }

  if (request.method === 'POST' && path === '/admin/api/keys') {
    const body = (await request.json()) as { name?: string };
    const { record, plainKey } = await createClientKey(env, body.name ?? '', admin.name);
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
    if (admin.role === 'user') {
      const owned = (await listClientKeys(env)).find((k) => k.id === id);
      if (!owned || (owned.owner ?? 'Master') !== admin.name) {
        throw new ProxyError('Key not found', 404);
      }
    }
    const deleted = await deleteClientKey(env, id);
    if (!deleted) {
      throw new ProxyError('Key not found', 404);
    }
    return json({ ok: true, id });
  }

  if (request.method === 'GET' && path === '/admin/api/discovery') {
    const state = await loadDiscoveryState(env);
    const models = Object.values(state.models).sort((a, b) => a.id.localeCompare(b.id));
    return json({
      lastRun: state.lastRun,
      summary: state.lastSummary,
      counts: {
        works: models.filter((m) => m.status === 'works').length,
        fails: models.filter((m) => m.status === 'fails').length,
        unchecked: models.filter((m) => m.status === 'unchecked').length,
      },
      models,
    });
  }

  if (request.method === 'POST' && path === '/admin/api/discovery/run') {
    const state = await runDiscovery(env, 24);
    await invalidateModelsCache(env);
    return json({ ok: true, summary: state.lastSummary, lastRun: state.lastRun });
  }

  if (request.method === 'GET' && path === '/admin/api/analytics') {
    const settings = await loadSettings(env);
    return json(await getAnalytics(env, settings, new URL(request.url).searchParams));
  }

  if (request.method === 'GET' && path === '/admin/api/settings') {
    const settings = await loadSettings(env);
    return json({
      ...settings,
      users: settings.users.map((u) => ({ name: u.name, role: u.role, createdAt: u.createdAt })),
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
    return json({
      ok: true,
      settings: {
        ...next,
        users: next.users.map((u) => ({ name: u.name, role: u.role, createdAt: u.createdAt })),
      },
    });
  }

  if (request.method === 'POST' && path === '/admin/api/users') {
    const body = (await request.json()) as { name?: string; password?: string; role?: string };
    const name = body.name?.trim();
    if (!name) throw new ProxyError('User name is required', 400);
    const role = body.role === 'user' ? 'user' : 'admin';
    const settings = await loadSettings(env);
    if (settings.users.some((u) => u.name === name)) {
      throw new ProxyError('User already exists', 409);
    }
    const user: Settings['users'][number] = {
      name,
      role,
      sessionVersion: 1,
      createdAt: new Date().toISOString(),
    };
    let plainToken: string | undefined;
    if (body.password) {
      if (body.password.length < 8)
        throw new ProxyError('Password must be at least 8 characters', 400);
      user.passwordHash = await hashPassword(body.password);
    } else {
      plainToken = `admusr_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
      user.hash = await sha256Hex(plainToken);
    }
    settings.users.push(user);
    await saveSettings(env, settings);
    return json({ ok: true, token: plainToken, user: { name, role } }, 201);
  }

  if (request.method === 'POST' && /^\/admin\/api\/users\/[^/]+\/password$/.test(path)) {
    const name = decodeURIComponent(path.slice('/admin/api/users/'.length, -'/password'.length));
    const body = (await request.json()) as { password?: string };
    if (!body.password || body.password.length < 8) {
      throw new ProxyError('Password must be at least 8 characters', 400);
    }
    const settings = await loadSettings(env);
    const target = settings.users.find((u) => u.name === name);
    if (!target) throw new ProxyError('User not found', 404);
    if (target.role === 'superuser' && admin.name !== target.name) {
      throw new ProxyError('The superuser password can only be changed by the superuser', 403);
    }
    target.passwordHash = await hashPassword(body.password);
    target.sessionVersion += 1; // changing a password logs the user's other sessions out
    await saveSettings(env, settings);
    return json({ ok: true, name });
  }

  if (request.method === 'DELETE' && path.startsWith('/admin/api/users/')) {
    const name = decodeURIComponent(path.slice('/admin/api/users/'.length));
    const settings = await loadSettings(env);
    const target = settings.users.find((u) => u.name === name);
    if (target?.role === 'superuser') {
      throw new ProxyError('The superuser cannot be deleted', 403);
    }
    // Deleting a user revokes their client keys and pulls their NIM keys from their pool view.
    for (const key of await listClientKeys(env)) {
      if ((key.owner ?? 'Master') === name) await deleteClientKey(env, key.id);
    }
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
  const rawResult: unknown = await env.AI.run(cfModel.id, { prompt });
  // Some models answer with JSON {image: base64} instead of binary image bytes.
  let result: unknown = rawResult;
  let contentType = cfModel.contentType;
  if (
    rawResult &&
    typeof rawResult === 'object' &&
    typeof (rawResult as { image?: unknown }).image === 'string'
  ) {
    const base64 = (rawResult as { image: string }).image.replace(/^data:image\/\w+;base64,/, '');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    result = bytes;
    contentType = 'image/jpeg';
  }
  ctx.waitUntil(
    recordMetric(
      env,
      {
        ...metricBase,
        upstreamModel: cfModel.id,
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
  return new Response(result as BodyInit, {
    headers: { 'Content-Type': contentType, ...CORS_HEADERS },
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
    engine?: string;
  };
  const text = (body.input ?? body.text ?? '').trim();
  if (!text) {
    throw new ProxyError('Invalid request: text/input is required', 400);
  }
  if (text.length > 2000) {
    throw new ProxyError('Invalid request: text too long (max 2000)', 400);
  }
  const voice = body.voice?.trim() || DEFAULT_VOICE;
  if (body.engine === 'melotts') {
    if (!env.AI) throw new ProxyError('Cloudflare AI binding not available', 500);
    const result = (await env.AI.run('@cf/myshell-ai/melotts', {
      prompt: text,
    })) as { audio?: string };
    if (!result.audio) throw new ProxyError('MeloTTS returned no audio', 502);
    const binary = atob(result.audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    ctx.waitUntil(
      recordMetric(
        env,
        {
          ts: startedAt,
          route: 'tts-melotts',
          upstreamModel: '@cf/myshell-ai/melotts',
          client: identity.label,
          agent,
          upstreamKey: '',
          status: 200,
          outcome: 'success',
          errorClass: 'none',
          latencyMs: Date.now() - startedAt,
          ttftMs: Date.now() - startedAt,
          generationMs: 0,
          promptTokens: 0,
          completionTokens: 0,
          reasoningTokens: 0,
          toolCalls: 0,
          truncated: 0,
          stream: 0,
          temperature: null,
          topP: null,
          maxTokens: null,
          messages: 1,
          capacityTotal: totalCapacity(settings),
        },
        settings.retentionDays
      )
    );
    return new Response(bytes, { headers: { 'Content-Type': 'audio/wav', ...CORS_HEADERS } });
  }
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
    ctx.waitUntil(
      recordMetric(
        env,
        {
          ts: startedAt,
          route: 'tts',
          upstreamModel: voice,
          client: identity.label,
          agent,
          upstreamKey: '',
          status: 200,
          outcome: 'success',
          errorClass: 'none',
          latencyMs: Date.now() - startedAt,
          ttftMs: Date.now() - startedAt,
          generationMs: 0,
          promptTokens: 0,
          completionTokens: 0,
          reasoningTokens: 0,
          toolCalls: 0,
          truncated: 0,
          stream: 1,
          temperature: null,
          topP: null,
          maxTokens: null,
          messages: 1,
          capacityTotal: totalCapacity(settings),
        },
        settings.retentionDays
      )
    );
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
  const chatRequest = body as OpenAIChatRequest & { user?: string; conversation_id?: string };

  if (!chatRequest.messages || !Array.isArray(chatRequest.messages)) {
    throw new ProxyError('Invalid request: messages array is required', 400);
  }
  if (!chatRequest.model) {
    throw new ProxyError('Invalid request: model is required', 400);
  }
  if (settings.maxTokensCap > 0) {
    chatRequest.max_tokens = Math.min(
      chatRequest.max_tokens ?? settings.maxTokensCap,
      settings.maxTokensCap
    );
  }

  // Optional absolute deadline for the whole request (queue + retries + upstream).
  const deadlineHeader = Number(request.headers.get('X-Nim-Proxy-Deadline-Ms') ?? '');
  const overallDeadline =
    Number.isFinite(deadlineHeader) && deadlineHeader > 0
      ? startedAt + deadlineHeader
      : startedAt + 300_000;
  const queueDeadline = Math.min(
    overallDeadline,
    startedAt + (settings.maxWaitSec > 0 ? settings.maxWaitSec * 1000 : 120_000)
  );

  // Sticky conversation: prefer the key this conversation used last time.
  const conversationSeed =
    request.headers.get('X-Conversation-Id') ??
    request.headers.get('X-Session-Id') ??
    chatRequest.conversation_id ??
    chatRequest.user ??
    `${identity.label}:${JSON.stringify(chatRequest.messages[0]?.content ?? '').slice(0, 200)}`;
  const stickyId = await sha256Hex(`${identity.label}|${conversationSeed}`);
  let stickyKey = '';
  try {
    stickyKey = (await env.ADMIN_KV?.get(`sticky:${stickyId}`)) ?? '';
  } catch {
    stickyKey = '';
  }

  // stream_options injection for exact usage (one retry untouched if rejected).
  const noInjectModels = await loadNoInjectModels(env);
  let injected = false;
  if (
    chatRequest.stream &&
    !settings.strictPassthrough &&
    !noInjectModels.includes(chatRequest.model)
  ) {
    chatRequest.stream_options = { include_usage: true };
    injected = true;
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

  // Model governor: hard per-model RPM limit from Settings.
  const limit = settings.modelLimits[chatRequest.model];
  if (limit && limit > 0 && (await routeUsageLastMinute(env, chatRequest.model)) >= limit) {
    ctx.waitUntil(
      record({
        status: 429,
        outcome: 'governor',
        errorClass: 'rate_limit',
        latencyMs: Date.now() - startedAt,
        ttftMs: 0,
        generationMs: 0,
      })
    );
    throw new ProxyError(`Model limit reached for ${chatRequest.model} (${limit}/min)`, 429);
  }

  // Model pressure: a model that exhausted its own worker pool backs off
  // adaptively instead of burning healthy keys on failover attempts.
  const pressure = await loadModelPressure(env, chatRequest.model);
  if (pressure && pressure.until > Date.now()) {
    const waitMs = pressure.until - Date.now();
    if (waitMs > queueDeadline - Date.now()) {
      ctx.waitUntil(
        record({
          status: 503,
          outcome: 'model_pressure',
          errorClass: 'upstream_5xx',
          latencyMs: Date.now() - startedAt,
          ttftMs: 0,
          generationMs: 0,
        })
      );
      throw new ProxyError(
        `Model ${chatRequest.model} is under pressure, retry after ${Math.ceil(waitMs / 1000)}s`,
        503
      );
    }
    await sleep(waitMs);
  }

  const attempt = async (): Promise<ProviderResponse> => {
    const router = new Router(env, await effectiveRoutes(env, settings), {
      settings,
      keyUsage: await slotCounts(env),
      stickyKey,
    });
    return router.executeWithFallback(chatRequest, 'openai');
  };

  const executeQueued = async (onWait?: () => void): Promise<ProviderResponse> => {
    const ticket = await joinQueue(env, identity.label, chatRequest.model);
    try {
      let upstreamRetries = 0;
      for (;;) {
        await queueHeartbeat(env, ticket);
        if (await isQueueHead(env, ticket)) {
          let response = await attempt();
          // Injection rejected upstream: remember the model, retry untouched once.
          if (
            injected &&
            !response.success &&
            (response.error ?? '').toString().toLowerCase().includes('stream_options')
          ) {
            await rememberNoInjectModel(env, chatRequest.model);
            delete chatRequest.stream_options;
            injected = false;
            response = await attempt();
          }
          if (response.windowFull) {
            // All keys inside their window: queue, do not fail.
          } else if (
            !response.success &&
            chatRequest.stream &&
            [429, 500, 502, 503, 504].includes(response.statusCode ?? 0) &&
            Date.now() < queueDeadline &&
            upstreamRetries < 20
          ) {
            // Ride out upstream errors between keys while the client waits.
            upstreamRetries++;
            await noteModelPressure(env, chatRequest.model, response.statusCode ?? 503);
          } else {
            return response;
          }
        }
        if (Date.now() >= queueDeadline || Date.now() >= overallDeadline) {
          return {
            success: false,
            error: 'Timed out waiting for an upstream key slot',
            statusCode: 429,
            windowFull: true,
          };
        }
        onWait?.();
        await sleep(450);
      }
    } catch (error) {
      // Unknown-model etc.: count it, then rethrow for the normal error mapping.
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
    } finally {
      await leaveQueue(env, ticket);
    }
  };

  const rememberSticky = (response: ProviderResponse) => {
    if (response.keyUsed && env.ADMIN_KV) {
      ctx.waitUntil(
        env.ADMIN_KV.put(`sticky:${stickyId}`, response.keyUsed, { expirationTtl: 3600 }).catch(
          () => undefined
        )
      );
    }
  };

  const finishSuccess = (response: ProviderResponse) => {
    rememberSticky(response);
    void clearModelPressure(env, chatRequest.model);
    const latencyMs = Date.now() - startedAt;
    const usage = (
      response.response as
        | {
            usage?: {
              prompt_tokens?: number;
              completion_tokens?: number;
              completion_tokens_details?: { reasoning_tokens?: number };
            };
          }
        | undefined
    )?.usage;
    const choice = response.response?.choices?.[0];
    ctx.waitUntil(
      record({
        status: 200,
        outcome: 'success',
        errorClass: 'none',
        upstreamModel: response.upstreamModel ?? '',
        upstreamKey: response.keyUsed ?? '',
        latencyMs,
        ttftMs: latencyMs,
        generationMs: 0,
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
        toolCalls: choice?.message?.tool_calls?.length ?? 0,
        truncated: choice?.finish_reason === 'length' ? 1 : 0,
      })
    );
  };

  const finishFailure = (response: ProviderResponse) => {
    const status = response.statusCode || 500;
    if ([429, 503].includes(status) && !response.windowFull) {
      void noteModelPressure(env, chatRequest.model, status);
    }
    ctx.waitUntil(
      record({
        status,
        outcome: response.windowFull ? 'window_full' : 'upstream_error',
        errorClass: errorClassForStatus(status),
        upstreamModel: response.upstreamModel ?? '',
        upstreamKey: response.keyUsed ?? '',
        latencyMs: Date.now() - startedAt,
        ttftMs: Date.now() - startedAt,
        generationMs: 0,
      })
    );
  };

  console.log(`[Worker] model=${chatRequest.model} stream=${chatRequest.stream || false}`);

  if (chatRequest.stream) {
    // Commit to the SSE stream immediately; heartbeat comments keep every
    // OpenAI client happy while we queue or ride out upstream errors.
    const encoder = new TextEncoder();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (text: string) => {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            /* client gone */
          }
        };
        heartbeat = setInterval(
          () => send(': heartbeat\n\n'),
          Math.max(settings.heartbeatSec, 1) * 1000
        );
        try {
          const response = await executeQueued();
          if (heartbeat) clearInterval(heartbeat);
          if (!response.success || !response.stream) {
            finishFailure(response);
            const status = response.statusCode || 500;
            send(
              `data: ${JSON.stringify({ error: { message: response.error || 'All providers failed', type: 'proxy_error', code: status } })}\n\n`
            );
            send(
              `data: ${JSON.stringify({ id: 'chatcmpl-error', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: chatRequest.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`
            );
            send('data: [DONE]\n\n');
            controller.close();
            return;
          }
          rememberSticky(response);
          void clearModelPressure(env, chatRequest.model);
          const wrapped = wrapStreamForMetrics(
            response.stream,
            (stats, totalMs) => {
              void record({
                status: 200,
                outcome: 'success',
                errorClass: 'none',
                upstreamModel: stats.upstreamModel || response.upstreamModel || '',
                upstreamKey: response.keyUsed ?? '',
                latencyMs: totalMs,
                ttftMs: stats.ttftMs || totalMs,
                generationMs: stats.ttftMs ? totalMs - stats.ttftMs : 0,
                promptTokens: stats.promptTokens,
                completionTokens: stats.completionTokens,
                reasoningTokens: stats.reasoningTokens,
                toolCalls: stats.toolCalls,
                truncated: stats.truncated,
              });
            },
            startedAt
          );
          // Idle guard: cut streams that stall mid-generation.
          const reader = wrapped.getReader();
          const idleMs = Math.max(settings.streamIdleSec, 5) * 1000;
          for (;;) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const chunk = await Promise.race([
              reader.read(),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('stream idle timeout')), idleMs);
              }),
            ]).finally(() => {
              if (timer) clearTimeout(timer);
            });
            if (chunk.done) break;
            controller.enqueue(chunk.value);
            if (Date.now() >= overallDeadline) {
              await reader.cancel('deadline exceeded');
              break;
            }
          }
          controller.close();
        } catch (error) {
          if (heartbeat) clearInterval(heartbeat);
          try {
            send(
              `data: ${JSON.stringify({ error: { message: error instanceof Error ? error.message : 'Stream failed', type: 'proxy_error' } })}\n\n`
            );
            send('data: [DONE]\n\n');
            controller.close();
          } catch {
            /* already closed */
          }
        }
      },
      cancel() {
        if (heartbeat) clearInterval(heartbeat);
      },
    });
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...CORS_HEADERS,
      },
    });
  }

  const response = await executeQueued();
  if (!response.success) {
    finishFailure(response);
    throw new ProxyError(response.error || 'All providers failed', response.statusCode || 500);
  }
  if (response.stream) {
    // Non-streaming client but provider returned a stream (should not happen).
    return new Response(response.stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...CORS_HEADERS,
      },
    });
  }
  finishSuccess(response);
  return json(response.response);
}

function sleep(msDelay: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, msDelay));
}

async function loadNoInjectModels(env: Env): Promise<string[]> {
  try {
    const raw = await env.ADMIN_KV?.get('no_usage_injection');
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function rememberNoInjectModel(env: Env, model: string): Promise<void> {
  try {
    const models = await loadNoInjectModels(env);
    if (!models.includes(model)) {
      models.push(model);
      await env.ADMIN_KV?.put('no_usage_injection', JSON.stringify(models));
    }
  } catch {
    // Injection memory is an optimisation; never fail a request over it.
  }
}

interface ModelPressure {
  until: number;
  level: number;
}

async function loadModelPressure(env: Env, route: string): Promise<ModelPressure | null> {
  try {
    const raw = await env.ADMIN_KV?.get(`pressure:${route}`);
    return raw ? (JSON.parse(raw) as ModelPressure) : null;
  } catch {
    return null;
  }
}

async function noteModelPressure(env: Env, route: string, status: number): Promise<void> {
  if (![429, 503].includes(status)) return;
  try {
    const current = await loadModelPressure(env, route);
    const level = Math.min((current?.level ?? 0) + 1, 5);
    const backoffSec = Math.min(300, 15 * 2 ** (level - 1));
    await env.ADMIN_KV?.put(
      `pressure:${route}`,
      JSON.stringify({ until: Date.now() + backoffSec * 1000, level } satisfies ModelPressure),
      { expirationTtl: 900 }
    );
  } catch {
    // Pressure tracking is best-effort.
  }
}

async function clearModelPressure(env: Env, route: string): Promise<void> {
  try {
    await env.ADMIN_KV?.delete(`pressure:${route}`);
  } catch {
    // best-effort
  }
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
  if (!body.max_tokens) {
    body.max_tokens = 1024;
  }

  console.log(`[AnthropicHandler] model=${body.model} stream=${body.stream || false}`);
  void identity;
  void agent;
  void ctx;

  const router = new Router(env, await effectiveRoutes(env, settings), {
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
// Model catalog cache (single-flight, TTL from Settings)
// =============================================================================

let modelsFlight: Promise<
  Array<{ id: string; object: string; owned_by: string; permission: string[] }>
> | null = null;

async function cachedModels(
  env: Env,
  settings: Settings
): Promise<Array<{ id: string; object: string; owned_by: string; permission: string[] }>> {
  const ttlMs = Math.max(settings.modelsTtlMin, 0) * 60_000;
  if (ttlMs > 0 && env.ADMIN_KV) {
    try {
      const raw = await env.ADMIN_KV.get('models_cache');
      if (raw) {
        const cached = JSON.parse(raw) as {
          at: number;
          data: ReturnType<Router['getAvailableModels']>;
        };
        if (Date.now() - cached.at < ttlMs) return cached.data;
      }
    } catch {
      // Cache is an optimisation; fall through to a fresh build.
    }
  }
  if (!modelsFlight) {
    modelsFlight = (async () => {
      const router = new Router(env, await effectiveRoutes(env, settings));
      const data = router.getAvailableModels();
      if (ttlMs > 0 && env.ADMIN_KV) {
        try {
          await env.ADMIN_KV.put('models_cache', JSON.stringify({ at: Date.now(), data }));
        } catch {
          // best effort
        }
      }
      return data;
    })().finally(() => {
      modelsFlight = null;
    });
  }
  return modelsFlight;
}

async function invalidateModelsCache(env: Env): Promise<void> {
  modelsFlight = null;
  try {
    await env.ADMIN_KV?.delete('models_cache');
  } catch {
    // best effort
  }
}

async function handleRagQuery(request: Request, env: Env, settings: Settings): Promise<Response> {
  const body = (await request.json()) as { question?: string; model?: string; topK?: number };
  const question = body.question?.trim();
  if (!question) throw new ProxyError('Invalid request: question is required', 400);
  const hits = await queryRag(env, question, Math.min(Math.max(body.topK ?? 5, 1), 10));
  const context = hits.length
    ? hits.map((h, i) => `[${i + 1}] (${h.title}) ${h.text}`).join('\n\n')
    : '';
  const router = new Router(env, await effectiveRoutes(env, settings), {
    settings,
    keyUsage: await slotCounts(env),
  });
  const response = await router.executeWithFallback(
    {
      model: body.model?.trim() || 'auto',
      messages: [
        {
          role: 'system',
          content:
            'Du bist der bKG-Assistent. Antworte kurz und hilfreich auf Deutsch. Nutze das gegebene Wissen, wenn es passt, und nenne die Quelle mit [Nummer]. Wenn das Wissen nicht passt, antworte aus allgemeinem Wissen und sage das ehrlich.',
        },
        {
          role: 'user',
          content: context ? `Wissen:\n${context}\n\nFrage: ${question}` : question,
        },
      ],
      max_tokens: 1536,
    },
    'openai'
  );
  if (!response.success) {
    throw new ProxyError(response.error || 'Assistant failed', response.statusCode || 500);
  }
  return json({
    answer: response.response?.choices?.[0]?.message?.content ?? '',
    model: response.upstreamModel ?? body.model ?? 'cf-free',
    sources: hits.map((h) => ({ title: h.title, score: h.score, docId: h.docId })),
  });
}

async function handleTranscription(request: Request, env: Env): Promise<Response> {
  if (!env.AI) throw new ProxyError('Cloudflare AI binding not available', 500);
  let audioBase64: string;
  const contentType = request.headers.get('Content-Type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ProxyError('Invalid request: file is required', 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    audioBase64 = btoa(binary);
  } else {
    const body = (await request.json()) as { audio?: string };
    audioBase64 = body.audio ?? '';
  }
  if (!audioBase64) throw new ProxyError('Invalid request: audio is required', 400);
  if (audioBase64.length > 14_000_000)
    throw new ProxyError('Audio too large (max about 10 MB)', 400);
  const result = (await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
    audio: audioBase64,
  })) as { text?: string };
  return json({ text: result.text ?? '' });
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

  if (
    settings.authMode !== 'keys' &&
    env.PROXY_AUTH_TOKEN &&
    constantTimeEqual(token, env.PROXY_AUTH_TOKEN)
  ) {
    return { label: 'Master', kind: 'master' };
  }
  if (settings.authMode !== 'master') {
    const record = await findClientKey(env, token);
    if (record) return { label: record.name, kind: 'client-key' };
  }
  return null;
}

interface AdminIdentity {
  name: string;
  role: 'superuser' | 'admin' | 'user';
}

async function verifyAdminIdentity(request: Request, env: Env): Promise<AdminIdentity | null> {
  const token = request.headers.get('x-admin-token') ?? extractToken(request);
  if (token && env.ADMIN_TOKEN && constantTimeEqual(token, env.ADMIN_TOKEN)) {
    return { name: 'Superuser', role: 'superuser' };
  }
  const settings = await loadSettings(env);
  if (token && settings.users.length) {
    const hash = await sha256Hex(token);
    const byToken = settings.users.find((u) => u.hash && u.hash === hash);
    if (byToken) return { name: byToken.name, role: byToken.role };
  }
  // Signed-in session cookie (username + password login)
  const cookie = request.headers.get('Cookie') ?? '';
  const match = /(?:^|;\s*)blg_session=([a-f0-9]+)/.exec(cookie);
  if (match && env.ADMIN_KV) {
    try {
      const raw = await env.ADMIN_KV.get(`session:${match[1]}`);
      if (raw) {
        const session = JSON.parse(raw) as {
          name: string;
          sessionVersion: number;
          expires: number;
        };
        const user = settings.users.find((u) => u.name === session.name);
        if (
          user &&
          session.expires > Date.now() &&
          session.sessionVersion === user.sessionVersion
        ) {
          return { name: user.name, role: user.role };
        }
      }
    } catch {
      // Invalid session cookie: fall through to unauthorized.
    }
  }
  return null;
}

async function handleLogin(request: Request, env: Env, path: string): Promise<Response> {
  if (request.method === 'POST' && path === '/admin/api/login') {
    const body = (await request.json()) as { name?: string; password?: string };
    const settings = await loadSettings(env);
    const user = settings.users.find((u) => u.name === body.name?.trim());
    if (!user?.passwordHash || !(await verifyPassword(body.password ?? '', user.passwordHash))) {
      throw new ProxyError('Invalid username or password', 401, 'invalid_login');
    }
    if (!env.ADMIN_KV) throw new ProxyError('Sessions not available (KV missing)', 500);
    const sessionId = [...crypto.getRandomValues(new Uint8Array(24))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const expires = Date.now() + 7 * 86_400_000;
    await env.ADMIN_KV.put(
      `session:${sessionId}`,
      JSON.stringify({ name: user.name, sessionVersion: user.sessionVersion, expires }),
      { expirationTtl: 7 * 86_400 }
    );
    const proto =
      request.headers.get('X-Forwarded-Proto') ?? new URL(request.url).protocol.replace(':', '');
    const secure = proto === 'https' ? '; Secure' : '';
    return new Response(JSON.stringify({ ok: true, user: { name: user.name, role: user.role } }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `blg_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${7 * 86_400}${secure}`,
        ...CORS_HEADERS,
      },
    });
  }
  if (request.method === 'POST' && path === '/admin/api/logout') {
    const cookie = request.headers.get('Cookie') ?? '';
    const match = /(?:^|;\s*)blg_session=([a-f0-9]+)/.exec(cookie);
    if (match) {
      try {
        await env.ADMIN_KV?.delete(`session:${match[1]}`);
      } catch {
        /* best effort */
      }
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'blg_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
        ...CORS_HEADERS,
      },
    });
  }
  throw new ProxyError('Not found', 404);
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
