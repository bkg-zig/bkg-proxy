export function dashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BLG Proxy – Admin</title>
<style>
  :root { --green:#76b900; --bg:#101210; --panel:#1a1d1a; --line:#333833; --text:#f2f4f2; --muted:#b9c2b9; --danger:#e5534b; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family: system-ui, "Segoe UI", sans-serif; font-size:18px; line-height:1.5; }
  header { padding:20px 24px 8px; }
  h1 { font-size:30px; margin:0 0 4px; }
  h2 { font-size:23px; margin:0 0 12px; }
  .sub { color:var(--muted); margin:0; }
  main { padding:16px 24px 40px; max-width:1100px; }
  .tabs { display:flex; gap:8px; flex-wrap:wrap; margin:16px 0 20px; }
  .tabs button { font-size:19px; padding:12px 20px; background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:8px; cursor:pointer; }
  .tabs button[aria-selected="true"] { background:var(--green); color:#101210; font-weight:700; border-color:var(--green); }
  section.panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:20px; margin-bottom:20px; }
  [hidden] { display:none !important; }
  label { display:block; font-weight:600; margin:14px 0 6px; }
  input, select, textarea { width:100%; font-size:18px; padding:11px; background:#0d0f0d; color:var(--text); border:1px solid var(--line); border-radius:6px; }
  textarea { min-height:90px; }
  button.action { font-size:18px; padding:11px 22px; margin-top:14px; background:var(--green); color:#101210; font-weight:700; border:0; border-radius:6px; cursor:pointer; }
  button.secondary { background:#2a2f2a; color:var(--text); border:1px solid var(--line); }
  button.danger { background:transparent; color:var(--danger); border:1px solid var(--danger); padding:7px 14px; font-size:16px; margin:0; }
  table { width:100%; border-collapse:collapse; margin-top:10px; }
  th, td { text-align:left; padding:10px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--muted); font-size:16px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; }
  .card { border:1px solid var(--line); border-radius:8px; padding:16px; background:#141614; }
  .card .big { font-size:21px; font-weight:700; word-break:break-all; }
  .muted { color:var(--muted); }
  .status { margin-top:12px; min-height:1.5em; }
  .ok { color:var(--green); font-weight:700; }
  img.result { max-width:100%; border-radius:8px; margin-top:16px; border:1px solid var(--line); }
  .row { display:flex; gap:10px; flex-wrap:wrap; align-items:end; }
  .row > div { flex:1; min-width:220px; }
  code { background:#0d0f0d; padding:2px 6px; border-radius:4px; word-break:break-all; }
  :focus-visible { outline:3px solid var(--green); outline-offset:2px; }
</style>
</head>
<body>
<header>
  <h1>BLG Proxy Admin</h1>
  <p class="sub">Eine API für Chat, Bilder und Statistik. Hier verwaltest du Modelle und Zugangs-Keys.</p>
</header>
<main>
  <section class="panel" aria-labelledby="login-h">
    <h2 id="login-h">Anmeldung</h2>
    <label for="adminToken">Admin-Token</label>
    <input id="adminToken" type="password" autocomplete="off" placeholder="Admin-Token einfügen">
    <div class="row">
      <button class="action" id="loginBtn" type="button">Anmelden und laden</button>
    </div>
    <p class="status" id="loginStatus" role="status" aria-live="polite"></p>
    <label for="clientToken">Dein API-Key für Bilder und Chat (Master-Token oder erstellter Key)</label>
    <input id="clientToken" type="password" autocomplete="off" placeholder="Wird nur in diesem Browser-Tab gespeichert">
  </section>

  <div class="tabs" role="tablist" aria-label="Bereiche">
    <button role="tab" id="tab-stats" aria-controls="panel-stats" aria-selected="true" type="button">Statistik</button>
    <button role="tab" id="tab-models" aria-controls="panel-models" aria-selected="false" type="button">Modelle</button>
    <button role="tab" id="tab-keys" aria-controls="panel-keys" aria-selected="false" type="button">API-Keys</button>
    <button role="tab" id="tab-images" aria-controls="panel-images" aria-selected="false" type="button">Bilder</button>
  </div>

  <section class="panel" id="panel-stats" role="tabpanel" aria-labelledby="tab-stats">
    <h2>NIMStats: beste NVIDIA-Modelle</h2>
    <p class="muted">Live von NIMStats geholt. Achtung: Der Sieger dort läuft nicht immer mit deinen Keys. Deine Routen bleiben getestet.</p>
    <div class="cards" id="statsCards"><p>Noch nicht geladen. Bitte zuerst anmelden.</p></div>
    <h2 style="margin-top:26px">Deine Modelle</h2>
    <div id="statsModels"><p class="muted">Noch nicht geladen.</p></div>
    <h2 style="margin-top:26px">NVIDIA-Keys bei Cloudflare</h2>
    <div id="statsKeys"><p class="muted">Noch nicht geladen.</p></div>
  </section>

  <section class="panel" id="panel-models" role="tabpanel" aria-labelledby="tab-models" hidden>
    <h2>Modelle verwalten</h2>
    <div id="modelTable"><p class="muted">Noch nicht geladen.</p></div>
    <h2 style="margin-top:26px">Modell hinzufügen</h2>
    <label for="newName">Anzeigename (so rufst du es später auf, zum Beispiel schnell)</label>
    <input id="newName" type="text" placeholder="schnell">
    <label for="newModel">Echtes Modell bei NVIDIA</label>
    <input id="newModel" type="text" list="knownModels" placeholder="nvidia/nemotron-3-ultra-550b-a55b">
    <datalist id="knownModels">
      <option value="nvidia/nemotron-3-ultra-550b-a55b"></option>
      <option value="mistralai/mistral-large-4-1t-a52b"></option>
      <option value="nvidia/nemotron-3.5-super-vl-120b-a12b"></option>
      <option value="nvidia/nemotron-3.5-lightning-30b-a3b"></option>
      <option value="nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"></option>
      <option value="nvidia/nemotron-3.5-bolt-e4b"></option>
      <option value="poolside/laguna-xs-2.1"></option>
      <option value="meta/llama-3.2-90b-vision-instruct"></option>
    </datalist>
    <button class="action" id="addModelBtn" type="button">Modell speichern</button>
    <button class="action secondary" id="resetModelsBtn" type="button">Auf Standard zurücksetzen</button>
    <p class="status" id="modelStatus" role="status" aria-live="polite"></p>
  </section>

  <section class="panel" id="panel-keys" role="tabpanel" aria-labelledby="tab-keys" hidden>
    <h2>API-Keys für Nutzer erstellen</h2>
    <p class="muted">Ein erstellter Key gilt für Chat und Bilder. Der volle Key wird nur einmal gezeigt. Löschen sperrt ihn sofort.</p>
    <div id="keyTable"><p class="muted">Noch nicht geladen.</p></div>
    <label for="keyName">Name für den neuen Key, zum Beispiel Handy oder Chatbox</label>
    <input id="keyName" type="text" placeholder="Handy">
    <button class="action" id="createKeyBtn" type="button">Neuen Key erstellen</button>
    <label for="newKeyOut">Neuer Key (bitte gleich kopieren)</label>
    <input id="newKeyOut" type="text" readonly placeholder="Noch kein neuer Key">
    <p class="status" id="keyStatus" role="status" aria-live="polite"></p>
  </section>

  <section class="panel" id="panel-images" role="tabpanel" aria-labelledby="tab-images" hidden>
    <h2>Bild erstellen</h2>
    <label for="prompt">Was soll auf dem Bild sein?</label>
    <textarea id="prompt" placeholder="Ein Roboter kocht Frühstück in einer kleinen Küche"></textarea>
    <div class="row">
      <div>
        <label for="engine">Bild-Maschine</label>
        <select id="engine">
          <option value="sdxl-lightning">Schnell (SDXL Lightning, etwa 4 Sekunden)</option>
          <option value="sdxl">Beste Qualität (SDXL, etwa 10 bis 25 Sekunden)</option>
          <option value="dreamshaper">DreamShaper (etwa 3 Sekunden)</option>
          <option value="pollinations-flux">Pollinations Flux (kostenlos, extern)</option>
        </select>
      </div>
    </div>
    <div class="row" aria-label="Beispiele">
      <button class="action secondary preset" type="button" data-p="Cyberpunk-Stadt bei Nacht, Regen, Neonlicht">Beispiel: Cyberpunk-Stadt</button>
      <button class="action secondary preset" type="button" data-p="Raumstation über der Erde bei Sonnenaufgang">Beispiel: Weltraum</button>
      <button class="action secondary preset" type="button" data-p="Ein freundlicher Roboter kocht Frühstück">Beispiel: Roboter</button>
    </div>
    <button class="action" id="genBtn" type="button">Bild erstellen</button>
    <p class="status" id="imgStatus" role="status" aria-live="polite"></p>
    <img class="result" id="imgOut" alt="Erstelltes Bild" hidden>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const adminHeaders = () => ({ 'x-admin-token': sessionStorage.getItem('blg_admin') || '', 'Content-Type': 'application/json' });

document.querySelectorAll('[role="tab"]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[role="tab"]').forEach((t) => t.setAttribute('aria-selected', 'false'));
    document.querySelectorAll('[role="tabpanel"]').forEach((p) => { p.hidden = true; });
    tab.setAttribute('aria-selected', 'true');
    $(tab.getAttribute('aria-controls')).hidden = false;
  });
});

async function api(path, options) {
  const res = await fetch(path, Object.assign({ headers: adminHeaders() }, options || {}));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error && data.error.message ? data.error.message : ('Fehler ' + res.status));
  return data;
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function renderStats(stats) {
  const card = (title, d) => {
    if (!d || d.error) return '<div class="card"><h3>' + esc(title) + '</h3><p class="muted">Nicht verfügbar: ' + esc(d && d.error ? d.error : 'keine Daten') + '</p></div>';
    return '<div class="card"><h3>' + esc(title) + '</h3><p class="big">' + esc(d.best_model) + '</p>' +
      '<p>Punkte: ' + esc(d.score) + '<br>Verfügbar: ' + esc(d.uptime) + ' Prozent<br>Antwortzeit im Schnitt: ' + esc(Math.round(d.avg_response_time_ms || 0)) + ' Millisekunden<br>Tempo: ' + esc(d.avg_throughput_tps) + ' Token pro Sekunde<br>Läufe: ' + esc(d.success_count) + ' von ' + esc(d.total_runs) + ' erfolgreich</p></div>';
  };
  $('statsCards').innerHTML = card('Insgesamt bestes', stats.balanced) + card('Schnellstes', stats.speed) + card('Kluegstes', stats.intelligence);
}

function renderOverview(data) {
  const rows = Object.entries(data.routes).map(([name, providers]) =>
    '<tr><td><strong>' + esc(name) + '</strong></td><td>' + providers.map((p) => esc(p.model)).join('<br>') + '</td></tr>').join('');
  $('statsModels').innerHTML = '<table><thead><tr><th>Dein Name</th><th>Echtes Modell dahinter</th></tr></thead><tbody>' + rows + '</tbody></table>';
  $('modelTable').innerHTML = '<table><thead><tr><th>Dein Name</th><th>Echtes Modell</th><th>Aktion</th></tr></thead><tbody>' +
    Object.entries(data.routes).map(([name, providers]) =>
      '<tr><td><strong>' + esc(name) + '</strong></td><td>' + providers.map((p) => esc(p.model)).join('<br>') + '</td>' +
      '<td><button class="danger" type="button" data-del-model="' + esc(name) + '">Löschen</button></td></tr>').join('') + '</tbody></table>';
  document.querySelectorAll('[data-del-model]').forEach((btn) => btn.addEventListener('click', async () => {
    const name = btn.getAttribute('data-del-model');
    if (!confirm('Modell ' + name + ' wirklich löschen?')) return;
    try { await api('/admin/api/models/' + encodeURIComponent(name), { method: 'DELETE' }); $('modelStatus').textContent = 'Gelöscht: ' + name; await loadAll(); }
    catch (e) { $('modelStatus').textContent = e.message; }
  }));
  $('statsKeys').innerHTML = Object.entries(data.upstreamKeys).map(([name, ok]) =>
    '<p>' + esc(name) + ': <strong class="' + (ok ? 'ok' : '') + '">' + (ok ? 'vorhanden' : 'fehlt') + '</strong></p>').join('') +
    '<p class="muted">Die echten NVIDIA-Keys bleiben Geheimnisse bei Cloudflare. Hier erstellst du Zugangs-Keys für Nutzer.</p>';
  $('keyTable').innerHTML = data.clientKeys.length
    ? '<table><thead><tr><th>Name</th><th>Key-Anfang</th><th>Erstellt</th><th>Aktion</th></tr></thead><tbody>' +
      data.clientKeys.map((k) => '<tr><td>' + esc(k.name) + '</td><td><code>' + esc(k.prefix) + '...</code></td><td>' + esc(new Date(k.createdAt).toLocaleString('de-DE')) + '</td>' +
        '<td><button class="danger" type="button" data-del-key="' + esc(k.id) + '">Löschen</button></td></tr>').join('') + '</tbody></table>'
    : '<p class="muted">Noch keine erstellten Keys. Das Master-Token gilt weiterhin.</p>';
  document.querySelectorAll('[data-del-key]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Diesen Key wirklich löschen? Er hört sofort auf zu funktionieren.')) return;
    try { await api('/admin/api/keys/' + encodeURIComponent(btn.getAttribute('data-del-key')), { method: 'DELETE' }); $('keyStatus').textContent = 'Key gelöscht.'; await loadAll(); }
    catch (e) { $('keyStatus').textContent = e.message; }
  }));
}

async function loadAll() {
  $('loginStatus').textContent = 'Lade Daten...';
  const overview = await api('/admin/api/overview');
  renderOverview(overview);
  const stats = await api('/admin/api/stats');
  renderStats(stats);
  $('loginStatus').innerHTML = '<span class="ok">Angemeldet. Daten geladen.</span>';
}

$('loginBtn').addEventListener('click', async () => {
  sessionStorage.setItem('blg_admin', $('adminToken').value.trim());
  sessionStorage.setItem('blg_client', $('clientToken').value.trim());
  try { await loadAll(); } catch (e) { $('loginStatus').textContent = 'Anmeldung fehlgeschlagen: ' + e.message; }
});
$('clientToken').addEventListener('change', () => sessionStorage.setItem('blg_client', $('clientToken').value.trim()));

$('addModelBtn').addEventListener('click', async () => {
  try {
    await api('/admin/api/models', { method: 'POST', body: JSON.stringify({ name: $('newName').value.trim(), model: $('newModel').value.trim() }) });
    $('modelStatus').textContent = 'Modell gespeichert: ' + $('newName').value.trim();
    await loadAll();
  } catch (e) { $('modelStatus').textContent = e.message; }
});
$('resetModelsBtn').addEventListener('click', async () => {
  if (!confirm('Alle Modell-Änderungen verwerfen und auf Standard zurück?')) return;
  try { await api('/admin/api/routes/reset', { method: 'POST' }); $('modelStatus').textContent = 'Auf Standard zurückgesetzt.'; await loadAll(); }
  catch (e) { $('modelStatus').textContent = e.message; }
});
$('createKeyBtn').addEventListener('click', async () => {
  try {
    const data = await api('/admin/api/keys', { method: 'POST', body: JSON.stringify({ name: $('keyName').value.trim() }) });
    $('newKeyOut').value = data.key;
    $('keyStatus').textContent = 'Key erstellt. Bitte jetzt kopieren, er wird nicht noch einmal gezeigt.';
    await loadAll();
  } catch (e) { $('keyStatus').textContent = e.message; }
});
document.querySelectorAll('.preset').forEach((btn) => btn.addEventListener('click', () => { $('prompt').value = btn.getAttribute('data-p'); }));

$('genBtn').addEventListener('click', async () => {
  const prompt = $('prompt').value.trim();
  const engine = $('engine').value;
  const clientKey = sessionStorage.getItem('blg_client') || '';
  if (!prompt) { $('imgStatus').textContent = 'Bitte zuerst beschreiben, was auf dem Bild sein soll.'; return; }
  if (!clientKey) { $('imgStatus').textContent = 'Bitte oben deinen API-Key eintragen (Master-Token oder erstellter Key).'; return; }
  $('imgStatus').textContent = 'Bild wird erstellt, das dauert ein paar Sekunden...';
  $('imgOut').hidden = true;
  try {
    const res = await fetch('/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + clientKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: engine }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error && d.error.message ? d.error.message : ('Fehler ' + res.status)); }
    const type = res.headers.get('Content-Type') || '';
    if (type.includes('application/json')) {
      const data = await res.json();
      $('imgOut').src = data.data[0].url;
    } else {
      const blob = await res.blob();
      $('imgOut').src = URL.createObjectURL(blob);
    }
    $('imgOut').hidden = false;
    $('imgStatus').innerHTML = '<span class="ok">Bild fertig.</span>';
  } catch (e) { $('imgStatus').textContent = 'Fehler: ' + e.message; }
});

if (sessionStorage.getItem('blg_admin')) { $('adminToken').value = sessionStorage.getItem('blg_admin'); }
if (sessionStorage.getItem('blg_client')) { $('clientToken').value = sessionStorage.getItem('blg_client'); }
</script>
</body>
</html>
`;
}
