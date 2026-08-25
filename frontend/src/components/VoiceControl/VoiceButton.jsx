import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useTimer } from '../../context/TimerContext';
import { usePanelNavigation } from '../../context/PanelNavigationContext';
import './VoiceButton.css';

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;

// Chrome (og de fleste nettlesere) krever "secure context" – https, eller
// localhost – for å bruke talegjenkjenning. Åpnes appen via en vanlig
// http://<lokal-ip>:5173-adresse (typisk for et nettbrett på kjøkkenet),
// blokkeres mikrofonen stille uten noen tydelig feilmelding fra nettleseren.
const isInsecureContext = !window.isSecureContext;

const WAKE_WORD_RE = /familie\s*hub/i;
const WAKE_ENABLED_KEY = 'familiehub-wake-enabled';

const SPEECH_ERROR_MESSAGES = {
  'not-allowed': 'Fikk ikke tilgang til mikrofonen. Sjekk mikrofon-tillatelsen for denne siden i nettleseren.',
  'service-not-allowed': 'Nettleseren tillater ikke talegjenkjenning her – dette skjer ofte når siden ikke åpnes over https.',
  'audio-capture': 'Fant ingen mikrofon på denne enheten.',
  'no-speech': 'Hørte ingenting. Prøv igjen.',
  network: 'Nettverksfeil under talegjenkjenning.',
  aborted: '',
};

function speakWithBrowser(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'nb-NO';
    utter.onend = resolve;
    utter.onerror = resolve;
    window.speechSynthesis.speak(utter);
  });
}

// Prøver ElevenLabs først for en naturlig stemme – faller stille tilbake til
// nettleserens robotaktige speechSynthesis hvis familien ikke har satt opp en
// nøkkel ennå (Innstillinger → Stemme), eller hvis kallet feiler av andre grunner.
async function speak(text) {
  try {
    const res = await fetch('/api/voice/speak', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      await new Promise((resolve) => {
        const audio = new Audio(url);
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(resolve);
      });
      URL.revokeObjectURL(url);
      return;
    }
    const detail = await res.json().catch(() => ({}));
    console.warn('ElevenLabs-tale feilet, bruker nettleserens tale i stedet:', res.status, detail.error);
  } catch (err) {
    console.warn('ElevenLabs-tale feilet, bruker nettleserens tale i stedet:', err);
  }
  await speakWithBrowser(text);
}

// Kort pip (i stedet for tale) som kvittering på at vekkeordet ble hørt, siden
// det er raskere og mindre forstyrrende enn å vente på en talesyntese-frase
// før mikrofonen begynner å lytte etter selve kommandoen.
function playBeep() {
  return new Promise((resolve) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
      osc.onended = () => resolve();
    } catch {
      resolve();
    }
  });
}

export default function VoiceButton() {
  const [listening, setListening] = useState(false);
  const [wakeActive, setWakeActive] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [feedback, setFeedback] = useState('');
  // Av som standard: kontinuerlig mikrofonlytting gjør at nettleseren/Android
  // viser et vedvarende "mikrofonen er i bruk"-varsel (og kan gi en varsellyd
  // hver gang gjenkjenningen restarter) – det kan bare unngås ved å ikke
  // lytte kontinuerlig, så brukeren må selv slå det på med 👂-knappen.
  const [wakeEnabled, setWakeEnabled] = useState(() => localStorage.getItem(WAKE_ENABLED_KEY) === '1');
  const recognitionRef = useRef(null);
  // 'wake' | 'command' | 'suspended' | 'idle' – hva den aktive/planlagte gjenkjenningen er for.
  const modeRef = useRef('idle');
  const wakeEnabledRef = useRef(wakeEnabled);
  // Sikkerhetsnett for mobil, der gjenkjenningen av og til bare henger uten å
  // noensinne fyre onresult/onend/onerror (sett på rødt for alltid, ingen
  // respons) – tvinger den til å gi opp etter en stund i stedet.
  const commandTimeoutRef = useRef(null);
  const timer = useTimer();
  const { openPanel } = usePanelNavigation();

  useEffect(() => {
    wakeEnabledRef.current = wakeEnabled;
  }, [wakeEnabled]);

  useEffect(() => {
    if (!SpeechRecognitionImpl || isInsecureContext) return () => {};
    if (wakeEnabledRef.current) {
      startRecognition('wake');
    }
    return () => {
      modeRef.current = 'idle';
      recognitionRef.current?.abort();
      clearCommandTimeout();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SpeechRecognitionImpl) {
    return null;
  }

  function clearCommandTimeout() {
    if (commandTimeoutRef.current) {
      clearTimeout(commandTimeoutRef.current);
      commandTimeoutRef.current = null;
    }
  }

  function createRecognition(mode) {
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = 'nb-NO';
    recognition.continuous = mode === 'wake';
    recognition.interimResults = false;
    recognition.onresult = (event) => handleResult(mode, recognition, event);
    recognition.onend = () => handleEnd(mode, recognition);
    recognition.onerror = (event) => handleError(mode, recognition, event);
    return recognition;
  }

  function startRecognition(mode, isRetry) {
    modeRef.current = mode;
    const recognition = createRecognition(mode);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      if (mode === 'wake') {
        setWakeActive(true);
      } else {
        setListening(true);
        clearCommandTimeout();
        commandTimeoutRef.current = setTimeout(() => {
          if (recognitionRef.current !== recognition) return;
          recognition.abort();
          modeRef.current = 'idle';
          setListening(false);
          setFeedback('Hørte ingenting. Prøv igjen.');
          resumeWakeIfEnabled();
        }, 8000);
      }
    } catch (err) {
      // Kan skje hvis en annen gjenkjenning fortsatt er i ferd med å stoppe
      // (spesielt på Android, der bare én gjenkjenning kan være aktiv om
      // gangen). Tidligere ble denne feilen svelget helt stille, så
      // mikrofon-knappen så ut til ikke å reagere i det hele tatt – nå
      // prøver vi én gang til, og viser en tydelig feilmelding hvis det
      // fortsatt ikke går.
      if (mode === 'wake') setWakeActive(false);
      else setListening(false);
      if (isRetry) {
        modeRef.current = 'idle';
        setFeedback(`Klarte ikke å starte mikrofonen: ${err?.message || 'ukjent feil'}`);
        return;
      }
      setTimeout(() => startRecognition(mode, true), 300);
    }
  }

  function resumeWakeIfEnabled() {
    if (wakeEnabledRef.current && SpeechRecognitionImpl && !isInsecureContext) {
      startRecognition('wake');
    } else {
      modeRef.current = 'idle';
    }
  }

  async function runCommand(text) {
    modeRef.current = 'suspended';
    setListening(false);
    setFeedback(`Hørte: «${text}»`);
    setThinking(true);
    try {
      const { reply, clientActions } = await api.post('/assistant/command', { text });
      for (const action of clientActions || []) {
        if (action.type === 'set_timer') {
          timer.start(action.minutes, action.label || '');
        } else if (action.type === 'open_panel') {
          openPanel(action.key);
        }
      }
      setFeedback(reply);
      await speak(reply);
    } catch (err) {
      setFeedback(`Feil: ${err.message}`);
      await speak('Beklager, jeg fikk ikke gjort det akkurat nå.');
    } finally {
      setThinking(false);
      resumeWakeIfEnabled();
    }
  }

  async function listenForCommand() {
    modeRef.current = 'suspended';
    setFeedback('🎤 Si kommandoen din...');
    await playBeep();
    if (modeRef.current !== 'suspended') return; // slått av eller avbrutt i mellomtiden
    startRecognition('command');
  }

  function handleResult(mode, recognitionInstance, event) {
    if (recognitionRef.current !== recognitionInstance) return; // gjenkjenning fra en instans som ikke lenger er aktiv
    if (mode === 'wake') {
      if (modeRef.current !== 'wake') return;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        const match = WAKE_WORD_RE.exec(transcript);
        if (match) {
          const remainder = transcript.slice(match.index + match[0].length).trim();
          recognitionInstance.abort();
          if (remainder.length > 2) {
            runCommand(remainder);
          } else {
            listenForCommand();
          }
          return;
        }
      }
    } else {
      if (modeRef.current !== 'command') return;
      clearCommandTimeout();
      const text = event.results[0][0].transcript;
      runCommand(text);
    }
  }

  function handleEnd(mode, recognitionInstance) {
    if (recognitionRef.current !== recognitionInstance) return;
    if (mode !== 'wake') clearCommandTimeout();
    if (mode === 'wake') {
      setWakeActive(false);
      // Kontinuerlig gjenkjenning stopper av seg selv (f.eks. etter en stund
      // uten lyd) – start den på nytt automatisk så lenge vi fortsatt skal lytte.
      if (modeRef.current === 'wake') {
        setTimeout(() => {
          if (modeRef.current === 'wake') startRecognition('wake');
        }, 300);
      }
    } else {
      setListening(false);
    }
  }

  function handleError(mode, recognitionInstance, event) {
    if (recognitionRef.current !== recognitionInstance) return;
    if (mode === 'wake') {
      // Stille feil (ingen lyd, nettverksglipp o.l.) ignoreres – onend
      // starter gjenkjenningen på nytt. Ved varige feil (ingen mikrofontilgang)
      // gir vi opp bakgrunnslyttingen og viser en tydelig melding.
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error)) {
        modeRef.current = 'idle';
        setWakeActive(false);
        setFeedback(SPEECH_ERROR_MESSAGES[event.error] || `Talegjenkjenning feilet: ${event.error}`);
      }
      return;
    }
    clearCommandTimeout();
    setListening(false);
    const message = SPEECH_ERROR_MESSAGES[event.error];
    if (message) setFeedback(message);
    else if (event.error) setFeedback(`Talegjenkjenning feilet: ${event.error}`);
    resumeWakeIfEnabled();
  }

  function handleMicClick() {
    if (isInsecureContext) {
      setFeedback('Talegjenkjenning krever en sikker tilkobling (https). Denne siden er åpnet over vanlig http.');
      return;
    }
    if (modeRef.current === 'command') {
      clearCommandTimeout();
      recognitionRef.current?.abort();
      modeRef.current = 'idle';
      setListening(false);
      setFeedback('');
      resumeWakeIfEnabled();
      return;
    }
    clearCommandTimeout();
    recognitionRef.current?.abort();
    setFeedback('');
    startRecognition('command');
  }

  function toggleWakeEnabled() {
    setWakeEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(WAKE_ENABLED_KEY, next ? '1' : '0');
      wakeEnabledRef.current = next;
      if (next) {
        if (modeRef.current === 'idle') startRecognition('wake');
      } else if (modeRef.current === 'wake') {
        recognitionRef.current?.abort();
        modeRef.current = 'idle';
        setWakeActive(false);
      }
      return next;
    });
  }

  return (
    <div className="voice-control">
      {feedback && <div className="voice-feedback">{feedback}</div>}
      {!isInsecureContext && (
        <button
          className="voice-mute-btn"
          onClick={toggleWakeEnabled}
          aria-label={wakeEnabled ? 'Skru av automatisk lytting etter «familiehub»' : 'Skru på automatisk lytting etter «familiehub»'}
          title={wakeEnabled ? 'Lytter etter «familiehub»' : 'Automatisk lytting er av'}
        >
          {wakeEnabled ? '👂' : '🔇'}
        </button>
      )}
      <button
        className={`voice-btn ${listening ? 'voice-btn-active' : ''} ${thinking ? 'voice-btn-thinking' : ''} ${
          wakeActive && !listening && !thinking ? 'voice-btn-wake' : ''
        }`}
        onClick={handleMicClick}
        aria-label="Stemmestyring"
      >
        {thinking ? '🤔' : '🎤'}
      </button>
    </div>
  );
}
