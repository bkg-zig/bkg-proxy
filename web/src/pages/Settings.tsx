import { useEffect, useState } from 'react';
import { AnalyticsData, OverviewData, SettingsData, adminApi } from '../lib/api';

export function SettingsPage({
  settings, overview, analytics, reload,
}: {
  settings: SettingsData;
  overview: OverviewData;
  analytics: AnalyticsData;
  reload: () => void;
}) {
  const [form, setForm] = useState<SettingsData>(settings);
  const [status, setStatus] = useState('');
  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [userName, setUserName] = useState('');
  const [userPass, setUserPass] = useState('');
  const [userRole, setUserRole] = useState('user');
  const [newUserToken, setNewUserToken] = useState('');
  const [limitsText, setLimitsText] = useState(JSON.stringify(settings.modelLimits, null, 2));
  const [ownersText, setOwnersText] = useState(JSON.stringify(settings.keyOwners, null, 2));

  useEffect(() => {
    setForm(settings);
    setLimitsText(JSON.stringify(settings.modelLimits, null, 2));
    setOwnersText(JSON.stringify(settings.keyOwners, null, 2));
  }, [settings]);

  const save = async () => {
    try {
      const modelLimits = JSON.parse(limitsText || '{}') as Record<string, number>;
      const keyOwners = JSON.parse(ownersText || '{}') as Record<string, string>;
      await adminApi('/admin/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ ...form, modelLimits, keyOwners }),
      });
      setStatus('Gespeichert und sofort aktiv.');
      reload();
    } catch (e) {
      setStatus(`Fehler: ${e instanceof Error ? e.message : 'unbekannt'} (JSON in Limits/Besitzer prüfen)`);
    }
  };

  const num = (key: keyof SettingsData) => ({
    value: Number(form[key] ?? 0),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: Number(e.target.value) }),
  });

  return (
    <>
      <h2>Einstellungen</h2>
      <p className="muted">Speichern wirkt sofort, ohne Neustart. Nur eine Änderung der Config von Hand braucht einen Neustart.</p>

      <h2>NVIDIA-Keys: Tempo und an/aus</h2>
      {Object.keys(form.keyRpm).map((name) => (
        <div className="row" key={name} style={{ marginBottom: 8, alignItems: 'center' }}>
          <div><strong>{name}</strong>{form.keyOwners[name] ? <span className="muted"> · Besitzer: {form.keyOwners[name]}</span> : null}</div>
          <div>
            <label>Pro Minute (0 = aus)</label>
            <input type="number" min="0" step="1" value={form.keyRpm[name]}
              onChange={(e) => setForm({ ...form, keyRpm: { ...form.keyRpm, [name]: Number(e.target.value) } })} />
          </div>
          <div>
            <label>An oder aus</label>
            <select value={String(form.keyEnabled[name] !== false)}
              onChange={(e) => setForm({ ...form, keyEnabled: { ...form.keyEnabled, [name]: e.target.value === 'true' } })}>
              <option value="true">An</option><option value="false">Aus</option>
            </select>
          </div>
        </div>
      ))}

      <h2>Zugang</h2>
      <label>Wer darf die API nutzen?</label>
      <select value={form.authMode} onChange={(e) => setForm({ ...form, authMode: e.target.value })}>
        <option value="master+keys">Master-Token und erstellte Keys</option>
        <option value="master">Nur Master-Token</option>
        <option value="keys">Nur erstellte Keys</option>
      </select>
      <label>Upstream-Adresse (leer = NVIDIA Standard)</label>
      <input value={form.upstreamUrl} onChange={(e) => setForm({ ...form, upstreamUrl: e.target.value })} placeholder="https://integrate.api.nvidia.com/v1" />

      <h2>Client API-Keys</h2>
      {overview.clientKeys.length ? (
        <table className="cyber-table">
          <thead><tr><th>Name</th><th>Anfang</th><th>Besitzer</th><th>Erstellt</th><th>Aktion</th></tr></thead>
          <tbody>
            {overview.clientKeys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td><td><code>{k.prefix}...</code></td><td>{k.owner}</td>
                <td>{new Date(k.createdAt).toLocaleString('de-DE')}</td>
                <td><button className="btn btn-danger" onClick={() => {
                  if (!confirm('Key wirklich löschen? Er hört sofort auf.')) return;
                  void adminApi(`/admin/api/keys/${encodeURIComponent(k.id)}`, { method: 'DELETE' })
                    .then(() => { setStatus('Key gelöscht.'); reload(); })
                    .catch((e: Error) => setStatus(`Fehler: ${e.message}`));
                }}>Löschen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted">Noch keine erstellten Keys. Das Master-Token gilt weiterhin.</p>}
      <label>Name für neuen Key</label>
      <input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Handy" />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" onClick={() => {
          void adminApi<{ key: string }>('/admin/api/keys', { method: 'POST', body: JSON.stringify({ name: keyName.trim() }) })
            .then((d) => { setNewKey(d.key); setStatus('Key erstellt. Bitte jetzt kopieren.'); reload(); })
            .catch((e: Error) => setStatus(`Fehler: ${e.message}`));
        }}>Neuen Key erstellen</button>
      </div>
      <label>Neuer Key (nur einmal sichtbar)</label>
      <input readOnly value={newKey} placeholder="Noch kein neuer Key" />

      <h2>Limits</h2>
      <label>Maximale Antwort-Tokens pro Anfrage (0 = kein Limit)</label>
      <input type="number" min="0" step="1" {...num('maxTokensCap')} />
      <label>Modell-Limits pro Minute, als JSON. Beispiel: {'{"auto": 30}'}</label>
      <textarea value={limitsText} onChange={(e) => setLimitsText(e.target.value)} />

      <h2>Warten, Streams und Katalog</h2>
      <div className="row">
        <div><label>Maximal warten auf freien Key (Sekunden)</label><input type="number" min="0" step="1" {...num('maxWaitSec')} /></div>
        <div><label>Herzschlag im Stream (Sekunden)</label><input type="number" min="1" step="1" {...num('heartbeatSec')} /></div>
        <div><label>Stream ohne Daten kappen nach (Sekunden)</label><input type="number" min="5" step="1" {...num('streamIdleSec')} /></div>
        <div><label>Modell-Liste merken (Minuten)</label><input type="number" min="0" step="1" {...num('modelsTtlMin')} /></div>
      </div>
      <label>Strikte Weiterleitung (keine Usage-Einspritzung in Streams)</label>
      <select value={String(form.strictPassthrough)} onChange={(e) => setForm({ ...form, strictPassthrough: e.target.value === 'true' })}>
        <option value="false">Aus: Usage wird für genaue Zählung eingespritzt</option>
        <option value="true">An: Anfragen gehen unverändert durch</option>
      </select>
      <label>Key-Besitzer als JSON, Beispiel {'{"NVIDIA_KEY_1": "Anna"}'}</label>
      <textarea value={ownersText} onChange={(e) => setOwnersText(e.target.value)} />

      <h2>Zeit und Ziele</h2>
      <div className="row">
        <div><label>Standard-Zeitraum (Tage)</label><input type="number" min="1" step="1" {...num('defaultRangeDays')} /></div>
        <div><label>Aufbewahrung (Tage, 0 = für immer)</label><input type="number" min="0" step="1" {...num('retentionDays')} /></div>
        <div><label>Verfügbarkeits-Ziel (Prozent)</label><input type="number" min="90" max="100" step="0.1" {...num('sloPercent')} /></div>
      </div>
      <p className="muted">
        Gespeicherte Messungen: {analytics.history.rows.toLocaleString('de-DE')} Zeilen, etwa {(analytics.history.approxBytes / 1024).toFixed(1)} KB.
        Erste Messung: {analytics.history.firstSample ? new Date(analytics.history.firstSample).toLocaleString('de-DE') : 'keine'}.
        Aufbewahrung: {analytics.history.retentionDays === 0 ? 'für immer' : `${analytics.history.retentionDays} Tage`}.
      </p>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => void save()}>Einstellungen speichern</button>
      </div>
      <p className="status" role="status">{status}</p>

      <h2>Dashboard-Nutzer</h2>
      <p className="muted">Nutzer melden sich mit Name und Passwort an. Normale Nutzer verwalten nur eigene Keys. Der Haupt-Admin kann nie gelöscht werden.</p>
      {form.users.length ? (
        <table className="cyber-table">
          <thead><tr><th>Name</th><th>Rolle</th><th>Erstellt</th><th>Aktion</th></tr></thead>
          <tbody>
            {form.users.map((u) => (
              <tr key={u.name}>
                <td>{u.name}</td><td>{u.role}</td><td>{new Date(u.createdAt).toLocaleString('de-DE')}</td>
                <td><button className="btn btn-danger" onClick={() => {
                  if (!confirm('Nutzer wirklich löschen?')) return;
                  void adminApi(`/admin/api/users/${encodeURIComponent(u.name)}`, { method: 'DELETE' })
                    .then(() => { setStatus('Nutzer gelöscht.'); reload(); })
                    .catch((e: Error) => setStatus(`Fehler: ${e.message}`));
                }}>Löschen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted">Nur das Master-Admin-Token.</p>}
      <label>Name für neuen Nutzer</label>
      <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Zum Beispiel: Handy" />
      <label>Passwort (mindestens 8 Zeichen, leer = Login-Token statt Passwort)</label>
      <input type="password" value={userPass} onChange={(e) => setUserPass(e.target.value)} placeholder="Passwort" />
      <label>Rolle</label>
      <select value={userRole} onChange={(e) => setUserRole(e.target.value)}>
        <option value="user">Nutzer: sieht alles, verwaltet nur eigene Keys</option>
        <option value="admin">Admin: Einstellungen und Nutzer</option>
      </select>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" onClick={() => {
          void adminApi<{ token?: string }>('/admin/api/users', { method: 'POST', body: JSON.stringify({ name: userName.trim(), password: userPass, role: userRole }) })
            .then((d) => { setNewUserToken(d.token ?? '(Passwort-Login, kein Token)'); setStatus('Nutzer erstellt.'); reload(); })
            .catch((e: Error) => setStatus(`Fehler: ${e.message}`));
        }}>Nutzer erstellen</button>
      </div>
      <label>Nutzer-Token (nur einmal sichtbar)</label>
      <input readOnly value={newUserToken} placeholder="Noch kein neuer Nutzer" />
    </>
  );
}
