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

// Trykk-og-snakk: ingen kontinuerlig lytting i bakgrunnen lenger (fjernet
// vekkeord-funksjonen på ønske) – mikrofonen aktiveres kun ved klikk.
export default function VoiceButton() {
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [feedback, setFeedback] = useState('');
  const recognitionRef = useRef(null);
  // 'command' | 'suspended' | 'idle' – hva den aktive/planlagte gjenkjenningen er for.
  const modeRef = useRef('idle');
  // Sikkerhetsnett for mobil, der gjenkjenningen av og til bare henger uten å
  // noensinne fyre onresult/onend/onerror (sett på rødt for alltid, ingen
  // respons) – tvinger den til å gi opp etter en stund i stedet.
  const commandTimeoutRef = useRef(null);
  const timer = useTimer();
  const { openPanel } = usePanelNavigation();

  useEffect(() => {
    return () => {
      modeRef.current = 'idle';
      recognitionRef.current?.abort();
      clearCommandTimeout();
    };
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

  function createRecognition() {
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = 'nb-NO';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => handleResult(recognition, event);
    recognition.onend = () => handleEnd(recognition);
    recognition.onerror = (event) => handleError(recognition, event);
    return recognition;
  }

  function startRecognition(isRetry) {
    modeRef.current = 'command';
    const recognition = createRecognition();
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      clearCommandTimeout();
      commandTimeoutRef.current = setTimeout(() => {
        if (recognitionRef.current !== recognition) return;
        recognition.abort();
        modeRef.current = 'idle';
        setListening(false);
        setFeedback('Hørte ingenting. Prøv igjen.');
      }, 8000);
    } catch (err) {
      // Kan skje hvis en annen gjenkjenning fortsatt er i ferd med å stoppe
      // (spesielt på Android, der bare én gjenkjenning kan være aktiv om
      // gangen). Tidligere ble denne feilen svelget helt stille, så
      // mikrofon-knappen så ut til ikke å reagere i det hele tatt – nå
      // prøver vi én gang til, og viser en tydelig feilmelding hvis det
      // fortsatt ikke går.
      setListening(false);
      if (isRetry) {
        modeRef.current = 'idle';
        setFeedback(`Klarte ikke å starte mikrofonen: ${err?.message || 'ukjent feil'}`);
        return;
      }
      setTimeout(() => startRecognition(true), 300);
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
      modeRef.current = 'idle';
    }
  }

  function handleResult(recognitionInstance, event) {
    if (recognitionRef.current !== recognitionInstance) return; // gjenkjenning fra en instans som ikke lenger er aktiv
    if (modeRef.current !== 'command') return;
    clearCommandTimeout();
    const text = event.results[0][0].transcript;
    runCommand(text);
  }

  function handleEnd(recognitionInstance) {
    if (recognitionRef.current !== recognitionInstance) return;
    clearCommandTimeout();
    setListening(false);
  }

  function handleError(recognitionInstance, event) {
    if (recognitionRef.current !== recognitionInstance) return;
    clearCommandTimeout();
    setListening(false);
    const message = SPEECH_ERROR_MESSAGES[event.error];
    if (message) setFeedback(message);
    else if (event.error) setFeedback(`Talegjenkjenning feilet: ${event.error}`);
    modeRef.current = 'idle';
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
      return;
    }
    clearCommandTimeout();
    recognitionRef.current?.abort();
    setFeedback('');
    startRecognition();
  }

  return (
    <div className="voice-control">
      {feedback && <div className="voice-feedback">{feedback}</div>}
      <button
        className={`voice-btn ${listening ? 'voice-btn-active' : ''} ${thinking ? 'voice-btn-thinking' : ''}`}
        onClick={handleMicClick}
        aria-label="Stemmestyring"
      >
        {thinking ? '🤔' : '🎤'}
      </button>
    </div>
  );
}
