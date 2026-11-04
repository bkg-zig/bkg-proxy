// NVIDIA Magpie TTS (multilingual) via the hosted NVCF function.
// The chat API (integrate.api.nvidia.com) does not list this model, so the
// proxy exposes it itself: model id in /v1/models, German voices under
// /v1/voices/de and synthesis through /v1/audio/speech (engine "magpie").
//
// Verified live against the function: list_voices returns the full catalog,
// and synthesis works with multipart form-data (text/language[/voice]).
// Caveats learned live: the language must be proper BCP-47 ("de-DE", not
// "DE-DE") and the multipart framing must be exact, otherwise the model
// fails with a Triton error. synthesizeMagpie tries the named voice first
// and falls back to the built-in default voice, reporting which was used.
import { Env } from './types';

export const MAGPIE_MODEL_ID = 'nvidia/magpie-tts-multilingual';

const NVCF_BASE = 'https://877104f7-e885-42b9-8de8-f6e4c6303969.invocation.api.nvcf.nvidia.com';

function magpieBase(env: Env): string {
  const override = env.MAGPIE_BASE_URL;
  return typeof override === 'string' && override.trim() ? override.trim() : NVCF_BASE;
}

const KEY_ENV_NAMES = [
  'NVIDIA_KEY_1',
  'NVIDIA_KEY_2',
  'NVIDIA_KEY_3',
  'NVIDIA_KEY_5',
  'NVIDIA_KEY_6',
  'NVIDIA_KEY_7',
];

function firstNvidiaKey(env: Env): string | null {
  for (const name of KEY_ENV_NAMES) {
    const value = env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export interface MagpieVoice {
  name: string;
  locale: string;
  speaker: string;
}

let voiceCache: { at: number; voices: MagpieVoice[] } | null = null;
const VOICE_CACHE_MS = 10 * 60_000;

function parseVoiceName(name: string): MagpieVoice | null {
  // Catalog format: Magpie-Multilingual.<LOCALE>.<Speaker>[.<Emotion>]
  const match = /^Magpie-Multilingual\.([A-Za-z]{2}-[A-Za-z]{2,})\.([^.]+)(?:\..+)?$/.exec(name);
  if (!match) return null;
  // The catalog writes locales upper-case ("DE-DE"); the synthesis API wants
  // proper BCP-47 casing ("de-DE") and fails with a Triton error otherwise.
  const [lang, region] = match[1].split('-');
  const locale = `${lang.toLowerCase()}-${region.toUpperCase()}`;
  return { name, locale, speaker: match[2] };
}

export async function listMagpieVoices(env: Env): Promise<MagpieVoice[]> {
  if (voiceCache && Date.now() - voiceCache.at < VOICE_CACHE_MS) return voiceCache.voices;
  const key = firstNvidiaKey(env);
  if (!key) throw new Error('No NVIDIA key configured for Magpie TTS');
  const res = await fetch(`${magpieBase(env)}/v1/audio/list_voices`, {
    headers: { Authorization: `Bearer ${key}` },
    // Never hang the /v1/voices/de response on a slow upstream.
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Magpie voice list failed with status ${res.status}`);
  const data = (await res.json()) as Record<string, { voices?: string[] }>;
  const voices: MagpieVoice[] = [];
  for (const group of Object.values(data)) {
    for (const name of group.voices ?? []) {
      // Base voices only — emotion variants (".Calm", ".Angry", ...) are skipped.
      if (name.split('.').length !== 3) continue;
      const parsed = parseVoiceName(name);
      if (parsed) voices.push(parsed);
    }
  }
  voiceCache = { at: Date.now(), voices };
  return voices;
}

export async function listGermanMagpieVoices(env: Env): Promise<MagpieVoice[]> {
  const all = await listMagpieVoices(env);
  return all.filter((v) => v.locale.toLowerCase() === 'de-de');
}

export function localeFromMagpieVoice(voice: string): string | null {
  return parseVoiceName(voice)?.locale ?? null;
}

export interface MagpieResult {
  audio: ArrayBuffer;
  usedVoice: string;
}

async function postSynthesize(
  base: string,
  key: string,
  text: string,
  language: string,
  voice: string | null,
  signal: AbortSignal
): Promise<Response> {
  // Hand-built multipart: the NVCF parser is picky about the exact framing
  // (a stray CRLF in a field value already makes the voice lookup fail).
  const boundary = `----bkg${crypto.randomUUID().replace(/-/g, '')}`;
  const fields: Array<[string, string]> = [
    ['text', text],
    ['language', language],
  ];
  if (voice) fields.push(['voice', voice]);
  const body =
    fields
      .map(
        ([name, value]) =>
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      )
      .join('') + `--${boundary}--\r\n`;
  return fetch(`${base}/v1/audio/synthesize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
    // A hanging upstream must never kill the Worker (Cloudflare error 1102):
    // each attempt gets at most 20 s, the whole synthesis at most ~25 s.
    signal: signal,
  });
}

function normalizeLanguage(language: string): string {
  const [lang, region] = language.trim().split('-');
  if (!region) return lang.toLowerCase();
  return `${lang.toLowerCase()}-${region.toUpperCase()}`;
}

export async function synthesizeMagpie(
  env: Env,
  text: string,
  rawLanguage: string,
  voice: string | null
): Promise<MagpieResult> {
  const language = normalizeLanguage(rawLanguage);
  const key = firstNvidiaKey(env);
  if (!key) throw new Error('No NVIDIA key configured for Magpie TTS');
  // Total budget ~25 s: the named try plus one default retry. Anything slower
  // returns a clean 502 instead of tripping the Worker's resource limit.
  const deadline = Date.now() + 25_000;
  const attemptSignal = () =>
    AbortSignal.timeout(Math.max(1_000, Math.min(20_000, deadline - Date.now())));
  if (voice) {
    try {
      const named = await postSynthesize(magpieBase(env), key, text, language, voice, attemptSignal());
      if (named.ok) return { audio: await named.arrayBuffer(), usedVoice: voice };
      await named.text().catch(() => '');
    } catch (error) {
      if (Date.now() >= deadline) throw toTimeoutError(error);
    }
  }
  // The upstream model occasionally answers a follow-up request with a
  // transient Triton error or a 429, so retry the default voice once briefly.
  let lastDetail = 'upstream timeout';
  for (let attempt = 0; attempt < 2 && Date.now() < deadline; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(2_000, Math.max(0, deadline - Date.now())))
      );
      if (Date.now() >= deadline) break;
    }
    try {
      const fallback = await postSynthesize(
        magpieBase(env),
        key,
        text,
        language,
        null,
        attemptSignal()
      );
      if (fallback.ok) return { audio: await fallback.arrayBuffer(), usedVoice: 'default' };
      lastDetail = await fallback.text().catch(() => '');
      if (Date.now() >= deadline) break;
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : String(error);
      break;
    }
  }
  throw new Error(`Magpie synthesis failed: ${lastDetail.slice(0, 200)}`);

  function toTimeoutError(error: unknown): Error {
    return new Error(
      `Magpie synthesis timed out: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
