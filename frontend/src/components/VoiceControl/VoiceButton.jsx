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

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'nb-NO';
  window.speechSynthesis.speak(utter);
}

export default function VoiceButton() {
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [feedback, setFeedback] = useState('');
  const recognitionRef = useRef(null);
  const timer = useTimer();
  const { openPanel } = usePanelNavigation();

  useEffect(() => {
    if (!SpeechRecognitionImpl) return;
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = 'nb-NO';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = async (event) => {
      const text = event.results[0][0].transcript;
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
        speak(reply);
      } catch (err) {
        setFeedback(`Feil: ${err.message}`);
        speak('Beklager, jeg fikk ikke gjort det akkurat nå.');
      } finally {
        setThinking(false);
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      setListening(false);
      const message = SPEECH_ERROR_MESSAGES[event.error];
      if (message) setFeedback(message);
      else if (event.error) setFeedback(`Talegjenkjenning feilet: ${event.error}`);
    };

    recognitionRef.current = recognition;
    return () => recognition.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SpeechRecognitionImpl) {
    return null;
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    if (isInsecureContext) {
      setFeedback(
        'Talegjenkjenning krever en sikker tilkobling (https). Denne siden er åpnet over vanlig http.'
      );
      return;
    }
    setFeedback('');
    try {
      recognitionRef.current?.start();
      setListening(true);
    } catch {
      setFeedback('Fikk ikke startet talegjenkjenning. Prøv å laste siden på nytt.');
    }
  }

  return (
    <div className="voice-control">
      {feedback && <div className="voice-feedback">{feedback}</div>}
      <button
        className={`voice-btn ${listening ? 'voice-btn-active' : ''} ${thinking ? 'voice-btn-thinking' : ''}`}
        onClick={toggleListening}
        aria-label="Stemmestyring"
      >
        {thinking ? '🤔' : '🎤'}
      </button>
    </div>
  );
}
