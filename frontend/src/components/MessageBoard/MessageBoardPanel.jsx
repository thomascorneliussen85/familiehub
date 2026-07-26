import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import './MessageBoardPanel.css';

const COLORS = ['#fff59d', '#a5d8ff', '#ffc9de', '#b2f2bb', '#ffd8a8'];

export default function MessageBoardPanel() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    api.get('/messages').then(setMessages).catch(() => {});

    function onUpdate({ type, message, id }) {
      setMessages((prev) => {
        if (type === 'created') return [message, ...prev];
        if (type === 'updated') return prev.map((m) => (m.id === message.id ? message : m));
        if (type === 'deleted') return prev.filter((m) => m.id !== id);
        return prev;
      });
    }
    socket.on('messages:update', onUpdate);
    return () => socket.off('messages:update', onUpdate);
  }, []);

  async function addNote() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const rotation = Math.random() * 6 - 3;
    await api.post('/messages', { text, color, rotation }).catch(() => {});
  }

  async function removeNote(id) {
    await api.delete(`/messages/${id}`).catch(() => {});
  }

  return (
    <section className="panel panel-messages">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">📌</span> Beskjedtavle
        </div>
      </div>
      <div className="panel-body">
        <form
          className="note-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            addNote();
          }}
        >
          <input
            type="text"
            placeholder="Skriv en beskjed…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="btn btn-accent">Heng opp</button>
        </form>

        {messages.length === 0 && <div className="empty-hint">Ingen lapper ennå</div>}

        <div className="note-board">
          {messages.map((m) => (
            <div
              key={m.id}
              className="sticky-note"
              style={{ background: m.color, transform: `rotate(${m.rotation}deg)` }}
            >
              <button className="sticky-note-remove" onClick={() => removeNote(m.id)}>✕</button>
              <p className="sticky-note-text">{m.text}</p>
              {m.author && <span className="sticky-note-author">– {m.author}</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
