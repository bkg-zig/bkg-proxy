import { Env } from './types';
import { ensureSchema } from './metrics';

export const EMBED_MODEL = '@cf/baai/bge-m3';

let ragSchemaReady = false;

export async function ensureRagSchema(env: Env): Promise<boolean> {
  if (!env.DB) return false;
  if (!(await ensureSchema(env))) return false;
  if (ragSchemaReady) return true;
  try {
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS rag_docs (id TEXT PRIMARY KEY, title TEXT, owner TEXT, chunks INTEGER, created_at INTEGER)'
    ).run();
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS rag_chunks (id TEXT PRIMARY KEY, doc_id TEXT, idx INTEGER, text TEXT)'
    ).run();
    ragSchemaReady = true;
    return true;
  } catch (error) {
    console.error('[RAG] schema failed:', error);
    return false;
  }
}

export async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  if (!env.AI) throw new Error('AI binding not available');
  const result = (await env.AI.run(EMBED_MODEL, { text: texts })) as {
    data?: number[][];
    shape?: number[];
  };
  const vectors = result.data ?? [];
  if (vectors.length !== texts.length) {
    throw new Error(`Embedding mismatch: ${vectors.length} vectors for ${texts.length} texts`);
  }
  return vectors;
}

export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chunks: string[] = [];
  for (let start = 0; start < clean.length; start += size - overlap) {
    const chunk = clean.slice(start, start + size).trim();
    if (chunk) chunks.push(chunk);
    if (start + size >= clean.length) break;
  }
  return chunks;
}

export interface RagDoc {
  id: string;
  title: string;
  owner: string;
  chunks: number;
  created_at: number;
}

export async function addDocument(
  env: Env,
  owner: string,
  title: string,
  text: string
): Promise<RagDoc> {
  if (!(await ensureRagSchema(env)) || !env.DB || !env.VECTORIZE) {
    throw new Error('RAG storage not available');
  }
  const id = crypto.randomUUID();
  const chunks = chunkText(text);
  if (!chunks.length) throw new Error('Document text is empty');
  const vectors = await embedTexts(env, chunks);
  await env.VECTORIZE.upsert(
    chunks.map((chunk, i) => ({
      id: `${id}:${i}`,
      values: vectors[i],
      metadata: { docId: id, title },
    }))
  );
  const stmt = env.DB.prepare('INSERT INTO rag_chunks (id, doc_id, idx, text) VALUES (?, ?, ?, ?)');
  await env.DB.batch(chunks.map((chunk, i) => stmt.bind(`${id}:${i}`, id, i, chunk)));
  const doc: RagDoc = { id, title, owner, chunks: chunks.length, created_at: Date.now() };
  await env.DB.prepare(
    'INSERT INTO rag_docs (id, title, owner, chunks, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(doc.id, doc.title, doc.owner, doc.chunks, doc.created_at)
    .run();
  return doc;
}

export async function listDocuments(env: Env): Promise<RagDoc[]> {
  if (!(await ensureRagSchema(env)) || !env.DB) return [];
  const result = await env.DB.prepare(
    'SELECT id, title, owner, chunks, created_at FROM rag_docs ORDER BY created_at DESC'
  ).all<RagDoc>();
  return result.results ?? [];
}

export async function deleteDocument(env: Env, id: string): Promise<boolean> {
  if (!(await ensureRagSchema(env)) || !env.DB) return false;
  const chunks = await env.DB.prepare('SELECT id FROM rag_chunks WHERE doc_id = ?')
    .bind(id)
    .all<{ id: string }>();
  const ids = (chunks.results ?? []).map((c) => c.id);
  if (ids.length && env.VECTORIZE) {
    await env.VECTORIZE.deleteByIds(ids);
  }
  await env.DB.prepare('DELETE FROM rag_chunks WHERE doc_id = ?').bind(id).run();
  const result = await env.DB.prepare('DELETE FROM rag_docs WHERE id = ?').bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}

export interface RagHit {
  docId: string;
  title: string;
  score: number;
  text: string;
}

export async function queryRag(env: Env, question: string, topK = 5): Promise<RagHit[]> {
  if (!(await ensureRagSchema(env)) || !env.DB || !env.VECTORIZE) return [];
  const [vector] = await embedTexts(env, [question]);
  const matches = await env.VECTORIZE.query(vector, {
    topK,
    returnMetadata: 'all',
  });
  const hits: RagHit[] = [];
  for (const match of matches.matches ?? []) {
    const row = await env.DB.prepare('SELECT text FROM rag_chunks WHERE id = ?')
      .bind(match.id)
      .first<{ text: string }>();
    if (row) {
      hits.push({
        docId: String(match.metadata?.docId ?? ''),
        title: String(match.metadata?.title ?? ''),
        score: match.score,
        text: row.text,
      });
    }
  }
  return hits;
}
