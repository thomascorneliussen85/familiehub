import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useTimer } from '../../context/TimerContext';
import './VoiceButton.css';

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;

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
    recognition.onerror = () => setListening(false);

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
    } else {
      setFeedback('');
      recognitionRef.current?.start();
      setListening(true);
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
