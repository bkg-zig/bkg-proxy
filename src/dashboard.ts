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
:root{
  --cyber-bg:#05070a; --cyber-bg-deep:#020407; --cyber-panel:#080d12; --cyber-panel-2:#0b1118; --cyber-panel-3:#0e151d;
  --neon-cyan:#00f6ff; --neon-cyan-bright:#5cffff; --neon-cyan-dark:#007f87;
  --neon-magenta:#ff00e5; --neon-magenta-dark:#850078; --neon-amber:#ffb000; --neon-red:#ff1744; --neon-red-bright:#ff4d6d; --neon-green:#39ff14; --neon-orange:#ff6b00;
  --text-primary:#d7faff; --text-secondary:#9db4be; --text-muted:#5f7681;
  --border:#17252d; --border-hover:#007f87; --border-active:#00f6ff;
  --font-mono:'JetBrains Mono',monospace; --font-ui:'Rajdhani',system-ui,sans-serif;
  --r-sm:2px; --r-lg:6px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--cyber-bg);color:var(--text-primary);font-family:var(--font-ui);font-size:18px;line-height:1.5;min-height:100vh;
  background-image:linear-gradient(rgba(0,246,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(0,246,255,.018) 1px,transparent 1px),radial-gradient(circle at 50% 0%,rgba(0,246,255,.04),transparent 50%);
  background-size:40px 40px,40px 40px,100% 100%;background-attachment:fixed}
h1,h2,h3{font-weight:700;text-transform:uppercase;letter-spacing:.12em}
h1{font-size:31px} h2{font-size:23px;margin:22px 0 12px} h2:first-child{margin-top:0} h3{font-size:19px}
code{font-family:var(--font-mono);font-size:.82em}
header,main{max-width:1240px;margin:0 auto;padding-left:22px;padding-right:22px}
header{padding-top:22px}
main{padding-bottom:48px}
.sub{color:var(--text-secondary)}
.cyber-panel{background:var(--cyber-panel);border:1px solid var(--border);border-radius:var(--r-sm);padding:20px;margin-bottom:20px}
.cyber-panel:hover{border-color:var(--border-hover)}
.panel-head{font-family:var(--font-mono);font-size:14px;color:var(--neon-cyan);letter-spacing:.15em;text-transform:uppercase;border:1px solid var(--border);border-bottom:0;background:var(--cyber-panel-2);padding:8px 12px;margin-top:20px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;background:transparent;border:1px solid var(--border);border-radius:var(--r-sm);color:var(--text-secondary);font-family:var(--font-mono);font-size:15px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;cursor:pointer;white-space:nowrap}
.btn:hover{border-color:var(--neon-cyan-dark);color:var(--neon-cyan);box-shadow:0 0 6px rgba(0,246,255,.2)}
.btn-primary{border-color:var(--neon-cyan-dark);color:var(--neon-cyan)}
.btn-ai{border-color:var(--neon-magenta-dark);color:var(--neon-magenta)}
.btn-danger{border-color:var(--neon-red);color:var(--neon-red-bright);padding:7px 12px;font-size:14px}
.btn[aria-selected="true"]{background:var(--neon-cyan);color:#02141a;border-color:var(--neon-cyan)}
.btn[aria-pressed="true"]{background:var(--neon-amber);color:#181000;border-color:var(--neon-amber)}
input,textarea,select{background:#030609;color:var(--text-primary);border:1px solid #1a3138;border-radius:var(--r-sm);padding:11px;font-family:var(--font-mono);font-size:16px;outline:none;width:100%}
input:focus,textarea:focus,select:focus{border-color:var(--neon-cyan);box-shadow:0 0 8px rgba(0,246,255,.25)}
textarea{min-height:84px;resize:vertical}
label{display:block;font-weight:600;margin:14px 0 6px}
.tabs,.row{display:flex;gap:8px;flex-wrap:wrap;align-items:end}
.row>div{flex:1;min-width:200px}
.tabs{margin:18px 0}
[hidden]{display:none!important}
.cyber-table{width:100%;border-collapse:collapse;font-family:var(--font-mono);font-size:15px}
.cyber-table th{padding:9px 10px;text-align:left;font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:var(--neon-cyan);border-bottom:1px solid var(--border);background:var(--cyber-panel-2);cursor:pointer;user-select:none;white-space:nowrap}
.cyber-table td{padding:9px 10px;border-bottom:1px solid var(--border);color:var(--text-secondary);vertical-align:top}
.cyber-table tr:hover td{background:var(--cyber-panel-3);color:var(--text-primary)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:12px}
.card{background:var(--cyber-panel-2);border:1px solid var(--border);border-radius:var(--r-sm);padding:16px}
.card .big{font-size:26px;font-weight:700;font-family:var(--font-mono);color:var(--neon-cyan-bright);word-break:break-all}
.card .lbl{font-family:var(--font-mono);font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted)}
.badge{display:inline-flex;padding:2px 8px;border-radius:var(--r-sm);font-family:var(--font-mono);font-size:13px;font-weight:600;text-transform:uppercase;border:1px solid var(--border);color:var(--text-muted)}
.badge-green{color:var(--neon-green);border-color:rgba(57,255,20,.35);background:rgba(57,255,20,.08)}
.badge-red{color:var(--neon-red-bright);border-color:rgba(255,23,68,.35);background:rgba(255,23,68,.08)}
.badge-cyan{color:var(--neon-cyan);border-color:rgba(0,246,255,.35);background:rgba(0,246,255,.08)}
.badge-amber{color:var(--neon-amber);border-color:rgba(255,176,0,.35);background:rgba(255,176,0,.08)}
.led{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px}
.led-online{background:var(--neon-green);box-shadow:0 0 5px var(--neon-green)}
.led-error{background:var(--neon-red);box-shadow:0 0 5px var(--neon-red)}
.bar-track{height:12px;background:var(--cyber-panel-2);border:1px solid var(--border);overflow:hidden}
.bar-fill{height:100%;background:var(--neon-cyan);transition:width .4s}
.bar-fill.hot{background:var(--neon-amber)} .bar-fill.over{background:var(--neon-red)}
.chart{position:relative;background:#030609;border:1px solid var(--border);padding:8px;margin-top:10px}
.chart .tip{position:absolute;pointer-events:none;background:#0b1118;border:1px solid var(--neon-cyan-dark);padding:8px 10px;font-family:var(--font-mono);font-size:13px;color:var(--text-primary);display:none;z-index:5;max-width:320px}
.muted{color:var(--text-secondary)} .status{min-height:1.5em;margin-top:10px} .ok{color:var(--neon-green);font-weight:700}
img.result{max-width:100%;border:1px solid var(--border-hover);border-radius:var(--r-lg);margin-top:14px}
audio{width:100%;margin-top:14px}
.heat{display:grid;grid-template-columns:repeat(12,1fr);gap:5px;margin-top:10px}
.heat div{padding:9px 4px;text-align:center;font-family:var(--font-mono);font-size:13px;border:1px solid var(--border);background:var(--cyber-panel-2)}
:focus-visible{outline:3px solid var(--neon-cyan);outline-offset:2px}
@media (prefers-reduced-motion: reduce){*{transition-duration:.01ms!important}}
</style>
</head>
<body>
<header>
  <h1>BLG Proxy <span style="color:var(--neon-cyan)">Admin</span></h1>
  <p class="sub">Eine API für Chat, Bilder und Sprache. Alles hier wird aus echten Anfragen gemessen.</p>
</header>
<main>
  <div class="panel-head">Zugang</div>
  <section class="cyber-panel" aria-labelledby="login-h">
    <h2 id="login-h">Anmeldung</h2>
    <label for="adminToken">Admin-Token</label>
    <input id="adminToken" type="password" autocomplete="off" placeholder="Admin-Token einfügen">
    <label for="clientToken">Dein API-Key für Chat, Bilder und Sprache</label>
    <input id="clientToken" type="password" autocomplete="off" placeholder="Master-Token oder erstellter Key">
    <div class="row" style="margin-top:14px"><button class="btn btn-primary" id="loginBtn" type="button">Anmelden und laden</button></div>
    <p class="status" id="loginStatus" role="status" aria-live="polite"></p>
  </section>

  <div class="panel-head">Zeitraum für alle Auswertungen</div>
  <section class="cyber-panel" aria-label="Zeitraum">
    <div class="row" role="group" aria-label="Zeitraum wählen">
      <button class="btn rangeBtn" type="button" data-range="1h">1 Stunde</button>
      <button class="btn rangeBtn" type="button" data-range="6h">6 Stunden</button>
      <button class="btn rangeBtn" type="button" data-range="24h">24 Stunden</button>
      <button class="btn rangeBtn" type="button" data-range="7d">7 Tage</button>
      <button class="btn rangeBtn" type="button" data-range="30d">30 Tage</button>
      <button class="btn rangeBtn" type="button" data-range="all">Gesamt</button>
      <button class="btn" id="pauseBtn" type="button" aria-pressed="false">Pause</button>
    </div>
    <div class="row" style="margin-top:10px">
      <div><label for="fromInput">Von (eigen)</label><input id="fromInput" type="datetime-local"></div>
      <div><label for="toInput">Bis (eigen)</label><input id="toInput" type="datetime-local"></div>
      <div><button class="btn" id="customBtn" type="button">Eigenen Zeitraum nutzen</button></div>
    </div>
    <p class="muted" id="rangeInfo" style="margin-top:8px">Standard: eingestellter Zeitraum (30 Tage), ab der ersten Messung.</p>
  </section>

  <div class="tabs" role="tablist" aria-label="Bereiche">
    <button class="btn" role="tab" id="tab-overview" aria-controls="panel-overview" aria-selected="true" type="button">Overview</button>
    <button class="btn" role="tab" id="tab-models" aria-controls="panel-models" aria-selected="false" type="button">Models</button>
    <button class="btn" role="tab" id="tab-clients" aria-controls="panel-clients" aria-selected="false" type="button">Clients</button>
    <button class="btn" role="tab" id="tab-reliability" aria-controls="panel-reliability" aria-selected="false" type="button">Reliability</button>
    <button class="btn" role="tab" id="tab-capacity" aria-controls="panel-capacity" aria-selected="false" type="button">Capacity</button>
    <button class="btn" role="tab" id="tab-images" aria-controls="panel-images" aria-selected="false" type="button">Bilder</button>
    <button class="btn btn-ai" role="tab" id="tab-speech" aria-controls="panel-speech" aria-selected="false" type="button">Sprache</button>
    <button class="btn" role="tab" id="tab-settings" aria-controls="panel-settings" aria-selected="false" type="button">Settings</button>
  </div>

  <section class="cyber-panel" id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">
    <h2>Überblick</h2>
    <div class="cards">
      <div class="card" style="text-align:center"><p class="lbl">Erfolgsrate</p><div id="ringSuccess"></div><p id="ringSuccessTxt" class="muted"></p></div>
      <div class="card" style="text-align:center"><p class="lbl">Auslastung jetzt</p><div id="ringCapacity"></div><p id="ringCapacityTxt" class="muted"></p></div>
      <div class="card"><p class="lbl">Anfragen im Zeitraum</p><p class="big" id="ovRequests">–</p><p class="muted" id="ovErrors"></p></div>
      <div class="card"><p class="lbl">Tokens im Zeitraum</p><p class="big" id="ovTokens">–</p><p class="muted" id="ovTokenDetail"></p></div>
    </div>
    <h2>Anfragen</h2><div class="chart" id="chartRequests"></div>
    <h2>Tokens</h2><div class="chart" id="chartTokens"></div>
    <h2>System</h2><div id="healthStrip" class="cards"></div>
    <h2>Top Modelle</h2><div id="ovTopModels"></div>
    <h2>Top Clients</h2><div id="ovTopClients"></div>
    <h2>NIMStats Rangliste (extern)</h2><div class="cards" id="statsCards"><p class="muted">Bitte anmelden.</p></div>
  </section>

  <section class="cyber-panel" id="panel-models" role="tabpanel" aria-labelledby="tab-models" hidden>
    <h2>Modelle nach Rang</h2>
    <div class="cards" id="modelCards"></div>
    <h2>Zeit bis zum ersten Token (TTFT)</h2><div class="chart" id="chartTtft"></div>
    <h2>Antwortzeit gesamt (Upstream-Latenz)</h2><div class="chart" id="chartLatency"></div>
    <h2>Tokens pro Minute</h2><div class="chart" id="chartTpm"></div>
    <h2>Werkzeug-Aufrufe (Tool Calls)</h2><div class="chart" id="chartTools"></div>
    <h2>Details: Abbruch und Denk-Anteil</h2><div id="modelBreakdown"></div>
    <h2>Direktvergleich</h2>
    <div class="row">
      <div><label for="h2hA">Modell A</label><select id="h2hA"></select></div>
      <div><label for="h2hB">Modell B</label><select id="h2hB"></select></div>
    </div>
    <div id="h2hOut" style="margin-top:12px"></div>
    <h2>Modelle verwalten</h2>
    <div id="modelTable"></div>
    <label for="newName">Anzeigename</label><input id="newName" type="text" placeholder="schnell">
    <label for="newModel">Echtes Modell bei NVIDIA</label>
    <input id="newModel" type="text" list="knownModels" placeholder="nvidia/nemotron-3-ultra-550b-a55b">
    <datalist id="knownModels">
      <option value="nvidia/nemotron-3-ultra-550b-a55b"></option><option value="mistralai/mistral-large-4-1t-a52b"></option>
      <option value="nvidia/nemotron-3.5-super-vl-120b-a12b"></option><option value="nvidia/nemotron-3.5-lightning-30b-a3b"></option>
      <option value="nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"></option><option value="nvidia/nemotron-3.5-bolt-e4b"></option>
      <option value="poolside/laguna-xs-2.1"></option><option value="meta/llama-3.2-90b-vision-instruct"></option>
    </datalist>
    <div class="row" style="margin-top:14px">
      <button class="btn btn-primary" id="addModelBtn" type="button">Modell speichern</button>
      <button class="btn" id="resetModelsBtn" type="button">Auf Standard zurücksetzen</button>
    </div>
    <p class="status" id="modelStatus" role="status" aria-live="polite"></p>
  </section>

  <section class="cyber-panel" id="panel-clients" role="tabpanel" aria-labelledby="tab-clients" hidden>
    <h2>Was jeder Client tut</h2>
    <p class="muted">Client ist der Name des API-Keys. Klick auf eine Spalte sortiert die Tabelle.</p>
    <div id="clientTable"></div>
    <h2>Rangliste</h2><div class="cards" id="clientCards"></div>
  </section>

  <section class="cyber-panel" id="panel-reliability" role="tabpanel" aria-labelledby="tab-reliability" hidden>
    <h2>Verfügbarkeit gegen Ziel (SLO)</h2>
    <div class="cards">
      <div class="card" style="text-align:center"><p class="lbl">Verfügbarkeit</p><div id="ringSlo"></div><p id="sloTxt" class="muted"></p></div>
      <div class="card"><p class="lbl">Fehler-Budget</p><p class="big" id="budgetBig">–</p><div class="bar-track"><div class="bar-fill" id="budgetBar" style="width:0%"></div></div><p class="muted" id="budgetTxt"></p></div>
      <div class="card"><p class="lbl">Limits (Governor)</p><p class="big" id="govBig">–</p><p class="muted" id="govTxt"></p></div>
    </div>
    <h2>Ergebnisse über Zeit</h2><div class="chart" id="chartOutcomes"></div>
    <h2>Wo die Zeit hingeht</h2>
    <div class="cards" id="latencyBreakdown"></div>
    <h2>Fehler-Arten</h2><div id="errorTable"></div>
    <h2>Tageszeit: Anfragen und Fehler</h2><div class="heat" id="heatmap"></div>
    <p class="muted">Jede Zelle ist eine Stunde. Rot heißt viele Fehler in dieser Stunde.</p>
  </section>

  <section class="cyber-panel" id="panel-capacity" role="tabpanel" aria-labelledby="tab-capacity" hidden>
    <h2>Auslastung jetzt</h2>
    <div class="card"><p class="lbl">Anfragen pro Minute gegen Gesamt-Limit aller Keys</p>
      <p class="big" id="capNowBig">–</p>
      <div class="bar-track" style="height:20px"><div class="bar-fill" id="capNowBar" style="width:0%"></div></div>
      <p class="muted" id="capNowTxt"></p></div>
    <h2>Auslastung im Verlauf</h2><div class="chart" id="chartUtil"></div>
    <div class="cards">
      <div class="card"><p class="lbl">Höchste Minute</p><p class="big" id="peakBig">–</p><p class="muted" id="peakTxt"></p></div>
      <div class="card"><p class="lbl">Fehlbetrag an der Spitze</p><p class="big" id="shortfallBig">–</p><p class="muted">So viele Anfragen pro Minute fehlten an Kapazität in der vollsten Minute.</p></div>
    </div>
    <h2>Jeder Key einzeln</h2><div id="keyMeters"></div>
    <h2>Abgelehnte Anfragen (429) pro Key</h2><div class="chart" id="chart429"></div>
  </section>

  <section class="cyber-panel" id="panel-images" role="tabpanel" aria-labelledby="tab-images" hidden>
    <h2>Bild erstellen</h2>
    <label for="prompt">Was soll auf dem Bild sein?</label>
    <textarea id="prompt" placeholder="Ein Roboter kocht Frühstück in einer kleinen Küche"></textarea>
    <label for="engine">Bild-Maschine</label>
    <select id="engine">
      <option value="sdxl-lightning">Schnell (SDXL Lightning)</option>
      <option value="sdxl">Beste Qualität (SDXL)</option>
      <option value="dreamshaper">DreamShaper</option>
      <option value="pollinations-flux">Pollinations Flux (kostenlos, extern)</option>
    </select>
    <div class="row" style="margin-top:12px">
      <button class="btn preset" type="button" data-p="Cyberpunk-Stadt bei Nacht, Regen, Neonlicht">Beispiel Stadt</button>
      <button class="btn preset" type="button" data-p="Raumstation über der Erde bei Sonnenaufgang">Beispiel Weltraum</button>
      <button class="btn preset" type="button" data-p="Ein freundlicher Roboter kocht Frühstück">Beispiel Roboter</button>
    </div>
    <div class="row" style="margin-top:12px"><button class="btn btn-primary" id="genBtn" type="button">Bild erstellen</button></div>
    <p class="status" id="imgStatus" role="status" aria-live="polite"></p>
    <img class="result" id="imgOut" alt="Erstelltes Bild" hidden>
  </section>

  <section class="cyber-panel" id="panel-speech" role="tabpanel" aria-labelledby="tab-speech" hidden>
    <h2>Text vorlesen (Microsoft Edge Stimmen)</h2>
    <label for="speechText">Text zum Vorlesen</label>
    <textarea id="speechText">Hallo! Dein Proxy kann jetzt auch sprechen.</textarea>
    <label for="voice">Stimme</label>
    <select id="voice">
      <option value="de-DE-KatjaNeural">Deutsch, Katja (Frau)</option>
      <option value="de-DE-ConradNeural">Deutsch, Conrad (Mann)</option>
      <option value="de-DE-AmalaNeural">Deutsch, Amala (Frau)</option>
      <option value="de-DE-KillianNeural">Deutsch, Killian (Mann)</option>
      <option value="en-US-AvaMultilingualNeural">Englisch, Ava (Standard)</option>
      <option value="en-GB-SoniaNeural">Englisch GB, Sonia</option>
    </select>
    <div class="row" style="margin-top:12px">
      <button class="btn btn-ai" id="speakBtn" type="button">Vorlesen</button>
      <button class="btn" id="loadVoicesBtn" type="button">Alle Stimmen laden</button>
    </div>
    <p class="status" id="speechStatus" role="status" aria-live="polite"></p>
    <audio id="audioOut" controls hidden></audio>
    <div class="row" style="margin-top:10px"><a class="btn" id="downloadAudio" href="#" download="sprache.mp3" hidden>MP3 herunterladen</a></div>
  </section>

  <section class="cyber-panel" id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" hidden>
    <h2>Einstellungen</h2>
    <p class="muted">Speichern wirkt sofort, ohne Neustart. Nur eine Änderung der Config-Datei von Hand braucht einen Neustart.</p>
    <h2>NVIDIA-Keys: Tempo und an/aus</h2>
    <div id="keySettings"></div>
    <h2>Zugang</h2>
    <label for="setAuthMode">Wer darf die API nutzen?</label>
    <select id="setAuthMode">
      <option value="master+keys">Master-Token und erstellte Keys</option>
      <option value="master">Nur Master-Token</option>
      <option value="keys">Nur erstellte Keys</option>
    </select>
    <label for="setUpstream">Upstream-Adresse (leer = NVIDIA Standard)</label>
    <input id="setUpstream" type="text" placeholder="https://integrate.api.nvidia.com/v1">
    <h2>Client API-Keys</h2>
    <div id="keyTable"></div>
    <label for="keyName">Name für neuen Key</label>
    <input id="keyName" type="text" placeholder="Handy">
    <div class="row" style="margin-top:10px"><button class="btn btn-primary" id="createKeyBtn" type="button">Neuen Key erstellen</button></div>
    <label for="newKeyOut">Neuer Key (nur einmal sichtbar)</label>
    <input id="newKeyOut" type="text" readonly placeholder="Noch kein neuer Key">
    <p class="status" id="keyStatus" role="status" aria-live="polite"></p>
    <h2>Limits</h2>
    <label for="setMaxTokens">Maximale Antwort-Tokens pro Anfrage (0 = kein Limit)</label>
    <input id="setMaxTokens" type="number" min="0" step="1">
    <label for="setModelLimits">Modell-Limits pro Minute, als JSON. Beispiel: {"auto": 30}</label>
    <textarea id="setModelLimits" style="font-family:var(--font-mono)">{}</textarea>
    <h2>Zeit und Ziele</h2>
    <div class="row">
      <div><label for="setRangeDays">Standard-Zeitraum (Tage)</label><input id="setRangeDays" type="number" min="1" step="1"></div>
      <div><label for="setRetentionDays">Aufbewahrung (Tage, 0 = für immer)</label><input id="setRetentionDays" type="number" min="0" step="1"></div>
      <div><label for="setSlo">Verfügbarkeits-Ziel (Prozent)</label><input id="setSlo" type="number" min="90" max="100" step="0.1"></div>
    </div>
    <p class="muted" id="historyInfo"></p>
    <div class="row" style="margin-top:12px"><button class="btn btn-primary" id="saveSettingsBtn" type="button">Einstellungen speichern</button></div>
    <p class="status" id="settingsStatus" role="status" aria-live="polite"></p>
    <h2>Dashboard-Nutzer</h2>
    <p class="muted">Nutzer können sich mit ihrem eigenen Token hier anmelden. Das Master-Admin-Token gilt immer.</p>
    <div id="userTable"></div>
    <label for="userName">Name für neuen Nutzer</label>
    <input id="userName" type="text" placeholder="Zum Beispiel: Handy">
    <div class="row" style="margin-top:10px"><button class="btn btn-primary" id="createUserBtn" type="button">Nutzer erstellen</button></div>
    <label for="newUserOut">Nutzer-Token (nur einmal sichtbar)</label>
    <input id="newUserOut" type="text" readonly placeholder="Noch kein neuer Nutzer">
    <p class="status" id="userStatus" role="status" aria-live="polite"></p>
  </section>
</main>
<script>
const $=(id)=>document.getElementById(id);
const COLORS=['#00f6ff','#ff00e5','#39ff14','#ffb000','#ff4d6d','#5cffff','#ff9a3c'];
let A=null,O=null,S=null,PAUSED=false,RANGE={preset:'default'},SORT={},TIMER=null;
const esc=(s)=>String(s==null?'':s).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=(n)=>Number(n||0).toLocaleString('de-DE');
const ms=(n)=>fmt(Math.round(Number(n||0)))+' ms';
const pct=(n)=>Number(n||0).toFixed(1)+' %';
const adminHeaders=()=>({'x-admin-token':sessionStorage.getItem('blg_admin')||'','Content-Type':'application/json'});
const clientKey=()=>sessionStorage.getItem('blg_client')||'';

document.querySelectorAll('[role="tab"]').forEach((tab)=>tab.addEventListener('click',()=>{
  document.querySelectorAll('[role="tab"]').forEach((t)=>t.setAttribute('aria-selected','false'));
  document.querySelectorAll('[role="tabpanel"]').forEach((p)=>{p.hidden=true;});
  tab.setAttribute('aria-selected','true'); $(tab.getAttribute('aria-controls')).hidden=false;
}));

async function api(path,options){
  const res=await fetch(path,Object.assign({headers:adminHeaders()},options||{}));
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error&&data.error.message?data.error.message:('Fehler '+res.status));
  return data;
}

function ring(el,p,color){
  const v=Math.max(0,Math.min(100,Number(p||0))), r=52, c=2*Math.PI*r, off=c-(v/100)*c;
  el.innerHTML='<svg width="140" height="140" viewBox="0 0 140 140"><circle cx="70" cy="70" r="'+r+'" fill="none" stroke="#17252d" stroke-width="12"/><circle cx="70" cy="70" r="'+r+'" fill="none" stroke="'+color+'" stroke-width="12" stroke-dasharray="'+c+'" stroke-dashoffset="'+off+'" transform="rotate(-90 70 70)"/><text x="70" y="76" text-anchor="middle" fill="#d7faff" font-family="JetBrains Mono" font-size="20" font-weight="700">'+v.toFixed(1)+'%</text></svg>';
}

function chart(el,series,unit){
  if(!el) return;
  const clean=series.filter((s)=>s.points&&s.points.length);
  if(!clean.length){ el.innerHTML='<p class="muted">Noch keine Daten in diesem Zeitraum.</p>'; return; }
  const W=900,H=190,P=34;
  let minT=Infinity,maxT=-Infinity,maxV=0;
  clean.forEach((s)=>s.points.forEach((p)=>{minT=Math.min(minT,p.t);maxT=Math.max(maxT,p.t);maxV=Math.max(maxV,p.v);}));
  if(minT===maxT){minT-=60000;maxT+=60000;} if(maxV<=0)maxV=1;
  const X=(t)=>P+(t-minT)/(maxT-minT)*(W-P-8), Y=(v)=>H-24-(v/maxV)*(H-46);
  let svg='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;display:block" role="img">';
  svg+='<line x1="'+P+'" y1="'+(H-24)+'" x2="'+(W-8)+'" y2="'+(H-24)+'" stroke="#17252d"/><text x="4" y="18" fill="#5f7681" font-family="JetBrains Mono" font-size="11">'+esc(fmt(maxV))+' '+esc(unit||'')+'</text>';
  clean.forEach((s,i)=>{
    const col=s.color||COLORS[i%COLORS.length];
    const pts=s.points.map((p)=>X(p.t).toFixed(1)+','+Y(p.v).toFixed(1)).join(' ');
    svg+='<polyline fill="none" stroke="'+col+'" stroke-width="2" points="'+pts+'"/>';
  });
  svg+='<line class="cross" x1="0" y1="10" x2="0" y2="'+(H-24)+'" stroke="#007f87" stroke-dasharray="3 3" style="display:none"/>';
  svg+='<rect class="hit" x="0" y="0" width="'+W+'" height="'+H+'" fill="transparent"/></svg>';
  svg+='<div class="tip"></div><p class="muted" style="font-family:var(--font-mono);font-size:13px">'+clean.map((s,i)=>'<span style="color:'+(s.color||COLORS[i%COLORS.length])+'">■</span> '+esc(s.name)).join(' &nbsp; ')+'</p>';
  el.innerHTML=svg;
  const svgEl=el.querySelector('svg'), cross=el.querySelector('.cross'), tip=el.querySelector('.tip'), hit=el.querySelector('.hit');
  hit.addEventListener('mousemove',(ev)=>{
    const r=svgEl.getBoundingClientRect(), x=(ev.clientX-r.left)/r.width*W;
    const t=minT+(x-P)/(W-P-8)*(maxT-minT);
    let best=null,bd=Infinity;
    clean.forEach((s)=>s.points.forEach((p)=>{const d=Math.abs(p.t-t); if(d<bd){bd=d;best=p;}}));
    if(!best) return;
    const bx=X(best.t);
    cross.setAttribute('x1',bx); cross.setAttribute('x2',bx); cross.style.display='';
    tip.style.display='block';
    tip.style.left=Math.min(ev.clientX-r.left+14, r.width-240)+'px';
    tip.style.top='8px';
    tip.innerHTML='<strong>'+new Date(best.t).toLocaleString('de-DE')+'</strong>'+clean.map((s,i)=>{
      let near=null,nd=Infinity; s.points.forEach((p)=>{const d=Math.abs(p.t-best.t); if(d<nd){nd=d;near=p;}});
      return '<br><span style="color:'+(s.color||COLORS[i%COLORS.length])+'">■</span> '+esc(s.name)+': <strong>'+(near?fmt(Math.round(near.v*100)/100):'–')+'</strong> '+esc(unit||'');
    }).join('');
  });
  hit.addEventListener('mouseleave',()=>{tip.style.display='none'; cross.style.display='none';});
}

function sortable(el,cols,rows,id){
  const st=SORT[id]||{k:cols[0].k,dir:-1};
  const sorted=[...rows].sort((a,b)=>{
    const x=a[st.k],y=b[st.k];
    const cmp=(typeof x==='number'||!isNaN(Number(x)))&& (typeof y==='number'||!isNaN(Number(y))) ? Number(x)-Number(y) : String(x).localeCompare(String(y));
    return cmp*st.dir;
  });
  el.innerHTML='<table class="cyber-table"><thead><tr>'+cols.map((c)=>'<th data-k="'+c.k+'">'+esc(c.label)+(SORT[id]&&SORT[id].k===c.k?(st.dir>0?' ↑':' ↓'):'')+'</th>').join('')+'</tr></thead><tbody>'+
    sorted.map((r)=>'<tr>'+cols.map((c)=>'<td>'+(c.fmt?c.fmt(r[c.k],r):esc(r[c.k]))+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  el.querySelectorAll('th').forEach((th)=>th.addEventListener('click',()=>{
    const k=th.getAttribute('data-k');
    SORT[id]={k,dir:SORT[id]&&SORT[id].k===k?-SORT[id].dir:-1};
    sortable(el,cols,rows,id);
  }));
}

function seriesBy(rows,key,valFn){
  const map={};
  (rows||[]).forEach((r)=>{ const name=r[key]||'–'; (map[name]=map[name]||[]).push({t:Number(r.t),v:valFn(r)}); });
  return Object.entries(map).map(([name,points],i)=>({name,points:points.sort((a,b)=>a.t-b.t),color:COLORS[i%COLORS.length]}));
}

function renderAll(){
  if(!A||A.empty&&!A.overview){ /* still render zeros below */ }
  const o=A.overview||{}, rel=A.reliability||{}, cap=A.capacity||{};
  // Overview
  ring($('ringSuccess'),o.availability??100,'#39ff14');
  $('ringSuccessTxt').textContent=fmt(o.successes)+' von '+fmt(o.requests)+' erfolgreich';
  ring($('ringCapacity'),o.saturation||0,'#00f6ff');
  $('ringCapacityTxt').textContent='Jetzt: '+fmt(o.nowRpm)+' von '+fmt(o.capacityNow)+' pro Minute';
  $('ovRequests').textContent=fmt(o.requests);
  $('ovErrors').textContent=fmt(o.errors)+' Fehler, davon '+fmt(o.rate429)+' Mal Limit (429)';
  $('ovTokens').textContent=fmt((o.promptTokens||0)+(o.completionTokens||0));
  $('ovTokenDetail').textContent=fmt(o.promptTokens)+' rein, '+fmt(o.completionTokens)+' raus, '+fmt(o.reasoningTokens)+' Denken';
  const bucketMin=Math.max((A.range?A.range.bucketMs:60000)/60000,1);
  chart($('chartRequests'),[{name:'Anfragen',points:(A.series.requests||[]).map((r)=>({t:Number(r.t),v:Number(r.requests)})),color:COLORS[0]}],'Anfragen');
  chart($('chartTokens'),[{name:'Tokens',points:(A.series.requests||[]).map((r)=>({t:Number(r.t),v:Number(r.tokens)})),color:COLORS[1]}],'Tokens');
  $('healthStrip').innerHTML=(A.health||[]).map((h)=>'<div class="card"><p><span class="led '+(h.ok?'led-online':'led-error')+'"></span><strong>'+esc(h.name)+'</strong></p><p class="muted">'+esc(h.detail)+'</p></div>').join('');
  sortable($('ovTopModels'),[{k:'route',label:'Modell'},{k:'requests',label:'Anfragen'},{k:'successes',label:'OK'}],(A.models||[]).slice(0,8),'ovm');
  sortable($('ovTopClients'),[{k:'client',label:'Client'},{k:'requests',label:'Anfragen'},{k:'tokens',label:'Tokens'}],(A.clients||[]).slice(0,8),'ovc');

  // Models
  const models=A.models||[];
  $('modelCards').innerHTML=models.length?models.map((m,i)=>{
    const succ=m.requests?100*m.successes/m.requests:100;
    const genSpeed=m.avgGenerationMs>0&&m.completionTokens? (m.completionTokens/(m.requests*m.avgGenerationMs/1000)).toFixed(1):'–';
    return '<div class="card"><p class="lbl">Platz '+(i+1)+'</p><p class="big" style="font-size:19px">'+esc(m.route)+'</p><p class="muted">'+esc(m.upstreamModel)+'</p><p>Anfragen: '+fmt(m.requests)+' · Erfolg: '+succ.toFixed(1)+' %<br>Erstes Token: '+ms(m.avgTtftMs)+'<br>Gesamt: '+ms(m.avgLatencyMs)+'<br>Tempo: '+genSpeed+' Token/Sek.</p></div>';
  }).join(''):'<p class="muted">Noch keine Anfragen gemessen.</p>';
  const topRoutes=models.slice(0,5).map((m)=>m.route);
  const mSeries=(A.series.models||[]).filter((r)=>topRoutes.includes(r.route));
  chart($('chartTtft'),seriesBy(mSeries,'route',(r)=>Number(r.ttft)),'ms');
  chart($('chartLatency'),seriesBy(mSeries,'route',(r)=>Number(r.latency)),'ms');
  chart($('chartTpm'),[{name:'Tokens pro Minute',points:(A.series.requests||[]).map((r)=>({t:Number(r.t),v:Number(r.tokens)/bucketMin})),color:COLORS[2]}],'Tok/Min');
  chart($('chartTools'),[{name:'Tool Calls',points:(A.series.requests||[]).map((r)=>({t:Number(r.t),v:Number(r.toolCalls)})),color:COLORS[3]}],'Calls');
  sortable($('modelBreakdown'),[
    {k:'route',label:'Modell'},{k:'requests',label:'Anfragen'},
    {k:'truncRate',label:'Abgebrochen',fmt:(v)=>pct(v)},
    {k:'reasonShare',label:'Denk-Anteil',fmt:(v)=>pct(v)},
    {k:'streamShare',label:'Streaming',fmt:(v)=>pct(v)},
    {k:'interToken',label:'Zeit pro Token',fmt:(v)=>ms(v)},
    {k:'toolCalls',label:'Tool Calls'}],
    models.map((m)=>({...m,
      truncRate:m.requests?100*m.truncated/m.requests:0,
      reasonShare:m.completionTokens?100*m.reasoningTokens/m.completionTokens:0,
      streamShare:m.requests?100*m.streamed/m.requests:0,
      interToken:m.completionTokens? (m.avgGenerationMs>0? m.avgGenerationMs/(m.completionTokens/m.requests) : m.avgLatencyMs/(m.completionTokens/m.requests)) :0
    })),'mbd');
  const sel=(el,keep)=>{ const cur=keep||el.value; el.innerHTML=models.map((m)=>'<option>'+esc(m.route)+'</option>').join(''); if(models.some((m)=>m.route===cur)) el.value=cur; };
  sel($('h2hA'),$('h2hA').value); sel($('h2hB'),$('h2hB').value||models[1]&&models[1].route);
  renderH2H();

  // Clients
  sortable($('clientTable'),[
    {k:'client',label:'Client'},{k:'requests',label:'Anfragen'},
    {k:'toolIntensity',label:'Tools pro Anfrage',fmt:(v)=>Number(v).toFixed(2)},
    {k:'avgMessages',label:'Nachrichten pro Gespräch',fmt:(v)=>Number(v).toFixed(1)},
    {k:'fingerprint',label:'Sampling (Temp / Top-P)'},
    {k:'avgMaxTokens',label:'Gewünschte Antwortlänge',fmt:(v)=>fmt(Math.round(v))},
    {k:'streamShare',label:'Streaming-Anteil',fmt:(v)=>pct(v)},
    {k:'tokens',label:'Tokens'}],
    (A.clients||[]).map((c)=>({...c,
      toolIntensity:c.requests?c.toolCalls/c.requests:0,
      fingerprint:Number(c.avgTemperature||0).toFixed(2)+' / '+Number(c.avgTopP||0).toFixed(2),
      streamShare:c.requests?100*c.streamed/c.requests:0
    })),'clients');
  $('clientCards').innerHTML=(A.clients||[]).slice(0,6).map((c,i)=>'<div class="card"><p class="lbl">Platz '+(i+1)+'</p><p class="big" style="font-size:20px">'+esc(c.client)+'</p><p class="muted">'+esc(c.agents||'')+'</p><p>Anfragen: '+fmt(c.requests)+'<br>Tokens: '+fmt(c.tokens)+'<br>Antwortzeit: '+ms(c.avgLatencyMs)+'</p></div>').join('')||'<p class="muted">Noch keine Clients.</p>';

  // Reliability
  ring($('ringSlo'),rel.availability??100, (rel.availability??100)>=(rel.sloPercent||99.9)?'#39ff14':'#ff4d6d');
  $('sloTxt').textContent='Ziel: '+pct(rel.sloPercent||99.9);
  $('budgetBig').textContent=fmt(rel.errorBudgetRemaining)+' übrig';
  const usedPct=rel.errorBudgetTotal?Math.min(100,100*rel.errorBudgetUsed/rel.errorBudgetTotal):0;
  $('budgetBar').style.width=usedPct+'%'; $('budgetBar').className='bar-fill'+(usedPct>80?' over':usedPct>50?' hot':'');
  $('budgetTxt').textContent=fmt(rel.errorBudgetUsed)+' von '+fmt(rel.errorBudgetTotal)+' erlaubten Fehlern verbraucht.';
  $('govBig').textContent=fmt(rel.governor)+' Mal';
  $('govTxt').textContent=rel.governor? 'Das Modell-Limit hat in diesem Zeitraum zugeschlagen.' : 'Das Modell-Limit musste nicht eingreifen.';
  chart($('chartOutcomes'),seriesBy(A.series.outcomes||[],'outcome',(r)=>Number(r.c)),'Anfragen');
  const lat=rel.latency||{};
  $('latencyBreakdown').innerHTML=[['Warten (Queue)',lat.queueMs],['Erstes Token',lat.ttftMs],['Erzeugen',lat.generationMs],['Gesamt',lat.totalMs]].map(([n,v])=>'<div class="card"><p class="lbl">'+n+'</p><p class="big">'+ms(v)+'</p></div>').join('');
  sortable($('errorTable'),[{k:'errorClass',label:'Fehler-Art'},{k:'status',label:'Status'},{k:'c',label:'Anzahl'}],rel.taxonomy||[],'err');
  const heat={}; (rel.heatmap||[]).forEach((h)=>{heat[h.hour]=h;});
  $('heatmap').innerHTML=Array.from({length:24},(_,h)=>{
    const d=heat[h]||{requests:0,errors:0};
    const rate=d.requests?d.errors/d.requests:0;
    const bg=rate>0.25?'rgba(255,23,68,.45)':rate>0.1?'rgba(255,176,0,.4)':d.requests?'rgba(57,255,20,.18)':'';
    return '<div style="background:'+bg+'"><strong>'+String(h).padStart(2,'0')+':00</strong><br>'+fmt(d.requests)+' Anfragen<br>'+fmt(d.errors)+' Fehler</div>';
  }).join('');

  // Capacity
  $('capNowBig').textContent=fmt(cap.nowRpm)+' / '+fmt(cap.capacityNow)+' pro Minute';
  const sat=Math.min(100,cap.saturation||0);
  $('capNowBar').style.width=sat+'%'; $('capNowBar').className='bar-fill'+(sat>90?' over':sat>65?' hot':'');
  $('capNowTxt').textContent='Auslastung jetzt: '+pct(cap.saturation||0)+'. Now-Werte laufen auch bei Pause weiter.';
  chart($('chartUtil'),[{name:'Auslastung',points:(A.series.requests||[]).map((r)=>({t:Number(r.t),v:r.capacity?100*(Number(r.requests)/bucketMin)/Number(r.capacity):0})),color:COLORS[0]}],'%');
  $('peakBig').textContent=fmt(cap.peakRpm)+' pro Minute';
  $('peakTxt').textContent='Kapazität in dieser Minute: '+fmt(cap.peakCapacity)+' pro Minute.';
  $('shortfallBig').textContent=fmt(cap.peakShortfall)+' pro Minute';
  $('keyMeters').innerHTML=(cap.perKey||[]).map((k)=>{
    const use=k.rpmLimit?Math.min(100,100*k.lastMinute/k.rpmLimit):0;
    return '<div class="card" style="margin-bottom:10px"><p><span class="led '+(k.present&&k.enabled?'led-online':'led-error')+'"></span><strong>'+esc(k.key)+'</strong> <span class="badge '+(k.enabled?'badge-green':'badge-red')+'">'+(k.enabled?'an':'aus')+'</span></p>'+
    '<div class="bar-track"><div class="bar-fill'+(use>90?' over':use>65?' hot':'')+'" style="width:'+use+'%"></div></div>'+
    '<p class="muted">Jetzt: '+fmt(k.lastMinute)+' von '+fmt(k.rpmLimit)+' pro Minute · Im Zeitraum: '+fmt(k.rangeRequests)+' Anfragen, '+fmt(k.range429)+' Mal 429</p></div>';
  }).join('');
  chart($('chart429'),seriesBy(A.series.rate429||[],'k',(r)=>Number(r.c)),'429');

  // Settings/history
  if(A.history){
    $('historyInfo').textContent='Gespeicherte Messungen: '+fmt(A.history.rows)+' Zeilen, etwa '+(A.history.approxBytes/1024).toFixed(1)+' KB. Erste Messung: '+(A.history.firstSample?new Date(Number(A.history.firstSample)).toLocaleString('de-DE'):'keine')+'. Aufbewahrung: '+(A.history.retentionDays===0?'für immer':A.history.retentionDays+' Tage')+'.';
  }
  $('rangeInfo').textContent='Zeitraum: '+new Date(A.range.from).toLocaleString('de-DE')+' bis '+new Date(A.range.to).toLocaleString('de-DE')+(PAUSED?' · pausiert (Now-Werte laufen weiter)':' · erneuert sich alle 3 Sekunden');
}

function renderH2H(){
  if(!A) return;
  const a=(A.models||[]).find((m)=>m.route===$('h2hA').value), b=(A.models||[]).find((m)=>m.route===$('h2hB').value);
  if(!a||!b){ $('h2hOut').innerHTML='<p class="muted">Zwei Modelle mit Daten nötig.</p>'; return; }
  const rows=[['Anfragen','requests','n'],['Erfolg %','succ','p'],['Erstes Token','avgTtftMs','ms'],['Gesamtzeit','avgLatencyMs','ms'],['Tokens raus','completionTokens','n'],['Tool Calls','toolCalls','n']];
  const val=(m,k)=>k==='succ'?(m.requests?100*m.successes/m.requests:0):m[k];
  $('h2hOut').innerHTML='<table class="cyber-table"><thead><tr><th>Wert</th><th>'+esc(a.route)+'</th><th>'+esc(b.route)+'</th><th>Besser</th></tr></thead><tbody>'+
    rows.map(([label,k])=>{
      const va=val(a,k),vb=val(b,k);
      const lowerBetter=(k==='avgTtftMs'||k==='avgLatencyMs');
      const winner=va===vb?'gleich':(lowerBetter?va<vb:va>vb)?a.route:b.route;
      const f=(v)=>k==='succ'?pct(v):k.includes('Ms')?ms(v):fmt(v);
      return '<tr><td>'+label+'</td><td>'+f(va)+'</td><td>'+f(vb)+'</td><td><span class="badge badge-cyan">'+esc(winner)+'</span></td></tr>';
    }).join('')+'</tbody></table>';
}
$('h2hA').addEventListener('change',renderH2H);
$('h2hB').addEventListener('change',renderH2H);

function renderOverviewSide(){
  $('statsCards').innerHTML='';
  api('/admin/api/stats').then((stats)=>{
    const card=(title,d)=>{
      if(!d||d.error) return '<div class="card"><h3>'+esc(title)+'</h3><p class="muted">Nicht verfügbar</p></div>';
      return '<div class="card"><h3>'+esc(title)+'</h3><p class="big" style="font-size:18px">'+esc(d.best_model)+'</p><p>Punkte: '+esc(d.score)+' · Verfügbar: '+esc(d.uptime)+' %<br>Schnitt: '+ms(d.avg_response_time_ms)+' · '+esc(d.avg_throughput_tps)+' Tok/Sek.</p></div>';
    };
    $('statsCards').innerHTML=card('Insgesamt bestes',stats.balanced)+card('Schnellstes',stats.speed)+card('Kluegstes',stats.intelligence);
  }).catch(()=>{ $('statsCards').innerHTML='<p class="muted">NIMStats gerade nicht erreichbar.</p>'; });

  if(!O) return;
  $('modelTable').innerHTML='<table class="cyber-table"><thead><tr><th>Dein Name</th><th>Echtes Modell</th><th>Aktion</th></tr></thead><tbody>'+
    Object.entries(O.routes).map(([name,providers])=>'<tr><td><strong>'+esc(name)+'</strong></td><td>'+providers.map((p)=>esc(p.model)).join('<br>')+'</td><td><button class="btn btn-danger" type="button" data-del-model="'+esc(name)+'">Löschen</button></td></tr>').join('')+'</tbody></table>';
  document.querySelectorAll('[data-del-model]').forEach((btn)=>btn.addEventListener('click',async()=>{
    if(!confirm('Modell '+btn.getAttribute('data-del-model')+' wirklich löschen?')) return;
    try{ await api('/admin/api/models/'+encodeURIComponent(btn.getAttribute('data-del-model')),{method:'DELETE'}); $('modelStatus').textContent='Gelöscht.'; await loadStatic(); }catch(e){ $('modelStatus').textContent=e.message; }
  }));
  $('keyTable').innerHTML=O.clientKeys.length?'<table class="cyber-table"><thead><tr><th>Name</th><th>Anfang</th><th>Erstellt</th><th>Aktion</th></tr></thead><tbody>'+
    O.clientKeys.map((k)=>'<tr><td>'+esc(k.name)+'</td><td><code>'+esc(k.prefix)+'...</code></td><td>'+esc(new Date(k.createdAt).toLocaleString('de-DE'))+'</td><td><button class="btn btn-danger" type="button" data-del-key="'+esc(k.id)+'">Löschen</button></td></tr>').join('')+'</tbody></table>'
    :'<p class="muted">Noch keine erstellten Keys.</p>';
  document.querySelectorAll('[data-del-key]').forEach((btn)=>btn.addEventListener('click',async()=>{
    if(!confirm('Key wirklich löschen?')) return;
    try{ await api('/admin/api/keys/'+encodeURIComponent(btn.getAttribute('data-del-key')),{method:'DELETE'}); $('keyStatus').textContent='Key gelöscht.'; await loadStatic(); }catch(e){ $('keyStatus').textContent=e.message; }
  }));
}

function renderSettings(){
  if(!S) return;
  const names=Object.keys(S.keyRpm);
  $('keySettings').innerHTML=names.map((name)=>'<div class="row" style="margin-bottom:8px;align-items:center"><div><strong>'+esc(name)+'</strong></div><div><label>Pro Minute (0 = aus)</label><input type="number" min="0" step="1" data-rpm="'+esc(name)+'" value="'+esc(S.keyRpm[name])+'"></div><div><label>An oder aus</label><select data-enabled="'+esc(name)+'"><option value="true"'+(S.keyEnabled[name]!==false?' selected':'')+'>An</option><option value="false"'+(S.keyEnabled[name]===false?' selected':'')+'>Aus</option></select></div></div>').join('');
  $('setAuthMode').value=S.authMode;
  $('setUpstream').value=S.upstreamUrl||'';
  $('setMaxTokens').value=S.maxTokensCap;
  $('setModelLimits').value=JSON.stringify(S.modelLimits||{},null,2);
  $('setRangeDays').value=S.defaultRangeDays;
  $('setRetentionDays').value=S.retentionDays;
  $('setSlo').value=S.sloPercent;
  $('userTable').innerHTML=S.users.length?'<table class="cyber-table"><thead><tr><th>Name</th><th>Erstellt</th><th>Aktion</th></tr></thead><tbody>'+
    S.users.map((u)=>'<tr><td>'+esc(u.name)+'</td><td>'+esc(new Date(u.createdAt).toLocaleString('de-DE'))+'</td><td><button class="btn btn-danger" type="button" data-del-user="'+esc(u.name)+'">Löschen</button></td></tr>').join('')+'</tbody></table>'
    :'<p class="muted">Nur das Master-Admin-Token.</p>';
  document.querySelectorAll('[data-del-user]').forEach((btn)=>btn.addEventListener('click',async()=>{
    if(!confirm('Nutzer wirklich löschen?')) return;
    try{ await api('/admin/api/users/'+encodeURIComponent(btn.getAttribute('data-del-user')),{method:'DELETE'}); $('userStatus').textContent='Nutzer gelöscht.'; await loadStatic(); }catch(e){ $('userStatus').textContent=e.message; }
  }));
}

async function loadAnalytics(){
  const q=new URLSearchParams();
  if(RANGE.from){ q.set('from',RANGE.from); q.set('to',RANGE.to); } else if(RANGE.preset && RANGE.preset!=='default'){ q.set('range',RANGE.preset); }
  A=await api('/admin/api/analytics?'+q.toString());
  renderAll();
}
async function loadStatic(){
  O=await api('/admin/api/overview');
  S=await api('/admin/api/settings');
  renderOverviewSide(); renderSettings();
}
async function loadAll(){
  await loadStatic();
  await loadAnalytics();
  renderOverviewSide();
  $('loginStatus').innerHTML='<span class="ok">Angemeldet. Daten laden sich alle 3 Sekunden neu.</span>';
}

document.querySelectorAll('.rangeBtn').forEach((btn)=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.rangeBtn').forEach((b)=>b.setAttribute('aria-selected','false'));
  btn.setAttribute('aria-selected','true');
  RANGE={preset:btn.getAttribute('data-range')};
  loadAnalytics().catch(()=>{});
}));
$('customBtn').addEventListener('click',()=>{
  const f=$('fromInput').value?new Date($('fromInput').value).getTime():0;
  const t=$('toInput').value?new Date($('toInput').value).getTime():Date.now();
  if(!f||t<=f){ $('rangeInfo').textContent='Bitte gültigen eigenen Zeitraum wählen.'; return; }
  RANGE={from:f,to:t};
  loadAnalytics().catch(()=>{});
});
$('pauseBtn').addEventListener('click',()=>{
  PAUSED=!PAUSED;
  $('pauseBtn').setAttribute('aria-pressed',String(PAUSED));
  $('pauseBtn').textContent=PAUSED?'Weiter':'Pause';
  if(PAUSED){ RANGE={from:A?A.range.from:Date.now(),to:Date.now()}; }
  else { loadAnalytics().catch(()=>{}); }
});

$('loginBtn').addEventListener('click',async()=>{
  sessionStorage.setItem('blg_admin',$('adminToken').value.trim());
  sessionStorage.setItem('blg_client',$('clientToken').value.trim());
  try{
    await loadAll(); renderOverviewSide();
    if(TIMER) clearInterval(TIMER);
    TIMER=setInterval(()=>{ loadAnalytics().catch(()=>{}); },3000);
  }catch(e){ $('loginStatus').textContent='Anmeldung fehlgeschlagen: '+e.message; }
});
$('clientToken').addEventListener('change',()=>sessionStorage.setItem('blg_client',$('clientToken').value.trim()));
$('addModelBtn').addEventListener('click',async()=>{
  try{ await api('/admin/api/models',{method:'POST',body:JSON.stringify({name:$('newName').value.trim(),model:$('newModel').value.trim()})}); $('modelStatus').textContent='Modell gespeichert.'; await loadStatic(); renderOverviewSide(); }catch(e){ $('modelStatus').textContent=e.message; }
});
$('resetModelsBtn').addEventListener('click',async()=>{
  if(!confirm('Alle Modell-Änderungen verwerfen?')) return;
  try{ await api('/admin/api/routes/reset',{method:'POST'}); $('modelStatus').textContent='Auf Standard zurückgesetzt.'; await loadStatic(); renderOverviewSide(); }catch(e){ $('modelStatus').textContent=e.message; }
});
$('createKeyBtn').addEventListener('click',async()=>{
  try{ const d=await api('/admin/api/keys',{method:'POST',body:JSON.stringify({name:$('keyName').value.trim()})}); $('newKeyOut').value=d.key; $('keyStatus').textContent='Key erstellt. Bitte jetzt kopieren.'; await loadStatic(); renderOverviewSide(); }catch(e){ $('keyStatus').textContent=e.message; }
});
$('createUserBtn').addEventListener('click',async()=>{
  try{ const d=await api('/admin/api/users',{method:'POST',body:JSON.stringify({name:$('userName').value.trim()})}); $('newUserOut').value=d.token; $('userStatus').textContent='Nutzer erstellt. Token jetzt kopieren.'; await loadStatic(); }catch(e){ $('userStatus').textContent=e.message; }
});
$('saveSettingsBtn').addEventListener('click',async()=>{
  try{
    const keyRpm={}, keyEnabled={};
    document.querySelectorAll('[data-rpm]').forEach((el)=>{ keyRpm[el.getAttribute('data-rpm')]=Number(el.value); });
    document.querySelectorAll('[data-enabled]').forEach((el)=>{ keyEnabled[el.getAttribute('data-enabled')]=el.value==='true'; });
    let modelLimits={};
    try{ modelLimits=JSON.parse($('setModelLimits').value||'{}'); }catch{ $('settingsStatus').textContent='Modell-Limits sind kein gültiges JSON.'; return; }
    const body={...S,keyRpm,keyEnabled,authMode:$('setAuthMode').value,upstreamUrl:$('setUpstream').value.trim(),maxTokensCap:Number($('setMaxTokens').value),modelLimits,defaultRangeDays:Number($('setRangeDays').value),retentionDays:Number($('setRetentionDays').value),sloPercent:Number($('setSlo').value)};
    const d=await api('/admin/api/settings',{method:'PUT',body:JSON.stringify(body)});
    S={...d.settings,users:S.users};
    $('settingsStatus').innerHTML='<span class="ok">Gespeichert und sofort aktiv.</span>';
    await loadAnalytics();
  }catch(e){ $('settingsStatus').textContent='Fehler: '+e.message; }
});
document.querySelectorAll('.preset').forEach((btn)=>btn.addEventListener('click',()=>{ $('prompt').value=btn.getAttribute('data-p'); }));
$('genBtn').addEventListener('click',async()=>{
  const prompt=$('prompt').value.trim();
  if(!prompt){ $('imgStatus').textContent='Bitte zuerst beschreiben, was auf dem Bild sein soll.'; return; }
  if(!clientKey()){ $('imgStatus').textContent='Bitte oben deinen API-Key eintragen.'; return; }
  $('imgStatus').textContent='Bild wird erstellt...'; $('imgOut').hidden=true;
  try{
    const res=await fetch('/v1/images/generations',{method:'POST',headers:{'Authorization':'Bearer '+clientKey(),'Content-Type':'application/json'},body:JSON.stringify({prompt,model:$('engine').value})});
    if(!res.ok){ const d=await res.json().catch(()=>({})); throw new Error(d.error&&d.error.message?d.error.message:('Fehler '+res.status)); }
    if((res.headers.get('Content-Type')||'').includes('application/json')){ const d=await res.json(); $('imgOut').src=d.data[0].url; }
    else { $('imgOut').src=URL.createObjectURL(await res.blob()); }
    $('imgOut').hidden=false; $('imgStatus').innerHTML='<span class="ok">Bild fertig.</span>';
  }catch(e){ $('imgStatus').textContent='Fehler: '+e.message; }
});
$('speakBtn').addEventListener('click',async()=>{
  const text=$('speechText').value.trim();
  if(!text){ $('speechStatus').textContent='Bitte zuerst einen Text eingeben.'; return; }
  if(!clientKey()){ $('speechStatus').textContent='Bitte oben deinen API-Key eintragen.'; return; }
  $('speechStatus').textContent='Stimme wird erstellt...';
  try{
    const res=await fetch('/v1/audio/speech',{method:'POST',headers:{'Authorization':'Bearer '+clientKey(),'Content-Type':'application/json'},body:JSON.stringify({input:text,voice:$('voice').value})});
    if(!res.ok){ const d=await res.json().catch(()=>({})); throw new Error(d.error&&d.error.message?d.error.message:('Fehler '+res.status)); }
    const url=URL.createObjectURL(await res.blob());
    $('audioOut').src=url; $('audioOut').hidden=false;
    $('downloadAudio').href=url; $('downloadAudio').hidden=false;
    await $('audioOut').play().catch(()=>{});
    $('speechStatus').innerHTML='<span class="ok">Fertig. Die Stimme läuft.</span>';
  }catch(e){ $('speechStatus').textContent='Fehler: '+e.message; }
});
$('loadVoicesBtn').addEventListener('click',async()=>{
  if(!clientKey()){ $('speechStatus').textContent='Bitte oben deinen API-Key eintragen.'; return; }
  try{
    const res=await fetch('/v1/audio/voices',{headers:{'Authorization':'Bearer '+clientKey()}});
    if(!res.ok) throw new Error('Fehler '+res.status);
    const data=await res.json(); const cur=$('voice').value;
    $('voice').innerHTML=data.voices.map((v)=>'<option value="'+esc(v.ShortName)+'">'+esc(v.Locale)+' – '+esc(v.ShortName)+' ('+esc(v.Gender)+')</option>').join('');
    if(data.voices.some((v)=>v.ShortName===cur)) $('voice').value=cur;
    $('speechStatus').textContent=data.voices.length+' Stimmen geladen.';
  }catch(e){ $('speechStatus').textContent='Fehler: '+e.message; }
});
if(sessionStorage.getItem('blg_admin')) $('adminToken').value=sessionStorage.getItem('blg_admin');
if(sessionStorage.getItem('blg_client')) $('clientToken').value=sessionStorage.getItem('blg_client');
</script>
</body>
</html>
`;
}

