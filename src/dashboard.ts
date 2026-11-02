export function dashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BLG Proxy – Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Rajdhani:wght@400;600;700&display=swap" rel="stylesheet">
<style>
/* BKG Cyberpunk Boilerplate (aus /srv/bkg/design-system/boilerplate.css), Schriftgroessen fuer Lesbarkeit angehoben */
:root{
  --cyber-bg-deep:#020407; --cyber-bg:#05070a; --cyber-panel:#080d12; --cyber-panel-2:#0b1118; --cyber-panel-3:#0e151d;
  --neon-cyan:#00f6ff; --neon-cyan-bright:#5cffff; --neon-cyan-dark:#007f87; --neon-cyan-alpha:rgba(0,246,255,.15);
  --neon-magenta:#ff00e5; --neon-magenta-dark:#850078;
  --neon-amber:#ffb000; --neon-red:#ff1744; --neon-red-bright:#ff4d6d; --neon-green:#39ff14;
  --text-primary:#d7faff; --text-secondary:#9db4be; --text-muted:#5f7681;
  --border:#17252d; --border-hover:#007f87; --border-active:#00f6ff;
  --font-mono:'JetBrains Mono','IBM Plex Mono',monospace; --font-ui:'Rajdhani','Share Tech',system-ui,sans-serif;
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-6:24px; --sp-8:32px;
  --r-sm:2px; --r-md:4px; --r-lg:6px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--cyber-bg);color:var(--text-primary);font-family:var(--font-ui);font-size:19px;line-height:1.55;min-height:100vh;-webkit-font-smoothing:antialiased;
  background-image:linear-gradient(rgba(0,246,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(0,246,255,.018) 1px,transparent 1px),radial-gradient(circle at 50% 0%,rgba(0,246,255,.04),transparent 50%);
  background-size:40px 40px,40px 40px,100% 100%;background-attachment:fixed}
h1,h2,h3{font-family:var(--font-ui);font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--text-primary)}
h1{font-size:32px} h2{font-size:24px;margin-bottom:12px} h3{font-size:20px}
code,.mono{font-family:var(--font-mono);font-size:.85em}
header{padding:24px 24px 4px;max-width:1150px;margin:0 auto}
header .sub{color:var(--text-secondary);font-size:19px}
main{padding:16px 24px 48px;max-width:1150px;margin:0 auto}
.cyber-panel{background:var(--cyber-panel);border:1px solid var(--border);border-radius:var(--r-sm);padding:20px;margin-bottom:20px;transition:border-color .2s}
.cyber-panel:hover{border-color:var(--border-hover)}
.cyber-panel-header{padding:var(--sp-2) var(--sp-3);border:1px solid var(--border);border-bottom:0;background:var(--cyber-panel-2);font-family:var(--font-mono);font-size:15px;color:var(--neon-cyan);letter-spacing:.15em;text-transform:uppercase}
.btn{display:inline-flex;align-items:center;gap:var(--sp-2);padding:12px 20px;background:transparent;border:1px solid var(--border);border-radius:var(--r-sm);color:var(--text-secondary);font-family:var(--font-mono);font-size:16px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;transition:all .2s;white-space:nowrap}
.btn:hover:not(:disabled){border-color:var(--neon-cyan-dark);color:var(--neon-cyan);box-shadow:0 0 6px rgba(0,246,255,.2)}
.btn-primary{border-color:var(--neon-cyan-dark);color:var(--neon-cyan)}
.btn-primary:hover:not(:disabled){background:rgba(0,246,255,.08);box-shadow:0 0 10px rgba(0,246,255,.3)}
.btn-ai{border-color:var(--neon-magenta-dark);color:var(--neon-magenta)}
.btn-danger{border-color:var(--neon-red);color:var(--neon-red-bright);padding:8px 14px;font-size:15px}
.btn-danger:hover:not(:disabled){background:rgba(255,23,68,.15);color:var(--neon-red-bright);box-shadow:0 0 8px rgba(255,23,68,.3)}
input,textarea,select{background:#030609;color:var(--text-primary);border:1px solid #1a3138;border-radius:var(--r-sm);padding:12px;font-family:var(--font-mono);font-size:17px;outline:none;transition:border-color .2s,box-shadow .2s;width:100%}
input::placeholder,textarea::placeholder{color:var(--text-muted)}
input:focus,textarea:focus,select:focus{border-color:var(--neon-cyan);box-shadow:0 0 8px rgba(0,246,255,.25)}
textarea{resize:vertical;min-height:90px}
label{display:block;font-weight:600;margin:16px 0 6px;font-family:var(--font-ui);letter-spacing:.04em}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 20px}
.tabs .btn[aria-selected="true"]{background:var(--neon-cyan);color:#02141a;border-color:var(--neon-cyan);font-weight:700}
[hidden]{display:none!important}
.cyber-table{width:100%;border-collapse:collapse;font-family:var(--font-mono);font-size:16px}
.cyber-table th{padding:var(--sp-2) var(--sp-3);text-align:left;font-size:14px;text-transform:uppercase;letter-spacing:.12em;color:var(--neon-cyan);border-bottom:1px solid var(--border);background:var(--cyber-panel-2);white-space:nowrap}
.cyber-table td{padding:var(--sp-2) var(--sp-3);border-bottom:1px solid var(--border);color:var(--text-secondary);vertical-align:top}
.cyber-table tr:hover td{background:var(--cyber-panel-3);color:var(--text-primary)}
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:var(--r-sm);font-family:var(--font-mono);font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}
.badge-cyan{background:rgba(0,246,255,.1);color:var(--neon-cyan);border:1px solid rgba(0,246,255,.3)}
.badge-green{background:rgba(57,255,20,.1);color:var(--neon-green);border:1px solid rgba(57,255,20,.3)}
.badge-red{background:rgba(255,23,68,.1);color:var(--neon-red-bright);border:1px solid rgba(255,23,68,.3)}
.badge-muted{background:rgba(64,81,91,.2);color:var(--text-muted);border:1px solid var(--border)}
.led{display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0}
.led-online{background:var(--neon-green);box-shadow:0 0 5px var(--neon-green)}
.led-error{background:var(--neon-red);box-shadow:0 0 5px var(--neon-red)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.card{background:var(--cyber-panel-2);border:1px solid var(--border);border-radius:var(--r-sm);padding:16px}
.card .big{font-size:21px;font-weight:700;word-break:break-all;color:var(--neon-cyan-bright);font-family:var(--font-mono)}
.muted{color:var(--text-secondary)}
.status{margin-top:12px;min-height:1.5em}
.ok{color:var(--neon-green);font-weight:700}
img.result{max-width:100%;border-radius:var(--r-lg);margin-top:16px;border:1px solid var(--border-hover)}
audio{width:100%;margin-top:16px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
.row>div{flex:1;min-width:220px}
.action-row{margin-top:16px;display:flex;gap:10px;flex-wrap:wrap}
:focus-visible{outline:3px solid var(--neon-cyan);outline-offset:2px}
::-webkit-scrollbar{width:6px;height:6px} ::-webkit-scrollbar-track{background:var(--cyber-bg-deep)} ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
@media (max-width:768px){.cyber-table{display:block;overflow-x:auto}}
</style>
</head>
<body>
<header>
  <h1>BLG Proxy <span style="color:var(--neon-cyan)">Admin</span></h1>
  <p class="sub">Eine API für Chat, Bilder, Sprache und Statistik. Hier verwaltest du Modelle und Zugangs-Keys.</p>
</header>
<main>
  <div class="cyber-panel-header">Zugang</div>
  <section class="cyber-panel" aria-labelledby="login-h" style="border-top:0">
    <h2 id="login-h">Anmeldung</h2>
    <label for="adminToken">Admin-Token</label>
    <input id="adminToken" type="password" autocomplete="off" placeholder="Admin-Token einfügen">
    <label for="clientToken">Dein API-Key für Chat, Bilder und Sprache (Master-Token oder erstellter Key)</label>
    <input id="clientToken" type="password" autocomplete="off" placeholder="Wird nur in diesem Browser-Tab gespeichert">
    <div class="action-row"><button class="btn btn-primary" id="loginBtn" type="button">Anmelden und laden</button></div>
    <p class="status" id="loginStatus" role="status" aria-live="polite"></p>
  </section>

  <div class="tabs" role="tablist" aria-label="Bereiche">
    <button class="btn" role="tab" id="tab-stats" aria-controls="panel-stats" aria-selected="true" type="button">Statistik</button>
    <button class="btn" role="tab" id="tab-models" aria-controls="panel-models" aria-selected="false" type="button">Modelle</button>
    <button class="btn" role="tab" id="tab-keys" aria-controls="panel-keys" aria-selected="false" type="button">API-Keys</button>
    <button class="btn" role="tab" id="tab-images" aria-controls="panel-images" aria-selected="false" type="button">Bilder</button>
    <button class="btn btn-ai" role="tab" id="tab-speech" aria-controls="panel-speech" aria-selected="false" type="button">Sprache</button>
  </div>

  <section class="cyber-panel" id="panel-stats" role="tabpanel" aria-labelledby="tab-stats">
    <h2>NIMStats: beste NVIDIA-Modelle</h2>
    <p class="muted">Live von NIMStats geholt. Achtung: Der Sieger dort läuft nicht immer mit deinen Keys. Deine Routen bleiben getestet.</p>
    <div class="cards" id="statsCards" style="margin-top:14px"><p>Noch nicht geladen. Bitte zuerst anmelden.</p></div>
    <h2 style="margin-top:28px">Deine Modelle</h2>
    <div id="statsModels"><p class="muted">Noch nicht geladen.</p></div>
    <h2 style="margin-top:28px">NVIDIA-Keys bei Cloudflare</h2>
    <div id="statsKeys"><p class="muted">Noch nicht geladen.</p></div>
  </section>

  <section class="cyber-panel" id="panel-models" role="tabpanel" aria-labelledby="tab-models" hidden>
    <h2>Modelle verwalten</h2>
    <div id="modelTable"><p class="muted">Noch nicht geladen.</p></div>
    <h2 style="margin-top:28px">Modell hinzufügen</h2>
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
    <div class="action-row">
      <button class="btn btn-primary" id="addModelBtn" type="button">Modell speichern</button>
      <button class="btn" id="resetModelsBtn" type="button">Auf Standard zurücksetzen</button>
    </div>
    <p class="status" id="modelStatus" role="status" aria-live="polite"></p>
  </section>

  <section class="cyber-panel" id="panel-keys" role="tabpanel" aria-labelledby="tab-keys" hidden>
    <h2>API-Keys für Nutzer erstellen</h2>
    <p class="muted">Ein erstellter Key gilt für Chat, Bilder und Sprache. Der volle Key wird nur einmal gezeigt. Löschen sperrt ihn sofort.</p>
    <div id="keyTable"><p class="muted">Noch nicht geladen.</p></div>
    <label for="keyName">Name für den neuen Key, zum Beispiel Handy oder Chatbox</label>
    <input id="keyName" type="text" placeholder="Handy">
    <div class="action-row"><button class="btn btn-primary" id="createKeyBtn" type="button">Neuen Key erstellen</button></div>
    <label for="newKeyOut">Neuer Key (bitte gleich kopieren)</label>
    <input id="newKeyOut" type="text" readonly placeholder="Noch kein neuer Key">
    <p class="status" id="keyStatus" role="status" aria-live="polite"></p>
  </section>

  <section class="cyber-panel" id="panel-images" role="tabpanel" aria-labelledby="tab-images" hidden>
    <h2>Bild erstellen</h2>
    <label for="prompt">Was soll auf dem Bild sein?</label>
    <textarea id="prompt" placeholder="Ein Roboter kocht Frühstück in einer kleinen Küche"></textarea>
    <label for="engine">Bild-Maschine</label>
    <select id="engine">
      <option value="sdxl-lightning">Schnell (SDXL Lightning, etwa 4 Sekunden)</option>
      <option value="sdxl">Beste Qualität (SDXL, etwa 10 bis 25 Sekunden)</option>
      <option value="dreamshaper">DreamShaper (etwa 3 Sekunden)</option>
      <option value="pollinations-flux">Pollinations Flux (kostenlos, extern)</option>
    </select>
    <div class="action-row" aria-label="Beispiele">
      <button class="btn preset" type="button" data-p="Cyberpunk-Stadt bei Nacht, Regen, Neonlicht">Beispiel: Cyberpunk-Stadt</button>
      <button class="btn preset" type="button" data-p="Raumstation über der Erde bei Sonnenaufgang">Beispiel: Weltraum</button>
      <button class="btn preset" type="button" data-p="Ein freundlicher Roboter kocht Frühstück">Beispiel: Roboter</button>
    </div>
    <div class="action-row"><button class="btn btn-primary" id="genBtn" type="button">Bild erstellen</button></div>
    <p class="status" id="imgStatus" role="status" aria-live="polite"></p>
    <img class="result" id="imgOut" alt="Erstelltes Bild" hidden>
  </section>

  <section class="cyber-panel" id="panel-speech" role="tabpanel" aria-labelledby="tab-speech" hidden>
    <h2>Text vorlesen (Microsoft Edge Stimmen)</h2>
    <p class="muted">Kostenlose Edge-Stimmen über deine API. Der Ton wird sofort abgespielt.</p>
    <label for="speechText">Text zum Vorlesen</label>
    <textarea id="speechText" placeholder="Hallo, wie geht es dir heute?">Hallo! Dein Proxy kann jetzt auch sprechen.</textarea>
    <label for="voice">Stimme</label>
    <select id="voice">
      <option value="de-DE-KatjaNeural">Deutsch, Katja (Frau)</option>
      <option value="de-DE-ConradNeural">Deutsch, Conrad (Mann)</option>
      <option value="de-DE-AmalaNeural">Deutsch, Amala (Frau)</option>
      <option value="de-DE-KillianNeural">Deutsch, Killian (Mann)</option>
      <option value="en-US-AvaMultilingualNeural">Englisch, Ava (Standard)</option>
      <option value="en-GB-SoniaNeural">Englisch GB, Sonia</option>
    </select>
    <div class="action-row">
      <button class="btn btn-ai" id="speakBtn" type="button">Vorlesen</button>
      <button class="btn" id="loadVoicesBtn" type="button">Alle Stimmen laden</button>
    </div>
    <p class="status" id="speechStatus" role="status" aria-live="polite"></p>
    <audio id="audioOut" controls hidden></audio>
    <div class="action-row"><a class="btn" id="downloadAudio" href="#" download="sprache.mp3" hidden>MP3 herunterladen</a></div>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const adminHeaders = () => ({ 'x-admin-token': sessionStorage.getItem('blg_admin') || '', 'Content-Type': 'application/json' });
const clientKey = () => sessionStorage.getItem('blg_client') || '';

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
  $('statsModels').innerHTML = '<table class="cyber-table"><thead><tr><th>Dein Name</th><th>Echtes Modell dahinter</th></tr></thead><tbody>' +
    Object.entries(data.routes).map(([name, providers]) => '<tr><td><strong>' + esc(name) + '</strong></td><td>' + providers.map((p) => esc(p.model)).join('<br>') + '</td></tr>').join('') + '</tbody></table>';
  $('modelTable').innerHTML = '<table class="cyber-table"><thead><tr><th>Dein Name</th><th>Echtes Modell</th><th>Aktion</th></tr></thead><tbody>' +
    Object.entries(data.routes).map(([name, providers]) =>
      '<tr><td><strong>' + esc(name) + '</strong></td><td>' + providers.map((p) => esc(p.model)).join('<br>') + '</td>' +
      '<td><button class="btn btn-danger" type="button" data-del-model="' + esc(name) + '">Löschen</button></td></tr>').join('') + '</tbody></table>';
  document.querySelectorAll('[data-del-model]').forEach((btn) => btn.addEventListener('click', async () => {
    const name = btn.getAttribute('data-del-model');
    if (!confirm('Modell ' + name + ' wirklich löschen?')) return;
    try { await api('/admin/api/models/' + encodeURIComponent(name), { method: 'DELETE' }); $('modelStatus').textContent = 'Gelöscht: ' + name; await loadAll(); }
    catch (e) { $('modelStatus').textContent = e.message; }
  }));
  $('statsKeys').innerHTML = Object.entries(data.upstreamKeys).map(([name, ok]) =>
    '<p><span class="led ' + (ok ? 'led-online' : 'led-error') + '"></span> ' + esc(name) + ': <span class="badge ' + (ok ? 'badge-green' : 'badge-red') + '">' + (ok ? 'vorhanden' : 'fehlt') + '</span></p>').join('') +
    '<p class="muted" style="margin-top:10px">Die echten NVIDIA-Keys bleiben Geheimnisse bei Cloudflare. Hier erstellst du Zugangs-Keys für Nutzer.</p>';
  $('keyTable').innerHTML = data.clientKeys.length
    ? '<table class="cyber-table"><thead><tr><th>Name</th><th>Key-Anfang</th><th>Erstellt</th><th>Aktion</th></tr></thead><tbody>' +
      data.clientKeys.map((k) => '<tr><td>' + esc(k.name) + '</td><td><code>' + esc(k.prefix) + '...</code></td><td>' + esc(new Date(k.createdAt).toLocaleString('de-DE')) + '</td>' +
        '<td><button class="btn btn-danger" type="button" data-del-key="' + esc(k.id) + '">Löschen</button></td></tr>').join('') + '</tbody></table>'
    : '<p class="muted">Noch keine erstellten Keys. Das Master-Token gilt weiterhin.</p>';
  document.querySelectorAll('[data-del-key]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Diesen Key wirklich löschen? Er hört sofort auf zu funktionieren.')) return;
    try { await api('/admin/api/keys/' + encodeURIComponent(btn.getAttribute('data-del-key')), { method: 'DELETE' }); $('keyStatus').textContent = 'Key gelöscht.'; await loadAll(); }
    catch (e) { $('keyStatus').textContent = e.message; }
  }));
}

async function loadAll() {
  $('loginStatus').textContent = 'Lade Daten...';
  renderOverview(await api('/admin/api/overview'));
  renderStats(await api('/admin/api/stats'));
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
  if (!prompt) { $('imgStatus').textContent = 'Bitte zuerst beschreiben, was auf dem Bild sein soll.'; return; }
  if (!clientKey()) { $('imgStatus').textContent = 'Bitte oben deinen API-Key eintragen (Master-Token oder erstellter Key).'; return; }
  $('imgStatus').textContent = 'Bild wird erstellt, das dauert ein paar Sekunden...';
  $('imgOut').hidden = true;
  try {
    const res = await fetch('/v1/images/generations', { method: 'POST', headers: { 'Authorization': 'Bearer ' + clientKey(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, model: $('engine').value }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error && d.error.message ? d.error.message : ('Fehler ' + res.status)); }
    if ((res.headers.get('Content-Type') || '').includes('application/json')) {
      const data = await res.json();
      $('imgOut').src = data.data[0].url;
    } else {
      $('imgOut').src = URL.createObjectURL(await res.blob());
    }
    $('imgOut').hidden = false;
    $('imgStatus').innerHTML = '<span class="ok">Bild fertig.</span>';
  } catch (e) { $('imgStatus').textContent = 'Fehler: ' + e.message; }
});

$('speakBtn').addEventListener('click', async () => {
  const text = $('speechText').value.trim();
  if (!text) { $('speechStatus').textContent = 'Bitte zuerst einen Text eingeben.'; return; }
  if (!clientKey()) { $('speechStatus').textContent = 'Bitte oben deinen API-Key eintragen (Master-Token oder erstellter Key).'; return; }
  $('speechStatus').textContent = 'Stimme wird erstellt...';
  try {
    const res = await fetch('/v1/audio/speech', { method: 'POST', headers: { 'Authorization': 'Bearer ' + clientKey(), 'Content-Type': 'application/json' }, body: JSON.stringify({ input: text, voice: $('voice').value }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error && d.error.message ? d.error.message : ('Fehler ' + res.status)); }
    const url = URL.createObjectURL(await res.blob());
    $('audioOut').src = url;
    $('audioOut').hidden = false;
    $('downloadAudio').href = url;
    $('downloadAudio').hidden = false;
    await $('audioOut').play().catch(() => {});
    $('speechStatus').innerHTML = '<span class="ok">Fertig. Die Stimme läuft.</span>';
  } catch (e) { $('speechStatus').textContent = 'Fehler: ' + e.message; }
});

$('loadVoicesBtn').addEventListener('click', async () => {
  if (!clientKey()) { $('speechStatus').textContent = 'Bitte oben deinen API-Key eintragen.'; return; }
  $('speechStatus').textContent = 'Lade alle Stimmen...';
  try {
    const res = await fetch('/v1/audio/voices', { headers: { 'Authorization': 'Bearer ' + clientKey() } });
    if (!res.ok) throw new Error('Fehler ' + res.status);
    const data = await res.json();
    const current = $('voice').value;
    $('voice').innerHTML = data.voices.map((v) => '<option value="' + esc(v.ShortName) + '">' + esc(v.Locale) + ' – ' + esc(v.ShortName) + ' (' + esc(v.Gender) + ')</option>').join('');
    if (data.voices.some((v) => v.ShortName === current)) $('voice').value = current;
    $('speechStatus').textContent = data.voices.length + ' Stimmen geladen.';
  } catch (e) { $('speechStatus').textContent = 'Fehler: ' + e.message; }
});

if (sessionStorage.getItem('blg_admin')) { $('adminToken').value = sessionStorage.getItem('blg_admin'); }
if (sessionStorage.getItem('blg_client')) { $('clientToken').value = sessionStorage.getItem('blg_client'); }
</script>
</body>
</html>
`;
}
