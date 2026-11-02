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
      const res = await clientFetch('/v1/audio/speech', { method: 'POST', body: JSON.stringify({ input: text.trim(), voice }) });
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
      <label>Stimme</label>
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
    </>
  );
}
