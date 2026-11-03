import { useEffect, useState } from 'react';
import { AnalyticsData, OverviewData, SettingsData, adminApi, fmt, ms, pct } from '../lib/api';
import { LineChart, Meter, Ring, SortableTable, seriesBy } from '../components/charts';

type A = AnalyticsData;

export function OverviewPage({ a, go }: { a: A; go: (tab: string) => void }) {
  const o = a.overview;
  return (
    <>
      <div className="hero">
        <p className="kicker">bKG Proxy · Command Center · Live</p>
        <p className="wordmark">bKG <span>PROXY</span></p>
        <p className="lead">Eine API für alles. <span style={{ color: 'var(--accent)' }}>Chat, Bilder, Sprache.</span></p>
        <p className="sub2">Sechs NVIDIA-Keys in einem fairen Pool, exaktes Tempo-Limit, Warteschlange ohne Abbrüche und jede Anfrage gemessen. Von hier steuerst du alles.</p>
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn btn-primary" onClick={() => go('chat')}>Chat öffnen</button>
          <button className="btn" onClick={() => go('images')}>Bild erstellen</button>
          <button className="btn" onClick={() => go('speech')}>Text vorlesen</button>
        </div>
      </div>
      <h2>Überblick</h2>
      <div className="cards">
        <div className="card center"><p className="lbl">Erfolgsrate</p><Ring value={o.availability} color="#3fb96f" /><p className="muted">{fmt(o.successes)} von {fmt(o.requests)} erfolgreich</p></div>
        <div className="card center"><p className="lbl">Auslastung jetzt</p><Ring value={o.saturation} color="#4a9eff" /><p className="muted">Jetzt: {fmt(o.nowRpm)} von {fmt(o.capacityNow)} pro Minute</p></div>
        <div className="card"><p className="lbl">Anfragen im Zeitraum</p><p className="big">{fmt(o.requests)}</p><p className="muted">{fmt(o.errors)} Fehler, davon {fmt(o.rate429)} Mal Limit (429)</p></div>
        <div className="card"><p className="lbl">Tokens im Zeitraum</p><p className="big">{fmt(o.promptTokens + o.completionTokens)}</p><p className="muted">{fmt(o.promptTokens)} rein, {fmt(o.completionTokens)} raus, {fmt(o.reasoningTokens)} Denken</p></div>
      </div>
      <h2>Anfragen</h2>
      <LineChart unit="Anfragen" series={[{ name: 'Anfragen', points: a.series.requests.map((r) => ({ t: Number(r.t), v: Number(r.requests) })) }]} />
      <h2>Tokens</h2>
      <LineChart unit="Tokens" series={[{ name: 'Tokens', color: '#c65df0', points: a.series.requests.map((r) => ({ t: Number(r.t), v: Number(r.tokens) })) }]} />
      <h2>System</h2>
      <div className="cards">
        {a.health.map((h) => (
          <div className="card" key={h.name}>
            <p><span className={`led ${h.ok ? 'led-online' : 'led-error'}`} /><strong>{h.name}</strong></p>
            <p className="muted">{h.detail}</p>
          </div>
        ))}
      </div>
      <h2>Top Modelle</h2>
      <SortableTable id="ovm" rows={a.models.slice(0, 8) as never[]} columns={[
        { key: 'route', label: 'Modell' }, { key: 'requests', label: 'Anfragen' }, { key: 'successes', label: 'OK' },
      ]} />
      <h2>Top Clients</h2>
      <SortableTable id="ovc" rows={a.clients.slice(0, 8) as never[]} columns={[
        { key: 'client', label: 'Client' }, { key: 'requests', label: 'Anfragen' }, { key: 'tokens', label: 'Tokens' },
      ]} />
    </>
  );
}

export function ModelsPage({ a, overview, reload }: { a: A; overview: OverviewData; reload: () => void }) {
  const models = a.models;
  const bucketMin = Math.max(a.range.bucketMs / 60000, 1);
  const topRoutes = models.slice(0, 5).map((m) => m.route);
  const mSeries = a.series.models.filter((r) => topRoutes.includes(String(r.route)));
  const [h2h, setH2h] = useState<{ a: string; b: string }>({ a: '', b: '' });
  const selA = h2h.a || models[0]?.route || '';
  const selB = h2h.b || models[1]?.route || '';
  const modelA = models.find((m) => m.route === selA);
  const modelB = models.find((m) => m.route === selB);

  return (
    <>
      <h2>Modelle nach Rang</h2>
      <div className="cards">
        {models.length ? models.map((m, i) => (
          <div className="card" key={m.route}>
            <p className="lbl">Platz {i + 1}</p>
            <p className="big" style={{ fontSize: 19 }}>{m.route}</p>
            <p className="muted">{m.upstreamModel}</p>
            <p>Anfragen: {fmt(m.requests)} · Erfolg: {m.requests ? (100 * m.successes / m.requests).toFixed(1) : '100'} %<br />
              Erstes Token: {ms(m.avgTtftMs)}<br />Gesamt: {ms(m.avgLatencyMs)}</p>
          </div>
        )) : <p className="muted">Noch keine Anfragen gemessen.</p>}
      </div>
      <h2>Zeit bis zum ersten Token (TTFT)</h2>
      <LineChart unit="ms" series={seriesBy(mSeries as never[], 'route', (r) => Number(r.ttft))} />
      <h2>Antwortzeit gesamt (Upstream-Latenz)</h2>
      <LineChart unit="ms" series={seriesBy(mSeries as never[], 'route', (r) => Number(r.latency))} />
      <h2>Tokens pro Minute</h2>
      <LineChart unit="Tok/Min" series={[{ name: 'Tokens pro Minute', color: '#3fb96f', points: a.series.requests.map((r) => ({ t: Number(r.t), v: Number(r.tokens) / bucketMin })) }]} />
      <h2>Werkzeug-Aufrufe (Tool Calls)</h2>
      <LineChart unit="Calls" series={[{ name: 'Tool Calls', color: '#e5b83b', points: a.series.requests.map((r) => ({ t: Number(r.t), v: Number(r.toolCalls) })) }]} />
      <h2>Details: Abbruch und Denk-Anteil</h2>
      <SortableTable id="mbd" rows={models.map((m) => ({
        ...m,
        truncRate: m.requests ? 100 * m.truncated / m.requests : 0,
        reasonShare: m.completionTokens ? 100 * m.reasoningTokens / m.completionTokens : 0,
        streamShare: m.requests ? 100 * m.streamed / m.requests : 0,
        interToken: m.completionTokens ? (m.avgGenerationMs > 0 ? m.avgGenerationMs / (m.completionTokens / m.requests) : m.avgLatencyMs / (m.completionTokens / m.requests)) : 0,
        genSpeed: m.avgGenerationMs > 0 && m.completionTokens ? m.completionTokens / (m.requests * m.avgGenerationMs / 1000) : 0,
      })) as never[]} columns={[
        { key: 'route', label: 'Modell' }, { key: 'requests', label: 'Anfragen' },
        { key: 'genSpeed', label: 'Token/Sek.', fmt: (v: number) => v ? v.toFixed(1) : '–' },
        { key: 'interToken', label: 'Zeit pro Token', fmt: (v: number) => ms(v) },
        { key: 'truncRate', label: 'Abgebrochen', fmt: (v: number) => pct(v) },
        { key: 'reasonShare', label: 'Denk-Anteil', fmt: (v: number) => pct(v) },
        { key: 'streamShare', label: 'Streaming', fmt: (v: number) => pct(v) },
        { key: 'toolCalls', label: 'Tool Calls' },
      ]} />
      <h2>Direktvergleich</h2>
      <div className="row">
        <div><label>Modell A</label><select value={selA} onChange={(e) => setH2h({ ...h2h, a: e.target.value })}>{models.map((m) => <option key={m.route}>{m.route}</option>)}</select></div>
        <div><label>Modell B</label><select value={selB} onChange={(e) => setH2h({ ...h2h, b: e.target.value })}>{models.map((m) => <option key={m.route}>{m.route}</option>)}</select></div>
      </div>
      {modelA && modelB ? (
        <table className="cyber-table" style={{ marginTop: 12 }}>
          <thead><tr><th>Wert</th><th>{modelA.route}</th><th>{modelB.route}</th><th>Besser</th></tr></thead>
          <tbody>
            {([
              ['Anfragen', (m: typeof modelA) => m.requests, fmt, false],
              ['Erfolg %', (m: typeof modelA) => m.requests ? 100 * m.successes / m.requests : 0, pct, false],
              ['Erstes Token', (m: typeof modelA) => m.avgTtftMs, ms, true],
              ['Gesamtzeit', (m: typeof modelA) => m.avgLatencyMs, ms, true],
              ['Tokens raus', (m: typeof modelA) => m.completionTokens, fmt, false],
              ['Tool Calls', (m: typeof modelA) => m.toolCalls, fmt, false],
            ] as const).map(([label, get, format, lower]) => {
              const va = get(modelA), vb = get(modelB);
              const winner = va === vb ? 'gleich' : (lower ? va < vb : va > vb) ? modelA.route : modelB.route;
              return <tr key={label}><td>{label}</td><td>{format(va as never)}</td><td>{format(vb as never)}</td><td><span className="badge badge-cyan">{winner}</span></td></tr>;
            })}
          </tbody>
        </table>
      ) : <p className="muted">Zwei Modelle mit Daten nötig.</p>}
      <DiscoveryCard />
      <ModelAdmin overview={overview} reload={reload} />
    </>
  );
}

function DiscoveryCard() {
  const [state, setState] = useState<{ summary: string; lastRun: number; counts: { works: number; fails: number; unchecked: number }; models: Array<{ id: string; source: string; status: string; error?: string }> } | null>(null);
  const [status, setStatus] = useState('');
  const [enabled, setEnabled] = useState(true);
  const load = async () => {
    setState(await adminApi('/admin/api/discovery'));
    const s = await adminApi<SettingsData>('/admin/api/settings');
    setEnabled(s.autoDiscover !== false);
  };
  useEffect(() => { void load().catch(() => undefined); }, []);
  return (
    <>
      <h2>Automatische Modell-Entdeckung</h2>
      <p className="muted">Der Proxy holt jeden Tag die Modell-Listen von NVIDIA und Cloudflare, testet jedes neue Modell mit einer Mini-Anfrage und nimmt nur auf, was wirklich antwortet. Kaputte Modelle bleiben draußen. Gelöschte entdeckte Modelle kommen nicht wieder.</p>
      {state ? (
        <>
          <div className="cards">
            <div className="card"><p className="lbl">Funktionieren</p><p className="big">{state.counts.works}</p></div>
            <div className="card"><p className="lbl">Gehen nicht</p><p className="big">{state.counts.fails}</p></div>
            <div className="card"><p className="lbl">Warten noch auf Test</p><p className="big">{state.counts.unchecked}</p></div>
            <div className="card"><p className="lbl">Zuletzt gelaufen</p><p className="big" style={{ fontSize: 17 }}>{state.lastRun ? new Date(state.lastRun).toLocaleString('de-DE') : 'noch nie'}</p><p className="muted">{state.summary}</p></div>
          </div>
          <label>Automatische Entdeckung an oder aus</label>
          <select value={String(enabled)} onChange={(e) => {
            const value = e.target.value === 'true';
            setEnabled(value);
            void (async () => {
              try {
                const s = await adminApi<SettingsData>('/admin/api/settings');
                await adminApi('/admin/api/settings', { method: 'PUT', body: JSON.stringify({ ...s, autoDiscover: value }) });
                setStatus(value ? 'Entdeckung ist an.' : 'Entdeckung ist aus. Schon aufgenommene Modelle bleiben.');
              } catch (err) { setStatus(`Fehler: ${err instanceof Error ? err.message : 'unbekannt'}`); }
            })();
          }}>
            <option value="true">An: neue gute Modelle kommen von selbst dazu</option>
            <option value="false">Aus: nur die festen Modelle aus der Liste</option>
          </select>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => {
              void (async () => {
                setStatus('Teste gerade die nächsten Modelle, das dauert einen Moment...');
                try {
                  const d = await adminApi<{ summary: string }>('/admin/api/discovery/run', { method: 'POST' });
                  setStatus(`Fertig: ${d.summary}`);
                  await load();
                } catch (err) { setStatus(`Fehler: ${err instanceof Error ? err.message : 'unbekannt'}`); }
              })();
            }}>Jetzt neue Modelle entdecken</button>
          </div>
          <p className="status" role="status">{status}</p>
          {state.models.length > 0 && (
            <table className="cyber-table">
              <thead><tr><th>Modell</th><th>Herkunft</th><th>Stand</th></tr></thead>
              <tbody>
                {state.models.map((m) => (
                  <tr key={m.id}>
                    <td>{m.id}</td>
                    <td>{m.source === 'nvidia' ? 'NVIDIA' : 'Cloudflare'}</td>
                    <td>{m.status === 'works'
                      ? <span className="badge badge-green">geht</span>
                      : m.status === 'fails'
                        ? <span className="badge badge-red">geht nicht{m.error ? `: ${m.error}` : ''}</span>
                        : <span className="badge badge-amber">wartet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : <p className="muted">Lade Entdeckungs-Stand...</p>}
    </>
  );
}

function ModelAdmin({ overview, reload }: { overview: OverviewData; reload: () => void }) {
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState('');
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); setStatus(ok); reload(); } catch (e) { setStatus(e instanceof Error ? e.message : 'Fehler'); }
  };
  return (
    <>
      <h2>Modelle verwalten</h2>
      <table className="cyber-table">
        <thead><tr><th>Dein Name</th><th>Echtes Modell</th><th>Aktion</th></tr></thead>
        <tbody>
          {Object.entries(overview.routes).map(([route, providers]) => (
            <tr key={route}>
              <td><strong>{route}</strong></td>
              <td>{providers.map((p) => p.model).join(', ')}</td>
              <td><button className="btn btn-danger" onClick={() => {
                if (confirm(`Modell ${route} wirklich löschen?`)) {
                  void run(() => fetch(`/admin/api/models/${encodeURIComponent(route)}`, { method: 'DELETE', headers: { 'x-admin-token': sessionStorage.getItem('blg_admin') ?? '' } }).then(async (r) => { if (!r.ok) throw new Error(`Fehler ${r.status}`); }), 'Gelöscht.');
                }
              }}>Löschen</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <label>Anzeigename</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="schnell" />
      <label>Echtes Modell bei NVIDIA</label>
      <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="nvidia/nemotron-3-ultra-550b-a55b" list="knownModels" />
      <datalist id="knownModels">
        <option value="nvidia/nemotron-3-ultra-550b-a55b" /><option value="mistralai/mistral-large-4-1t-a52b" />
        <option value="nvidia/nemotron-3.5-super-vl-120b-a12b" /><option value="nvidia/nemotron-3.5-lightning-30b-a3b" />
        <option value="nvidia/nemotron-3-nano-omni-30b-a3b-reasoning" /><option value="nvidia/nemotron-3.5-bolt-e4b" />
        <option value="poolside/laguna-xs-2.1" /><option value="meta/llama-3.2-90b-vision-instruct" />
      </datalist>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={() => void run(() => fetch('/admin/api/models', { method: 'POST', headers: { 'x-admin-token': sessionStorage.getItem('blg_admin') ?? '', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), model: model.trim() }) }).then(async (r) => { if (!r.ok) throw new Error(`Fehler ${r.status}`); }), 'Modell gespeichert.')}>Modell speichern</button>
        <button className="btn" onClick={() => { if (confirm('Alle Modell-Änderungen verwerfen?')) void run(() => fetch('/admin/api/routes/reset', { method: 'POST', headers: { 'x-admin-token': sessionStorage.getItem('blg_admin') ?? '' } }).then(async (r) => { if (!r.ok) throw new Error(`Fehler ${r.status}`); }), 'Auf Standard zurückgesetzt.'); }}>Auf Standard zurücksetzen</button>
      </div>
      <p className="status" role="status">{status}</p>
    </>
  );
}

export function ClientsPage({ a }: { a: A }) {
  return (
    <>
      <h2>Was jeder Client tut</h2>
      <p className="muted">Client ist der Name des API-Keys. Klick auf eine Spalte sortiert die Tabelle. Die Sortierung bleibt beim Neuladen.</p>
      <SortableTable id="clients" rows={a.clients.map((c) => ({
        ...c,
        toolIntensity: c.requests ? c.toolCalls / c.requests : 0,
        fingerprint: `${Number(c.avgTemperature || 0).toFixed(2)} / ${Number(c.avgTopP || 0).toFixed(2)}`,
        streamShare: c.requests ? 100 * c.streamed / c.requests : 0,
      })) as never[]} columns={[
        { key: 'client', label: 'Client' }, { key: 'requests', label: 'Anfragen' },
        { key: 'toolIntensity', label: 'Tools pro Anfrage', fmt: (v: number) => v.toFixed(2) },
        { key: 'avgMessages', label: 'Nachrichten pro Gespräch', fmt: (v: number) => v.toFixed(1) },
        { key: 'fingerprint', label: 'Sampling (Temp / Top-P)' },
        { key: 'avgMaxTokens', label: 'Gewünschte Antwortlänge', fmt: (v: number) => fmt(Math.round(v)) },
        { key: 'streamShare', label: 'Streaming-Anteil', fmt: (v: number) => pct(v) },
        { key: 'tokens', label: 'Tokens' },
      ]} />
      <h2>Rangliste</h2>
      <div className="cards">
        {a.clients.slice(0, 6).map((c, i) => (
          <div className="card" key={c.client}>
            <p className="lbl">Platz {i + 1}</p>
            <p className="big" style={{ fontSize: 20 }}>{c.client}</p>
            <p className="muted">{c.agents}</p>
            <p>Anfragen: {fmt(c.requests)}<br />Tokens: {fmt(c.tokens)}<br />Antwortzeit: {ms(c.avgLatencyMs)}</p>
          </div>
        ))}
      </div>
    </>
  );
}

export function ReliabilityPage({ a }: { a: A }) {
  const rel = a.reliability;
  const usedPercent = rel.errorBudgetTotal ? Math.min(100, 100 * rel.errorBudgetUsed / rel.errorBudgetTotal) : 0;
  const heat = new Map<number, { requests: number; errors: number }>();
  rel.heatmap.forEach((h) => heat.set(Number(h.hour), { requests: Number(h.requests), errors: Number(h.errors) }));
  return (
    <>
      <h2>Verfügbarkeit gegen Ziel (SLO)</h2>
      <div className="cards">
        <div className="card center"><p className="lbl">Verfügbarkeit</p><Ring value={rel.availability} color={rel.availability >= rel.sloPercent ? '#3fb96f' : '#e5534b'} /><p className="muted">Ziel: {pct(rel.sloPercent)}</p></div>
        <div className="card"><p className="lbl">Fehler-Budget</p><p className="big">{fmt(rel.errorBudgetRemaining)} übrig</p><Meter value={usedPercent} max={100} /><p className="muted">{fmt(rel.errorBudgetUsed)} von {fmt(rel.errorBudgetTotal)} erlaubten Fehlern verbraucht.</p></div>
        <div className="card"><p className="lbl">Limits (Governor)</p><p className="big">{fmt(rel.governor)} Mal</p><p className="muted">{rel.governor ? 'Das Modell-Limit hat zugeschlagen.' : 'Das Modell-Limit musste nicht eingreifen.'}</p></div>
      </div>
      <h2>Ergebnisse über Zeit</h2>
      <LineChart unit="Anfragen" series={seriesBy(a.series.outcomes as never[], 'outcome', (r) => Number(r.c))} />
      <h2>Wo die Zeit hingeht</h2>
      <div className="cards">
        {([['Warten (Queue)', rel.latency.queueMs], ['Erstes Token', rel.latency.ttftMs], ['Erzeugen', rel.latency.generationMs], ['Gesamt', rel.latency.totalMs]] as const).map(([name, v]) => (
          <div className="card" key={name}><p className="lbl">{name}</p><p className="big">{ms(v)}</p></div>
        ))}
      </div>
      <h2>Fehler-Arten</h2>
      <SortableTable id="err" rows={rel.taxonomy as never[]} columns={[
        { key: 'errorClass', label: 'Fehler-Art' }, { key: 'status', label: 'Status' }, { key: 'c', label: 'Anzahl' },
      ]} />
      <h2>Tageszeit: Anfragen und Fehler</h2>
      <div className="heat">
        {Array.from({ length: 24 }, (_, h) => {
          const d = heat.get(h) ?? { requests: 0, errors: 0 };
          const rate = d.requests ? d.errors / d.requests : 0;
          const bg = rate > 0.25 ? 'rgba(229,83,75,.4)' : rate > 0.1 ? 'rgba(229,184,59,.35)' : d.requests ? 'rgba(63,185,111,.15)' : undefined;
          return <div key={h} style={{ background: bg }}><strong>{String(h).padStart(2, '0')}:00</strong><br />{fmt(d.requests)} Anfragen<br />{fmt(d.errors)} Fehler</div>;
        })}
      </div>
      <p className="muted">Jede Zelle ist eine Stunde. Rot heißt viele Fehler in dieser Stunde.</p>
    </>
  );
}

export function CapacityPage({ a }: { a: A }) {
  const cap = a.capacity;
  const bucketMin = Math.max(a.range.bucketMs / 60000, 1);
  return (
    <>
      <h2>Auslastung jetzt</h2>
      <div className="card">
        <p className="lbl">Anfragen pro Minute gegen Gesamt-Limit aller Keys</p>
        <p className="big">{fmt(cap.nowRpm)} / {fmt(cap.capacityNow)} pro Minute</p>
        <Meter value={cap.saturation} max={100} />
        <p className="muted">Auslastung jetzt: {pct(cap.saturation)}. Now-Werte laufen auch bei Pause weiter.</p>
      </div>
      <h2>Auslastung im Verlauf</h2>
      <LineChart unit="%" series={[{ name: 'Auslastung', points: a.series.requests.map((r) => ({ t: Number(r.t), v: Number(r.capacity) ? 100 * (Number(r.requests) / bucketMin) / Number(r.capacity) : 0 })) }]} />
      <div className="cards">
        <div className="card"><p className="lbl">Höchste Minute</p><p className="big">{fmt(cap.peakRpm)} pro Minute</p><p className="muted">Kapazität in dieser Minute: {fmt(cap.peakCapacity)} pro Minute.</p></div>
        <div className="card"><p className="lbl">Fehlbetrag an der Spitze</p><p className="big">{fmt(cap.peakShortfall)} pro Minute</p><p className="muted">So viele Anfragen fehlten an Kapazität in der vollsten Minute.</p></div>
        <div className="card"><p className="lbl">Warteschlange jetzt</p><p className="big">{fmt(a.queue.waiting)} wartend</p><p className="muted">Alle Clients teilen eine faire Reihenfolge.</p></div>
        <div className="card"><p className="lbl">Modelle unter Druck</p><p className="big" style={{ fontSize: 19 }}>{a.modelPressure.length ? a.modelPressure.map((m) => m.route).join(', ') : 'keine'}</p><p className="muted">Erschöpfte Modelle warten, statt gesunde Keys zu verbrennen.</p></div>
      </div>
      <h2>Jeder Key einzeln</h2>
      {cap.perKey.map((k) => (
        <div className="card" key={k.key} style={{ marginBottom: 10 }}>
          <p><span className={`led ${k.present && k.enabled ? 'led-online' : 'led-error'}`} /><strong>{k.key}</strong>{' '}
            <span className={`badge ${k.enabled ? 'badge-green' : 'badge-red'}`}>{k.enabled ? 'an' : 'aus'}</span></p>
          <Meter value={k.lastMinute} max={k.rpmLimit} />
          <p className="muted">Jetzt: {fmt(k.lastMinute)} von {fmt(k.rpmLimit)} pro Minute · Im Zeitraum: {fmt(k.rangeRequests)} Anfragen, {fmt(k.range429)} Mal 429</p>
        </div>
      ))}
      <h2>Abgelehnte Anfragen (429) pro Key</h2>
      <LineChart unit="429" series={seriesBy(a.series.rate429 as never[], 'k', (r) => Number(r.c))} />
    </>
  );
}
