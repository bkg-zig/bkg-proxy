import { ProviderConfig, Env, OpenAIChatRequest, ProviderResponse } from './types';
import { createProvider } from './providers';
import { isRetryableError, shouldRotateKey, withTimeout } from './utils/error-handler';
import { Settings } from './store';
import { tryAcquireKey } from './limiter';

export interface TokenRuntime {
  settings?: Settings;
  keyUsage?: Record<string, number>;
  /** Preferred key name for this conversation (sticky prefix cache). */
  stickyKey?: string;
  route?: string;
}

export class TokenManager {
  constructor(
    private config: ProviderConfig,
    private env: Env,
    private runtime?: TokenRuntime
  ) {}

  /**
   * Try to execute request with token rotation
   * Will try all tokens in order until one succeeds
   */
  async executeWithRotation(request: OpenAIChatRequest): Promise<ProviderResponse> {
    const provider = createProvider(this.config, this.env);
    const apiKeyPairs = this.getApiKeyPairs();
    const apiKeys = apiKeyPairs.map((p) => p.value);

    if (apiKeys.length === 0 && (this.config.apiKeys?.length ?? 0) > 0 && this.runtime?.settings) {
      // Keys exist but every one is disabled or inside its sliding window:
      // that is a queueing signal, never a keyless upstream attempt.
      return {
        success: false,
        error: 'All upstream keys are inside their sliding rate window',
        statusCode: 429,
        keyUsed: '',
        windowFull: true,
      };
    }

    if (apiKeys.length === 0) {
      // Cloudflare AI uses a binding instead of API keys; *-compatible providers may
      // point at keyless local gateways (vLLM, Ollama, ...) — let the upstream decide.
      if (
        this.config.provider === 'cloudflare-ai' ||
        this.config.provider === 'openai-compatible' ||
        this.config.provider === 'anthropic-compatible'
      ) {
        return await provider.chat(request, '');
      }
      // Official anthropic/google/openai APIs always require a key — fail fast
      // instead of burning a request that will just 401 upstream.
      return {
        success: false,
        error: `No API keys configured for ${this.config.provider}/${this.config.model}`,
        statusCode: 500,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lastError: any = null;
    let lastStatusCode: number | undefined;

    // Try each API key in order (sticky first, then least loaded).
    // Every attempt first reserves an exact sliding-window slot for that key;
    // keys whose window is full are skipped without touching the upstream.
    let anySlot = false;
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      const settings = this.runtime?.settings;
      if (settings) {
        const keyName = apiKeyPairs[i]?.name ?? '';
        const rpm = settings.keyRpm[keyName] ?? 40;
        const granted = await tryAcquireKey(this.env, keyName, rpm, this.runtime?.route ?? this.config.model);
        if (!granted) {
          continue;
        }
        anySlot = true;
      }
      try {
        console.log(
          `[TokenManager] Trying ${this.config.provider}/${this.config.model} with key ${i + 1}/${apiKeys.length}`
        );

        const timeoutMs = Number(this.env.PROVIDER_TIMEOUT_MS) || undefined;
        const response = await withTimeout(provider.chat(request, apiKey), timeoutMs);
        response.keyUsed = apiKeyPairs[i]?.name ?? '';

        if (response.success) {
          console.log(`[TokenManager] Success with key ${i + 1}/${apiKeys.length}`);
          return response;
        }

        // If response failed but it's retryable, try next key
        lastError = response.error;
        if (response.statusCode) {
          lastStatusCode = response.statusCode;
        }
        console.log(`[TokenManager] Failed with key ${i + 1}/${apiKeys.length}: ${response.error}`);

        // If it's not a retryable error, don't try other keys for this provider
        if (!shouldRotateKey(response.statusCode, response.error)) {
          break;
        }
      } catch (error) {
        lastError = error;
        // SDK errors carry the HTTP status on `status` (not `statusCode`) — check both
        // so upstream status codes survive instead of collapsing to 500.
        const status =
          (error as { status?: number; statusCode?: number } | null)?.status ??
          (error as { statusCode?: number } | null)?.statusCode;
        if (status) {
          lastStatusCode = status;
        }
        console.error(`[TokenManager] Exception with key ${i + 1}/${apiKeys.length}:`, error);

        // If it's a retryable error, continue to next key
        if (!isRetryableError(error)) {
          break;
        }
      }
    }

    if (this.runtime?.settings && !anySlot && apiKeyPairs.length > 0) {
      return {
        success: false,
        error: 'All upstream keys are inside their sliding rate window',
        statusCode: 429,
        keyUsed: '',
        windowFull: true,
      };
    }
    // All keys failed
    return {
      success: false,
      error: lastError?.message || lastError || 'All API keys failed',
      statusCode: lastStatusCode ?? 500,
      keyUsed: apiKeyPairs[apiKeyPairs.length - 1]?.name ?? '',
    };
  }

  private getApiKeyPairs(): Array<{ name: string; value: string }> {
    const pairs: Array<{ name: string; value: string }> = [];
    const settings = this.runtime?.settings;
    const usage = this.runtime?.keyUsage ?? {};

    for (const keyName of this.config.apiKeys ?? []) {
      const keyValue = this.env[keyName];
      if (!keyValue) {
        console.warn(`[TokenManager] API key not found in env: ${keyName}`);
        continue;
      }
      // Settings: disabled keys and keys at their per-minute limit are skipped live.
      if (settings && settings.keyEnabled[keyName] === false) {
        continue;
      }
      if (settings) {
        const rpm = settings.keyRpm[keyName];
        if (rpm !== undefined && rpm > 0 && (usage[keyName] ?? 0) >= rpm) {
          continue;
        }
        if (rpm !== undefined && rpm === 0) {
          continue;
        }
      }
      pairs.push({ name: keyName, value: keyValue });
    }

    const sticky = this.runtime?.stickyKey;
    pairs.sort((a, b) => {
      if (sticky) {
        if (a.name === sticky && b.name !== sticky) return -1;
        if (b.name === sticky && a.name !== sticky) return 1;
      }
      return (usage[a.name] ?? 0) - (usage[b.name] ?? 0);
    });
    return pairs;
  }
}
