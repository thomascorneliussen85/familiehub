import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import './BriefModal.css';

const MODULE_ICON = {
  calendar: '📅',
  weather: '🌦️',
  power: '⚡',
  chores: '✅',
  news: '📰',
  market: '📈',
  verse: '📖',
  quote: '💬',
  fact: '🎉',
};

function pickNorwegianVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return (
    voices.find((v) => v.lang === 'nb-NO') ||
    voices.find((v) => v.lang?.toLowerCase().startsWith('nb')) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith('no')) ||
    null
  );
}

export default function BriefModal({ member, onClose }) {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState('');
  const utteranceRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let data = await api.get(`/brief/${member.id}/today`);
      if (!data) {
        data = await api.post(`/brief/generate/${member.id}`);
      }
      setBrief(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [member.id]);

  useEffect(() => {
    load();
  }, [load]);

  const speak = useCallback((text) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'nb-NO';
    const voice = pickNorwegianVoice();
    if (voice) utter.voice = voice;
    utter.onend = () => {
      setSpeaking(false);
      setPaused(false);
    };
    utter.onerror = () => {
      setSpeaking(false);
      setPaused(false);
    };
    utteranceRef.current = utter;
    window.speechSynthesis.speak(utter);
    setSpeaking(true);
    setPaused(false);
  }, []);

  useEffect(() => {
    if (!loading && brief?.content && 'speechSynthesis' in window) {
      // Stemmelisten kan lastes asynkront – forsøk med det samme, og på nytt
      // når nettleseren varsler at listen er klar (typisk ved første bruk).
      if (window.speechSynthesis.getVoices().length > 0) {
        speak(brief.content);
      } else {
        const onVoices = () => {
          speak(brief.content);
          window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
        };
        window.speechSynthesis.addEventListener('voiceschanged', onVoices);
        return () => window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, brief?.content]);

  useEffect(() => {
    return () => window.speechSynthesis?.cancel();
  }, []);

  async function handleClose() {
    window.speechSynthesis?.cancel();
    await api.post(`/brief/${member.id}/heard`).catch(() => {});
    onClose();
  }

  async function regenerate() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setLoading(true);
    setError('');
    try {
      const data = await api.post(`/brief/generate/${member.id}`);
      setBrief(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function togglePause() {
    if (!speaking) {
      if (brief?.content) speak(brief.content);
      return;
    }
    if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    } else {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  }

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setPaused(false);
  }

  const modules = brief?.modules ? JSON.parse(brief.modules) : [];

  return (
    <div className="brief-overlay" onClick={handleClose}>
      <div className="brief-modal" onClick={(e) => e.stopPropagation()}>
        <button className="brief-close" onClick={handleClose} aria-label="Lukk">
          ✕
        </button>
        <div className="brief-header">
          <span className="brief-avatar" style={{ background: member.color }}>
            {member.avatar}
          </span>
          <div>
            <div className="brief-title">Morgenbrief for {member.name}</div>
            {modules.length > 0 && (
              <div className="brief-module-icons">
                {modules.map((m) => (
                  <span key={m} title={m}>
                    {MODULE_ICON[m] || '•'}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="brief-body">
          {loading && <div className="brief-loading">Lager briefen din…</div>}
          {error && <div className="brief-error">{error}</div>}
          {!loading && !error && brief && <p className="brief-content">{brief.content}</p>}
          {brief?.is_demo ? <div className="brief-demo-hint">📋 Demobrief (ingen Claude API-nøkkel satt)</div> : null}
        </div>

        <div className="brief-controls">
          <button
            className="brief-play-btn"
            onClick={togglePause}
            disabled={loading || !brief}
            aria-label={speaking && !paused ? 'Pause' : 'Spill av'}
          >
            {speaking && !paused ? '⏸️' : '▶️'}
          </button>
          <button className="brief-stop-btn" onClick={stopSpeaking} disabled={!speaking} aria-label="Stopp">
            ⏹️
          </button>
          <button className="btn" onClick={regenerate} disabled={loading}>
            🔄 Oppdater
          </button>
        </div>
      </div>
    </div>
  );
}
