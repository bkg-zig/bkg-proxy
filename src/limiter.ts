import { Env } from './types';
import { ensureSchema } from './metrics';

/**
 * Exact sliding-window limiter per upstream key.
 * A reservation row is one real upstream attempt. The window is 60 s plus a
 * 1 s jitter margin, so a boundary-timed request cannot land inside the
 * upstream's own rolling window. D1 serialises writes, which makes the
 * conditional insert the atomic gate (no burstable token bucket).
 */
export const WINDOW_MS = 61_000;

let slotsReady = false;

export async function ensureSlots(env: Env): Promise<boolean> {
  if (!env.DB) return false;
  if (!(await ensureSchema(env))) return false;
  if (slotsReady) return true;
  try {
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS key_slots (ts INTEGER NOT NULL, key_name TEXT NOT NULL, route TEXT)'
    ).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_slots_key_ts ON key_slots(key_name, ts)').run();
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS queue_tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, last_seen INTEGER NOT NULL, client TEXT, route TEXT)'
    ).run();
    slotsReady = true;
    return true;
  } catch (error) {
    console.error('[Limiter] schema failed:', error);
    return false;
  }
}

/** Try to reserve one slot for a key. Returns true when granted. */
export async function tryAcquireKey(
  env: Env,
  keyName: string,
  limit: number,
  route: string
): Promise<boolean> {
  if (limit <= 0) return false;
  if (!(await ensureSlots(env)) || !env.DB) return true; // no DB: fall back to soft counting
  const now = Date.now();
  try {
    const result = await env.DB.prepare(
      `INSERT INTO key_slots (ts, key_name, route)
       SELECT ?, ?, ?
       WHERE (SELECT COUNT(*) FROM key_slots WHERE key_name = ? AND ts >= ?) < ?`
    )
      .bind(now, keyName, route, keyName, now - WINDOW_MS, limit)
      .run();
    const granted = (result.meta?.changes ?? 0) > 0;
    if (Math.random() < 0.02) {
      await env.DB.prepare('DELETE FROM key_slots WHERE ts < ?').bind(now - WINDOW_MS).run();
    }
    return granted;
  } catch (error) {
    console.error('[Limiter] acquire failed:', error);
    return true;
  }
}

/** Exact per-key counts inside the effective window, from reservations. */
export async function slotCounts(env: Env): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!(await ensureSlots(env)) || !env.DB) return out;
  try {
    const result = await env.DB.prepare(
      'SELECT key_name AS k, COUNT(*) AS c FROM key_slots WHERE ts >= ? GROUP BY key_name'
    )
      .bind(Date.now() - WINDOW_MS)
      .all<{ k: string; c: number }>();
    for (const row of result.results ?? []) out[row.k] = row.c;
  } catch (error) {
    console.error('[Limiter] counts failed:', error);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Global FIFO queue tickets. The oldest live ticket goes first; tickets
// expire when their holder stops heartbeating (disconnect / deadline).
// ---------------------------------------------------------------------------

export async function joinQueue(env: Env, client: string, route: string): Promise<number> {
  if (!(await ensureSlots(env)) || !env.DB) return 0;
  const now = Date.now();
  const result = await env.DB.prepare(
    'INSERT INTO queue_tickets (ts, last_seen, client, route) VALUES (?, ?, ?, ?)'
  )
    .bind(now, now, client, route)
    .run();
  return Number(result.meta?.last_row_id ?? 0);
}

export async function queueHeartbeat(env: Env, ticket: number): Promise<void> {
  if (!ticket || !env.DB) return;
  try {
    await env.DB.prepare('UPDATE queue_tickets SET last_seen = ? WHERE id = ?')
      .bind(Date.now(), ticket)
      .run();
  } catch {
    // Queue is best-effort fairness; never fail the request over it.
  }
}

export async function isQueueHead(env: Env, ticket: number): Promise<boolean> {
  if (!ticket || !env.DB) return true;
  try {
    const now = Date.now();
    await env.DB.prepare('DELETE FROM queue_tickets WHERE last_seen < ?').bind(now - 15_000).run();
    const row = await env.DB.prepare('SELECT MIN(id) AS head FROM queue_tickets').first<{
      head: number | null;
    }>();
    return row?.head === ticket;
  } catch {
    return true;
  }
}

export async function leaveQueue(env: Env, ticket: number): Promise<void> {
  if (!ticket || !env.DB) return;
  try {
    await env.DB.prepare('DELETE FROM queue_tickets WHERE id = ?').bind(ticket).run();
  } catch {
    // Expiry cleanup covers abandoned tickets.
  }
}

export async function queueLength(env: Env): Promise<number> {
  if (!(await ensureSlots(env)) || !env.DB) return 0;
  try {
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS c FROM queue_tickets WHERE last_seen >= ?'
    )
      .bind(Date.now() - 15_000)
      .first<{ c: number }>();
    return row?.c ?? 0;
  } catch {
    return 0;
  }
}
