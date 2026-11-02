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
  isClientKey,
} from './store';
import { dashboardHtml } from './dashboard';

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
  'NVIDIA_KEY_4',
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
  async fetch(request: Request, env: Env): Promise<Response> {
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
      if (!(await verifyAuth(request, env))) {
        throw new ProxyError('Unauthorized', 401, 'invalid_auth');
      }

      // Models list (requires auth, matching OpenAI behavior)
      if (
        request.method === 'GET' &&
        (path === '/models' ||
          path === '/v1/models' ||
          path === '/anthropic/models' ||
          path === '/anthropic/v1/models')
      ) {
        const router = new Router(env, await loadEffectiveRoutes(env));
        return json({
          object: 'list',
          data: router.getAvailableModels(),
        });
      }

      // Image generation — POST only
      if (request.method === 'POST' && path === '/v1/images/generations') {
        return await handleImageGeneration(request, env);
      }

      // Anthropic-format chat completions — POST only
      if (
        request.method === 'POST' &&
        (path === '/anthropic/v1/messages' || path === '/anthropic/messages')
      ) {
        return await handleAnthropicChat(request, env);
      }

      // OpenAI-format chat completions — POST only
      if (
        request.method === 'POST' &&
        (path === '/' || path === '/v1/chat/completions' || path === '/chat/completions')
      ) {
        return await handleChatCompletion(request, env);
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
  if (!verifyAdmin(request, env)) {
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
        ['NVIDIA_KEY_1', 'NVIDIA_KEY_2', 'NVIDIA_KEY_3', 'NVIDIA_KEY_4', 'NVIDIA_KEY_5', 'NVIDIA_KEY_6', 'NVIDIA_KEY_7'].map(
          (name) => [name, Boolean(env[name])]
        )
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

  throw new ProxyError('Admin route not found', 404);
}

// =============================================================================
// Image generation
// =============================================================================

async function handleImageGeneration(request: Request, env: Env): Promise<Response> {
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

  if (known === 'pollinations' || modelName === 'pollinations-flux') {
    const imageUrl = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${new URLSearchParams(
      { seed: String(seed), width: '1024', height: '1024', model: 'flux', nologo: 'true' }
    ).toString()}`;
    return json({ created: Math.floor(Date.now() / 1000), model: modelName, seed, data: [{ url: imageUrl }] });
  }

  const cfModel = known ?? (modelName.startsWith('@cf/')
    ? { id: modelName, contentType: 'image/png' }
    : undefined);
  if (!cfModel) {
    throw new ProxyError(`Unknown image model: ${modelName}`, 400);
  }
  if (!env.AI) {
    throw new ProxyError('Cloudflare AI binding not available', 500);
  }
  const result = await env.AI.run(cfModel.id, { prompt });
  return new Response(result as BodyInit, {
    headers: { 'Content-Type': cfModel.contentType, ...CORS_HEADERS },
  });
}

// =============================================================================
// OpenAI-format handler (existing)
// =============================================================================

async function handleChatCompletion(request: Request, env: Env): Promise<Response> {
  const body = await request.json();
  const chatRequest = body as OpenAIChatRequest;

  if (!chatRequest.messages || !Array.isArray(chatRequest.messages)) {
    throw new ProxyError('Invalid request: messages array is required', 400);
  }
  if (!chatRequest.model) {
    throw new ProxyError('Invalid request: model is required', 400);
  }

  console.log(`[Worker] model=${chatRequest.model} stream=${chatRequest.stream || false}`);

  const router = new Router(env, await loadEffectiveRoutes(env));
  const response = await router.executeWithFallback(chatRequest, 'openai');

  if (!response.success) {
    throw new ProxyError(response.error || 'All providers failed', response.statusCode || 500);
  }

  if (response.stream) {
    return new Response(response.stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...CORS_HEADERS,
      },
    });
  }

  return json(response.response);
}

// =============================================================================
// Anthropic-format handler (dual-path)
// =============================================================================

async function handleAnthropicChat(request: Request, env: Env): Promise<Response> {
  const body: AnthropicRequest = await request.json();

  if (!body.messages || !Array.isArray(body.messages)) {
    throw new ProxyError('Invalid request: messages array is required', 400);
  }
  if (!body.model) {
    throw new ProxyError('Invalid request: model is required', 400);
  }

  console.log(`[AnthropicHandler] model=${body.model} stream=${body.stream || false}`);

  const router = new Router(env, await loadEffectiveRoutes(env));
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

async function verifyAuth(request: Request, env: Env): Promise<boolean> {
  const token = extractToken(request);
  if (!token) return false;

  if (env.PROXY_AUTH_TOKEN && constantTimeEqual(token, env.PROXY_AUTH_TOKEN)) return true;

  // Dashboard-created client keys (stored hashed in KV)
  return isClientKey(env, token);
}

function verifyAdmin(request: Request, env: Env): boolean {
  if (!env.ADMIN_TOKEN) {
    console.error('[verifyAdmin] ADMIN_TOKEN not configured — rejecting admin requests');
    return false;
  }
  const token = request.headers.get('x-admin-token') ?? extractToken(request);
  if (!token) return false;
  return constantTimeEqual(token, env.ADMIN_TOKEN);
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
