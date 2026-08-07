import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { parseVoiceCommand } from '../../lib/voiceCommands';
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
  const [feedback, setFeedback] = useState('');
  const recognitionRef = useRef(null);
  const timer = useTimer();

  const handleIntent = useCallback(async (intent) => {
    switch (intent.type) {
      case 'ADD_SHOPPING_ITEM': {
        await api.post('/shopping', { name: intent.item });
        setFeedback(`La til «${intent.item}» på handlelisten`);
        speak(`La til ${intent.item} på handlelisten`);
        break;
      }
      case 'SET_TIMER': {
        timer.start(intent.minutes, intent.label);
        setFeedback(`Timer satt på ${intent.minutes} minutter`);
        speak(`Timer satt på ${intent.minutes} minutter`);
        break;
      }
      case 'TOGGLE_PLUG': {
        const plugs = await api.get('/smart-plugs');
        const match = plugs.find((p) => p.name.toLowerCase().includes(intent.name.toLowerCase()));
        if (!match) {
          setFeedback(`Fant ingen plugg som heter «${intent.name}»`);
          speak(`Jeg fant ingen plugg som heter ${intent.name}`);
          break;
        }
        await api.post(`/smart-plugs/${match.id}/toggle`, { on: intent.on });
        const state = intent.on ? 'på' : 'av';
        setFeedback(`Slo ${state} ${match.name}`);
        speak(`Slo ${state} ${match.name}`);
        break;
      }
      case 'ADD_CALENDAR_EVENT': {
        await api.post('/calendar/events', {
          title: intent.title,
          start_at: intent.start_at,
          end_at: intent.end_at,
          all_day: intent.all_day,
        });
        setFeedback(`La til «${intent.title}» i kalenderen`);
        speak(`La til ${intent.title} i kalenderen`);
        break;
      }
      case 'TODAY_SUMMARY': {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        const events = await api.get(
          `/calendar/events?from=${start.toISOString()}&to=${end.toISOString()}`
        );
        if (events.length === 0) {
          setFeedback('Ingen avtaler i dag');
          speak('Det er ingen avtaler i dag.');
        } else {
          const list = events.map((e) => e.title).join(', ');
          setFeedback(`I dag: ${list}`);
          speak(`I dag skjer følgende: ${list}`);
        }
        break;
      }
      case 'PLAY_MORNING_BRIEF': {
        // Foreløpig kobling mot eksisterende stemmemodul: siden appen ikke har
        // et eget "valgt profil"-konsept for stemmestyring ennå, brukes
        // familiemedlemmet som ikke har hørt briefen sin i dag (samme logikk
        // som "God morgen"-kortet på dashbordet).
        const status = await api.get('/brief/status');
        const target = status.find((m) => !m.heard) || status[0];
        if (!target) {
          setFeedback('Fant ingen familiemedlemmer for morgenbrief');
          speak('Jeg fant ingen familiemedlemmer.');
          break;
        }
        setFeedback(`Henter morgenbrief for ${target.name}…`);
        let brief = await api.get(`/brief/${target.id}/today`);
        if (!brief) brief = await api.post(`/brief/generate/${target.id}`);
        setFeedback(`Morgenbrief for ${target.name}: ${brief.content}`);
        speak(brief.content);
        await api.post(`/brief/${target.id}/heard`).catch(() => {});
        break;
      }
      default: {
        setFeedback(`Skjønte ikke: «${intent.raw}»`);
        speak('Beklager, jeg skjønte ikke det.');
      }
    }
  }, [timer]);

  useEffect(() => {
    if (!SpeechRecognitionImpl) return;
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = 'nb-NO';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = async (event) => {
      const text = event.results[0][0].transcript;
      setFeedback(`Hørte: «${text}»`);
      const intent = await parseVoiceCommand(text);
      await handleIntent(intent).catch((err) => setFeedback(`Feil: ${err.message}`));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    return () => recognition.abort();
  }, [handleIntent]);

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
        className={`voice-btn ${listening ? 'voice-btn-active' : ''}`}
        onClick={toggleListening}
        aria-label="Stemmestyring"
      >
        🎤
      </button>
    </div>
  );
}
