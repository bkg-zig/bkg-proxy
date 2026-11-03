import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AnalyticsData, OverviewData, SettingsData, adminApi, fmt, loginPassword, ms, setTokens,
} from './lib/api';
import { CapacityPage, ClientsPage, ModelsPage, OverviewPage, ReliabilityPage } from './pages/Pages';
import { AssistantWidget, ChatPage, ImagesPage, KnowledgePage, SpeechPage } from './pages/Studio';
import { SettingsPage } from './pages/Settings';

const NAV: Array<{ group: string; items: Array<{ id: string; label: string }> }> = [
  { group: 'Übersicht', items: [{ id: 'overview', label: 'Overview' }] },
  {
    group: 'Analyse',
    items: [
      { id: 'models', label: 'Models' }, { id: 'clients', label: 'Clients' },
      { id: 'reliability', label: 'Reliability' }, { id: 'capacity', label: 'Capacity' },
    ],
  },
  {
    group: 'Studio',
    items: [
      { id: 'chat', label: 'Chat' }, { id: 'images', label: 'Bilder' }, { id: 'speech', label: 'Sprache' }, { id: 'knowledge', label: 'Wissen' },
    ],
  },
  { group: 'System', items: [{ id: 'settings', label: 'Settings' }] },
];

interface NimStats { balanced?: StatCard; speed?: StatCard; intelligence?: StatCard }
interface StatCard { best_model?: string; score?: number; uptime?: number; avg_response_time_ms?: number; avg_throughput_tps?: number; error?: string }

export default function App() {
  const [tab, setTab] = useState('overview');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [nim, setNim] = useState<NimStats | null>(null);
  const [status, setStatus] = useState('');
  const [range, setRange] = useState<{ preset?: string; from?: number; to?: number }>({ preset: 'default' });
  const [paused, setPaused] = useState(false);
  const [search, setSearch] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('blg_menu') !== 'closed'; } catch { return true; }
  });
  const toggleMenu = () => setMenuOpen((open) => {
    try { localStorage.setItem('blg_menu', open ? 'closed' : 'open'); } catch { /* private mode */ }
    return !open;
  });
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const loadAnalytics = useCallback(async () => {
    const r = rangeRef.current;
    const q = new URLSearchParams();
    if (r.from) { q.set('from', String(r.from)); q.set('to', String(r.to)); }
    else if (r.preset && r.preset !== 'default') q.set('range', r.preset);
    setAnalytics(await adminApi<AnalyticsData>(`/admin/api/analytics?${q.toString()}`));
  }, []);

  const loadAll = useCallback(async () => {
    const [o, s] = await Promise.all([
      adminApi<OverviewData>('/admin/api/overview'),
      adminApi<SettingsData>('/admin/api/settings'),
    ]);
    setOverview(o);
    setSettings(s);
    await loadAnalytics();
    void adminApi<NimStats>('/admin/api/stats').then(setNim).catch(() => setNim(null));
  }, [loadAnalytics]);

  useEffect(() => {
    if (!overview) return;
    const timer = setInterval(() => { void loadAnalytics().catch(() => undefined); }, 3000);
    return () => clearInterval(timer);
  }, [overview, loadAnalytics]);

  useEffect(() => {
    if (overview) void loadAnalytics().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const doLogin = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await loadAll();
      setShowLogin(false);
      setStatus('Angemeldet. Daten laden sich alle 3 Sekunden neu.');
    } catch (e) {
      setStatus(`Anmeldung fehlgeschlagen: ${e instanceof Error ? e.message : 'unbekannt'}`);
    }
  };


  const doLogout = async () => {
    try { await fetch('/admin/api/logout', { method: 'POST' }); } catch { /* cookie may not exist */ }
    sessionStorage.removeItem('blg_admin');
    sessionStorage.removeItem('blg_client');
    setAnalytics(null); setOverview(null); setSettings(null);
    setStatus('Abgemeldet.');
  };

  const nowRpm = analytics?.overview.nowRpm ?? 0;
  const saturation = analytics?.overview.saturation ?? 0;
  const me = overview?.me;

  return (
    <div className="app">
      <aside id="app-sidebar" className={`sidebar${menuOpen ? '' : ' collapsed'}${menuOpen ? ' open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">B</div>
          <div>
            <div className="brand-name">bKG</div>
            <div className="brand-sub">Proxy · Studio</div>
          </div>
        </div>
        <nav aria-label="Bereiche">
          {NAV.map((section) => (
            <div key={section.group}>
              <p className="nav-label">{section.group}</p>
              {section.items
                .filter((item) => !search || item.label.toLowerCase().includes(search.toLowerCase()))
                .map((item) => (
                  <button
                    key={item.id}
                    className={`nav-item${tab === item.id ? ' active' : ''}`}
                    aria-selected={tab === item.id}
                    onClick={() => { setTab(item.id); if (window.innerWidth <= 900) setMenuOpen(false); }}
                  >
                    <span className="nav-dot" />{item.label}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="side-user">
          <div className="avatar">{me ? me.name.slice(0, 1).toUpperCase() : '?'}</div>
          <div className="user-text">
            <div style={{ fontWeight: 600 }}>{me ? me.name : 'Nicht angemeldet'}</div>
            <div className="muted" style={{ fontSize: 13.5 }}>{me ? `Rolle: ${me.role}` : 'Bitte anmelden'}</div>
          </div>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <button
            className="btn menu-toggle"
            onClick={toggleMenu}
            aria-expanded={menuOpen}
            aria-controls="app-sidebar"
            aria-label={menuOpen ? 'Menü einklappen' : 'Menü ausklappen'}
          >
            {menuOpen ? 'Menü schließen' : 'Menü öffnen'}
          </button>
          <div className="title">bKG Proxy · {NAV.flatMap((s) => s.items).find((i) => i.id === tab)?.label}</div>
          <div className="search">
            <input
              type="search"
              placeholder="Bereich suchen, zum Beispiel Modelle, Bilder, Keys"
              aria-label="Bereich suchen"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const first = NAV.flatMap((s) => s.items).find((i) => i.label.toLowerCase().includes(search.toLowerCase()));
                if (first) setTab(first.id);
              }}
            />
          </div>
          <span className={`pill${saturation < 70 ? ' good' : ''}`}>
            {analytics ? `Jetzt: ${fmt(nowRpm)} Anfragen pro Minute` : 'Noch keine Daten'}
          </span>
          {me ? (
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <span className="avatar" aria-hidden="true">{me.name.slice(0, 1).toUpperCase()}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{me.name} <span className="muted">({me.role})</span></span>
              <button className="btn" onClick={() => setShowLogin(true)}>Konto wechseln</button>
              <button className="btn" onClick={() => void doLogout()}>Abmelden</button>
            </span>
          ) : (
            <button className="btn btn-primary" onClick={() => setShowLogin(true)}>Anmelden</button>
          )}
        </header>

        <main>
          {!me && (
            <div className="rangebar">
              <div className="rangebar-head">
                <span>Noch nicht angemeldet. Die Anmeldung sitzt oben rechts in der Leiste.</span>
                <button className="btn btn-primary" onClick={() => setShowLogin(true)}>Anmelden öffnen</button>
              </div>
              {status && <p className="status" role="status">{status}</p>}
            </div>
          )}

          {['overview', 'models', 'clients', 'reliability', 'capacity'].includes(tab) && (
            <div className="rangebar">
              <div className="rangebar-head">
                <span>
                  <strong>Zeitraum:</strong>{' '}
                  {analytics
                    ? `${new Date(analytics.range.from).toLocaleDateString('de-DE')} bis ${new Date(analytics.range.to).toLocaleDateString('de-DE')}`
                    : 'Standard'}
                  {paused ? ' · pausiert' : ''}
                </span>
                <button className="btn" onClick={() => setRangeOpen(!rangeOpen)} aria-expanded={rangeOpen}>
                  {rangeOpen ? 'Zeitraum einklappen' : 'Zeitraum ändern'}
                </button>
              </div>
              {rangeOpen && (
                <div className="rangebar-body">
                  <div className="row" role="group" aria-label="Zeitraum wählen">
                    {([['1h', '1 Stunde'], ['6h', '6 Stunden'], ['24h', '24 Stunden'], ['7d', '7 Tage'], ['30d', '30 Tage'], ['all', 'Gesamt']] as const).map(([value, label]) => (
                      <button
                        key={value}
                        className={`btn${range.preset === value ? ' active-range' : ''}`}
                        onClick={() => setRange({ preset: value })}
                      >{label}</button>
                    ))}
                    <button
                      className="btn"
                      aria-pressed={paused}
                      onClick={() => {
                        if (!paused && analytics) setRange({ from: analytics.range.from, to: Date.now() });
                        setPaused(!paused);
                        pausedRef.current = !paused;
                      }}
                    >{paused ? 'Weiter' : 'Pause'}</button>
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <div><label>Von (eigen)</label><input type="datetime-local" value={fromInput} onChange={(e) => setFromInput(e.target.value)} /></div>
                    <div><label>Bis (eigen)</label><input type="datetime-local" value={toInput} onChange={(e) => setToInput(e.target.value)} /></div>
                    <div>
                      <button className="btn" onClick={() => {
                        const f = fromInput ? new Date(fromInput).getTime() : 0;
                        const tt = toInput ? new Date(toInput).getTime() : Date.now();
                        if (f && tt > f) setRange({ from: f, to: tt });
                      }}>Eigenen Zeitraum nutzen</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!analytics || !overview || !settings ? (
            <section className="panel">
              <p className="muted">Bitte zuerst anmelden. Danach laden alle Bereiche automatisch.</p>
            </section>
          ) : (
            <div className="page">
              {tab === 'overview' && (
                <>
                  <OverviewPage a={analytics} go={setTab} />
                  <h2>NIMStats Rangliste (extern)</h2>
                  <div className="cards">
                    {([['Insgesamt bestes', nim?.balanced], ['Schnellstes', nim?.speed], ['Kluegstes', nim?.intelligence]] as const).map(([title, d]) => (
                      <div className="card" key={title}>
                        <h3>{title}</h3>
                        {d && !d.error ? (
                          <>
                            <p className="big" style={{ fontSize: 18 }}>{d.best_model}</p>
                            <p className="muted">Punkte: {d.score} · Verfügbar: {d.uptime} %<br />Schnitt: {ms(d.avg_response_time_ms)} · {d.avg_throughput_tps} Tok/Sek.</p>
                          </>
                        ) : <p className="muted">Nicht verfügbar</p>}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {tab === 'models' && <ModelsPage a={analytics} overview={overview} reload={() => void loadAll()} />}
              {tab === 'clients' && <ClientsPage a={analytics} />}
              {tab === 'reliability' && <ReliabilityPage a={analytics} />}
              {tab === 'capacity' && <CapacityPage a={analytics} />}
              {tab === 'chat' && <ChatPage />}
              {tab === 'images' && <ImagesPage />}
              {tab === 'speech' && <SpeechPage />}
              {tab === 'knowledge' && <KnowledgePage />}
              {tab === 'settings' && (
                <SettingsPage settings={settings} overview={overview} analytics={analytics} reload={() => void loadAll()} />
              )}
            </div>
          )}
        </main>
        <AssistantWidget onNeedLogin={() => setShowLogin(true)} />
        {showLogin && (
          <div className="modal-backdrop" role="presentation" onClick={() => setShowLogin(false)}>
            <div
              className="modal panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="login-h"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 id="login-h" style={{ margin: 0 }}>Anmeldung</h2>
                <button className="btn" onClick={() => setShowLogin(false)} aria-label="Anmeldung schließen">Schließen</button>
              </div>
              <LoginForms status={status} doLogin={doLogin} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LoginForms({ status, doLogin }: { status: string; doLogin: (fn: () => Promise<void>) => Promise<void> }) {
  const [admin, setAdmin] = useState(() => sessionStorage.getItem('blg_admin') ?? '');
  const [client, setClient] = useState(() => sessionStorage.getItem('blg_client') ?? '');
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  return (
    <>
      <label>Admin-Token</label>
      <input type="password" autoComplete="off" placeholder="Admin-Token einfügen" value={admin} onChange={(e) => setAdmin(e.target.value)} />
      <label>Dein API-Key für Chat, Bilder und Sprache</label>
      <input
        type="password" autoComplete="off" placeholder="Master-Token oder erstellter Key"
        value={client}
        onChange={(e) => { setClient(e.target.value); sessionStorage.setItem('blg_client', e.target.value.trim()); }}
      />
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={() => void doLogin(async () => setTokens(admin.trim(), client.trim()))}>
          Mit Token anmelden und laden
        </button>
      </div>
      <label>Oder mit Nutzername und Passwort</label>
      <div className="row">
        <div><input type="text" placeholder="Nutzername" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><input type="password" placeholder="Passwort" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} /></div>
        <div>
          <button className="btn" onClick={() => void doLogin(async () => {
            sessionStorage.setItem('blg_client', client.trim());
            await loginPassword(name.trim(), pass);
          })}>Mit Passwort anmelden</button>
        </div>
      </div>
      <p className="status" role="status">{status}</p>
    </>
  );
}
