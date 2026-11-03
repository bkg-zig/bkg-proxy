import { useEffect, useRef, useState } from 'react';
import { clientFetch, clientToken } from '../lib/api';

interface Msg { who: string; text: string; mine?: boolean }

export const GERMAN_VOICES = [
  { value: 'de-DE-KatjaNeural', label: 'Deutsch: Katja (Frau)' },
  { value: 'de-DE-ConradNeural', label: 'Deutsch: Conrad (Mann)' },
  { value: 'de-DE-AmalaNeural', label: 'Deutsch: Amala (Frau)' },
  { value: 'de-DE-KillianNeural', label: 'Deutsch: Killian (Mann)' },
  { value: 'de-DE-SeraphinaMultilingualNeural', label: 'Deutsch: Seraphina (Frau, mehrsprachig)' },
  { value: 'de-DE-FlorianMultilingualNeural', label: 'Deutsch: Florian (Mann, mehrsprachig)' },
  { value: 'de-AT-IngridNeural', label: 'Österreich: Ingrid (Frau)' },
  { value: 'de-AT-JonasNeural', label: 'Österreich: Jonas (Mann)' },
  { value: 'de-CH-LeniNeural', label: 'Schweiz: Leni (Frau)' },
  { value: 'de-CH-JanNeural', label: 'Schweiz: Jan (Mann)' },
];

export function ChatPage() {
  const [model, setModel] = useState('auto');
  const [voice, setVoice] = useState('de-DE-KatjaNeural');
  const [input, setInput] = useState('Erkläre mir in zwei Sätzen, was du kannst.');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState('');
  const history = useRef<Array<{ role: string; content: string }>>([]);
  const lastAnswer = useRef('');
  const audioRef = useRef<HTMLAudioElement>(null);

  const needKey = () => {
    if (clientToken()) return false;
    setStatus('Bitte oben deinen API-Key eintragen.');
    return true;
  };

  const send = async () => {
    const text = input.trim();
    if (!text) { setStatus('Bitte zuerst eine Nachricht schreiben.'); return; }
    if (needKey()) return;
    setMessages((m) => [...m, { who: 'Du', text, mine: true }]);
    history.current.push({ role: 'user', content: text });
    setMessages((m) => [...m, { who: model, text: '' }]);
    setStatus('Antwort kommt...');
    try {
      const res = await clientFetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'X-Conversation-Id': 'studio-chat' },
        body: JSON.stringify({ model, messages: history.current, max_tokens: 1024, stream: true }),
      });
      if (!res.ok || !res.body) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(d.error?.message ?? `Fehler ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', answer = '';
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        buf += decoder.decode(part.value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith('data:') || s === 'data: [DONE]') continue;
          try {
            const j = JSON.parse(s.slice(5)) as { choices?: Array<{ delta?: { content?: string } }> };
            const c = j.choices?.[0]?.delta?.content ?? '';
            if (c) {
              answer += c;
              setMessages((m) => {
                const next = [...m];
                next[next.length - 1] = { who: model, text: answer };
                return next;
              });
            }
          } catch { /* partial lines are buffered */ }
        }
      }
      lastAnswer.current = answer;
      history.current.push({ role: 'assistant', content: answer });
      setStatus('Antwort da.');
    } catch (e) {
      setStatus(`Fehler: ${e instanceof Error ? e.message : 'unbekannt'}`);
    }
  };

  const speak = async (text: string) => {
    if (needKey()) return;
    const res = await clientFetch('/v1/audio/speech', {
      method: 'POST',
      body: JSON.stringify({ input: text.slice(0, 2000), voice }),
    });
    if (!res.ok) throw new Error(`Fehler ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    if (audioRef.current) {
      audioRef.current.src = url;
      await audioRef.current.play().catch(() => undefined);
    }
  };

  const mic = () => {
    const w = window as unknown as { SpeechRecognition?: new () => { lang: string; start: () => void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onerror: () => void }; webkitSpeechRecognition?: unknown };
    const Rec = w.SpeechRecognition ?? (w.webkitSpeechRecognition as typeof w.SpeechRecognition);
    if (!Rec) { setStatus('Dieser Browser kann keine Sprache erkennen. Bitte tippen.'); return; }
    const rec = new Rec();
    rec.lang = 'de-DE';
    setStatus('Ich höre zu. Bitte sprechen.');
    rec.onresult = (e) => { setInput(e.results[0][0].transcript); setStatus('Erkannt. Jetzt Senden drücken.'); };
    rec.onerror = () => setStatus('Nichts erkannt. Bitte noch einmal.');
    rec.start();
  };

  return (
    <>
      <h2>Studio Chat</h2>
      <p className="muted">Schreibe mit deinen Modellen über deine eine API. Antworten kommen live als Stream und können vorgelesen werden.</p>
      <div className="row">
        <div><label>Modell</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="auto">auto (bestes)</option><option value="fast">fast</option>
            <option value="chat">chat</option><option value="code">code</option>
            <option value="deep-think">deep-think</option><option value="vision">vision</option>
            <option value="cf-free">cf-free (Cloudflare gratis)</option><option value="cf-fast">cf-fast (Cloudflare gratis)</option>
            <option value="cf-code">cf-code (Cloudflare gratis)</option><option value="cf-reasoning">cf-reasoning (Cloudflare gratis)</option>
          </select></div>
        <div><label>Vorlese-Stimme</label>
          <select value={voice} onChange={(e) => setVoice(e.target.value)}>
            {GERMAN_VOICES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            <option value="en-US-AvaMultilingualNeural">Englisch: Ava</option>
          </select></div>
      </div>
      <div aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`msg${m.mine ? ' user' : ''}`}>
            <p className="who">{m.who}</p><p>{m.text}</p>
          </div>
        ))}
      </div>
      <label>Deine Nachricht</label>
      <textarea value={input} onChange={(e) => setInput(e.target.value)} />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => void send()}>Senden</button>
        <button className="btn" onClick={() => { if (lastAnswer.current) void speak(lastAnswer.current).catch((e: Error) => setStatus(`Fehler: ${e.message}`)); else setStatus('Noch keine Antwort zum Vorlesen.'); }}>Letzte Antwort vorlesen</button>
        <button className="btn" onClick={mic}>Sprechen statt tippen</button>
        <button className="btn" onClick={() => { history.current = []; lastAnswer.current = ''; setMessages([]); setStatus('Verlauf geleert.'); }}>Verlauf leeren</button>
      </div>
      <p className="status" role="status">{status}</p>
      <audio ref={audioRef} controls hidden />
    </>
  );
}

export function ImagesPage() {
  const [prompt, setPrompt] = useState('');
  const [engine, setEngine] = useState('sdxl-lightning');
  const [status, setStatus] = useState('');
  const [img, setImg] = useState('');
  const generate = async () => {
    if (!prompt.trim()) { setStatus('Bitte zuerst beschreiben, was auf dem Bild sein soll.'); return; }
    if (!clientToken()) { setStatus('Bitte oben deinen API-Key eintragen.'); return; }
    setStatus('Bild wird erstellt...');
    setImg('');
    try {
      const res = await clientFetch('/v1/images/generations', {
        method: 'POST',
        body: JSON.stringify({ prompt: prompt.trim(), model: engine }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(d.error?.message ?? `Fehler ${res.status}`);
      }
      if ((res.headers.get('Content-Type') ?? '').includes('application/json')) {
        const d = (await res.json()) as { data: Array<{ url: string }> };
        setImg(d.data[0].url);
      } else {
        setImg(URL.createObjectURL(await res.blob()));
      }
      setStatus('Bild fertig.');
    } catch (e) {
      setStatus(`Fehler: ${e instanceof Error ? e.message : 'unbekannt'}`);
    }
  };
  return (
    <>
      <h2>Bild erstellen</h2>
      <label>Was soll auf dem Bild sein?</label>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ein Roboter kocht Frühstück in einer kleinen Küche" />
      <label>Bild-Maschine</label>
      <select value={engine} onChange={(e) => setEngine(e.target.value)}>
        <option value="sdxl-lightning">Schnell (SDXL Lightning)</option>
        <option value="sdxl">Beste Qualität (SDXL)</option>
        <option value="dreamshaper">DreamShaper</option>
        <option value="flux-schnell">Flux Schnell (Cloudflare gratis)</option>
        <option value="lucid-origin">Lucid Origin (Cloudflare gratis)</option>
        <option value="pollinations-flux">Pollinations Flux (kostenlos, extern)</option>
      </select>
      <div className="row" style={{ marginTop: 12 }}>
        {['Cyberpunk-Stadt bei Nacht, Regen, Neonlicht', 'Raumstation über der Erde bei Sonnenaufgang', 'Ein freundlicher Roboter kocht Frühstück'].map((p) => (
          <button key={p} className="btn" onClick={() => setPrompt(p)}>Beispiel</button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => void generate()}>Bild erstellen</button>
      </div>
      <p className="status" role="status">{status}</p>
      {img && <img className="result" src={img} alt="Erstelltes Bild" />}
    </>
  );
}

export function SpeechPage() {
  const [text, setText] = useState('Hallo! Dein Proxy kann jetzt auch sprechen.');
  const [engine, setEngine] = useState('edge');
  const [voice, setVoice] = useState('de-DE-KatjaNeural');
  const [voices, setVoices] = useState<Array<{ ShortName: string; Locale: string; Gender: string }>>([]);
  const [status, setStatus] = useState('');
  const [audio, setAudio] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);

  const speak = async () => {
    if (!text.trim()) { setStatus('Bitte zuerst einen Text eingeben.'); return; }
    if (!clientToken()) { setStatus('Bitte oben deinen API-Key eintragen.'); return; }
    setStatus('Stimme wird erstellt...');
    try {
      const res = await clientFetch('/v1/audio/speech', { method: 'POST', body: JSON.stringify({ input: text.trim(), voice, engine }) });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(d.error?.message ?? `Fehler ${res.status}`);
      }
      const url = URL.createObjectURL(await res.blob());
      setAudio(url);
      requestAnimationFrame(() => void audioRef.current?.play().catch(() => undefined));
      setStatus('Fertig. Die Stimme läuft.');
    } catch (e) {
      setStatus(`Fehler: ${e instanceof Error ? e.message : 'unbekannt'}`);
    }
  };

  const loadVoices = async () => {
    if (!clientToken()) { setStatus('Bitte oben deinen API-Key eintragen.'); return; }
    setStatus('Lade alle Stimmen...');
    try {
      const res = await clientFetch('/v1/audio/voices');
      if (!res.ok) throw new Error(`Fehler ${res.status}`);
      const d = (await res.json()) as { voices: Array<{ ShortName: string; Locale: string; Gender: string }> };
      setVoices(d.voices);
      setStatus(`${d.voices.length} Stimmen geladen.`);
    } catch (e) {
      setStatus(`Fehler: ${e instanceof Error ? e.message : 'unbekannt'}`);
    }
  };

  useEffect(() => {
    if (clientToken() && !voices.length) void loadVoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const germanLoaded = voices.filter((v) => v.Locale.startsWith('de-'));
  const restLoaded = voices.filter((v) => !v.Locale.startsWith('de-'));

  return (
    <>
      <h2>Text vorlesen (Microsoft Edge Stimmen)</h2>
      <label>Text zum Vorlesen</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} />
      <label>Stimmen-Maschine</label>
      <select value={engine} onChange={(e) => setEngine(e.target.value)}>
        <option value="edge">Microsoft Edge (322 Stimmen)</option>
        <option value="melotts">MeloTTS (Cloudflare gratis)</option>
      </select>
      <label>Stimme (nur Edge)</label>
      <select value={voice} onChange={(e) => setVoice(e.target.value)}>
        <optgroup label="Deutsche Stimmen">
          {(germanLoaded.length ? germanLoaded.map((v) => ({ value: v.ShortName, label: `${v.Locale} – ${v.ShortName} (${v.Gender})` })) : GERMAN_VOICES).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </optgroup>
        {restLoaded.length > 0 && (
          <optgroup label="Alle anderen Stimmen">
            {restLoaded.map((v) => (
              <option key={v.ShortName} value={v.ShortName}>{v.Locale} – {v.ShortName} ({v.Gender})</option>
            ))}
          </optgroup>
        )}
        {!voices.length && <option value="en-US-AvaMultilingualNeural">Englisch: Ava (Standard)</option>}
      </select>
      <p className="muted">Alle zehn deutschsprachigen Edge-Stimmen sind sofort da. Microsoft gibt für Deutsch über diesen kostenlosen Dienst nicht mehr her, die übrigen sind Azure-Bezahlstimmen und antworten hier nicht.</p>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-ai" onClick={() => void speak()}>Vorlesen</button>
        <button className="btn" onClick={() => void loadVoices()}>Alle Stimmen laden</button>
      </div>
      <p className="status" role="status">{status}</p>
      {audio && <audio ref={audioRef} src={audio} controls />}
      {audio && (
        <div className="row" style={{ marginTop: 10 }}>
          <a className="btn" href={audio} download="sprache.mp3">MP3 herunterladen</a>
        </div>
      )}
      <TranscribeCard />
    </>
  );
}

function TranscribeCard() {
  const [status, setStatus] = useState('');
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const transcribe = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setStatus('Bitte zuerst eine Ton-Datei wählen.'); return; }
    if (!clientToken()) { setStatus('Bitte oben deinen API-Key eintragen.'); return; }
    setStatus('Wird in Text verwandelt...');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientToken()}` },
        body: form,
      });
      const d = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
      if (!res.ok) throw new Error(d.error?.message ?? `Fehler ${res.status}`);
      setText(d.text ?? '');
      setStatus('Fertig.');
    } catch (e) {
      setStatus(`Fehler: ${e instanceof Error ? e.message : 'unbekannt'}`);
    }
  };
  return (
    <>
      <h2 style={{ marginTop: 30 }}>Ton in Text (Whisper, gratis)</h2>
      <p className="muted">Sprachnachricht oder Aufnahme hochladen, bKG schreibt sie als Text.</p>
      <label>Ton-Datei</label>
      <input ref={fileRef} type="file" accept="audio/*" />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => void transcribe()}>In Text verwandeln</button>
      </div>
      <p className="status" role="status">{status}</p>
      {text && (
        <>
          <label>Erkannter Text</label>
          <textarea readOnly value={text} />
        </>
      )}
    </>
  );
}

const HELP_TEXT = `bKG Proxy Hilfe. Die API liegt unter api.eysho.info, das Studio unter studio.eysho.info. Modelle: auto ist das beste NVIDIA-Modell, fast ist schnell, code ist für Programmieren, vision versteht Bilder. cf-free, cf-fast, cf-code und cf-reasoning sind gratis Cloudflare-Modelle. Jeder NVIDIA-Key darf 40 Anfragen in 60 Sekunden. Wenn alle Keys voll sind, wartet die Anfrage in einer fairen Schlange, statt zu scheitern. Streams senden Herzschlag-Zeilen, damit die Verbindung nicht abreißt. Im Dashboard können Admins Modelle und Keys verwalten, Nutzer sehen nur ihre eigenen Keys. Bilder gehen mit SDXL, Flux und Lucid. Sprache vorlesen geht mit Edge-Stimmen und Melo. Ton in Text geht mit Whisper. Wissen: Eigene Texte können als Dokumente gespeichert und dann vom Assistenten durchsucht werden.`;

interface RagDoc { id: string; title: string; chunks: number; created_at: number }
interface RagSource { title: string; score: number }

export function KnowledgePage() {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [docs, setDocs] = useState<RagDoc[]>([]);
  const [status, setStatus] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<RagSource[]>([]);

  const load = async () => {
    const d = await (await clientFetch('/v1/rag/documents')).json() as { documents: RagDoc[] };
    setDocs(d.documents ?? []);
  };
  useEffect(() => { if (clientToken()) void load().catch(() => undefined); }, []);

  const add = async (docTitle: string, docText: string) => {
    const res = await clientFetch('/v1/rag/documents', {
      method: 'POST',
      body: JSON.stringify({ title: docTitle, text: docText }),
    });
    const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok) throw new Error(d.error?.message ?? `Fehler ${res.status}`);
  };

  return (
    <>
      <h2>Wissen (wie DevAssist und Tocyn)</h2>
      <p className="muted">Speichere eigene Texte. Der Assistent durchsucht sie und antwortet daraus, mit Quellen. Alles gratis auf Cloudflare: BGE-Einbettungen, Vectorize-Suche, D1 für die Texte.</p>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => {
          void (async () => {
            try { await add('bKG Proxy Hilfe', HELP_TEXT); setStatus('Hilfe gespeichert. Der Assistent kennt jetzt den Proxy.'); await load(); }
            catch (e) { setStatus(`Fehler: ${e instanceof Error ? e.message : 'unbekannt'}`); }
          })();
        }}>bKG Hilfe als erstes Wissen speichern</button>
      </div>
      <label>Titel</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Zum Beispiel: Meine Notizen" />
      <label>Text</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Hier deinen Text einfügen" style={{ minHeight: 130 }} />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => {
          void (async () => {
            try { await add(title.trim() || 'Ohne Titel', text); setStatus('Gespeichert und durchsuchbar.'); setText(''); await load(); }
            catch (e) { setStatus(`Fehler: ${e instanceof Error ? e.message : 'unbekannt'}`); }
          })();
        }}>Wissen speichern</button>
      </div>
      <p className="status" role="status">{status}</p>
      <h2>Gespeicherte Dokumente</h2>
      {docs.length ? (
        <table className="cyber-table">
          <thead><tr><th>Titel</th><th>Stücke</th><th>Gespeichert</th><th>Aktion</th></tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>{d.title}</td><td>{d.chunks}</td><td>{new Date(d.created_at).toLocaleString('de-DE')}</td>
                <td><button className="btn btn-danger" onClick={() => {
                  if (!confirm('Dokument wirklich löschen?')) return;
                  void clientFetch(`/v1/rag/documents/${encodeURIComponent(d.id)}`, { method: 'DELETE' }).then(() => load());
                }}>Löschen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted">Noch kein Wissen gespeichert.</p>}
      <AskAssistant question={question} setQuestion={setQuestion} answer={answer} setAnswer={setAnswer} sources={sources} setSources={setSources} />
    </>
  );
}

function AskAssistant({ question, setQuestion, answer, setAnswer, sources, setSources }: {
  question: string; setQuestion: (v: string) => void;
  answer: string; setAnswer: (v: string) => void;
  sources: RagSource[]; setSources: (v: RagSource[]) => void;
}) {
  const [status, setStatus] = useState('');
  const ask = async () => {
    if (!question.trim()) { setStatus('Bitte zuerst eine Frage schreiben.'); return; }
    if (!clientToken()) { setStatus('Bitte oben deinen API-Key eintragen.'); return; }
    setStatus('Assistent sucht im Wissen...');
    try {
      const res = await clientFetch('/v1/rag/query', { method: 'POST', body: JSON.stringify({ question: question.trim() }) });
      const d = (await res.json().catch(() => ({}))) as { answer?: string; sources?: RagSource[]; error?: { message?: string } };
      if (!res.ok) throw new Error(d.error?.message ?? `Fehler ${res.status}`);
      setAnswer(d.answer ?? '');
      setSources(d.sources ?? []);
      setStatus('Antwort da.');
    } catch (e) {
      setStatus(`Fehler: ${e instanceof Error ? e.message : 'unbekannt'}`);
    }
  };
  return (
    <>
      <h2>Assistenten fragen</h2>
      <label>Deine Frage ans Wissen</label>
      <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Zum Beispiel: Wie viele Anfragen darf ein Key pro Minute?" />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-ai" onClick={() => void ask()}>Assistent fragen</button>
      </div>
      <p className="status" role="status">{status}</p>
      {answer && <div className="msg"><p className="who">Assistent</p><p>{answer}</p></div>}
      {sources.length > 0 && (
        <p className="muted" style={{ marginTop: 8 }}>
          Quellen: {sources.map((s, i) => <span key={i} className="badge badge-cyan" style={{ marginRight: 6 }}>[{i + 1}] {s.title}</span>)}
        </p>
      )}
    </>
  );
}

export function AssistantWidget({ onNeedLogin }: { onNeedLogin: () => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [items, setItems] = useState<Array<{ who: string; text: string; mine?: boolean }>>([
    { who: 'Assistent', text: 'Hallo, ich bin dein bKG-Assistent. Frag mich etwas zu deinem Wissen oder zum Proxy.' },
  ]);
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    const q = input.trim();
    if (!q || busy) return;
    if (!clientToken()) { onNeedLogin(); return; }
    setItems((m) => [...m, { who: 'Du', text: q, mine: true }]);
    setInput('');
    setBusy(true);
    try {
      const res = await clientFetch('/v1/rag/query', { method: 'POST', body: JSON.stringify({ question: q }) });
      const d = (await res.json().catch(() => ({}))) as { answer?: string; sources?: RagSource[]; error?: { message?: string } };
      if (!res.ok) throw new Error(d.error?.message ?? `Fehler ${res.status}`);
      const src = (d.sources ?? []).map((s, i) => `[${i + 1}] ${s.title}`).join(' ');
      setItems((m) => [...m, { who: 'Assistent', text: `${d.answer ?? ''}${src ? `\nQuellen: ${src}` : ''}` }]);
    } catch (e) {
      setItems((m) => [...m, { who: 'Assistent', text: `Fehler: ${e instanceof Error ? e.message : 'unbekannt'}` }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="widget">
      {open && (
        <div className="widget-panel" role="dialog" aria-label="bKG Assistent">
          <div className="widget-head">
            <strong>bKG Assistent</strong>
            <button className="btn" onClick={() => setOpen(false)} aria-label="Assistent schließen">Schließen</button>
          </div>
          <div className="widget-log" aria-live="polite">
            {items.map((m, i) => (
              <div key={i} className={`msg${m.mine ? ' user' : ''}`}><p className="who">{m.who}</p><p>{m.text}</p></div>
            ))}
          </div>
          <label htmlFor="widgetInput">Frage an den Assistenten</label>
          <div className="row">
            <div><input id="widgetInput" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void ask(); }} placeholder="Frage schreiben" /></div>
            <button className="btn btn-ai" onClick={() => void ask()} disabled={busy}>{busy ? 'Sucht...' : 'Fragen'}</button>
          </div>
        </div>
      )}
      <button className="btn btn-ai widget-button" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Assistent schließen' : 'Assistent fragen'}
      </button>
    </div>
  );
}
