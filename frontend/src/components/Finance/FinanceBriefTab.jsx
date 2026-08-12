import { useEffect, useState } from 'react';

function formatWeek(weekStart) {
  const d = new Date(weekStart);
  return `Uke fra ${d.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
}

export default function FinanceBriefTab({ adminApi }) {
  const [briefs, setBriefs] = useState([]);
  const [regenerating, setRegenerating] = useState(false);
  const [question, setQuestion] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState('');

  function loadBriefs() {
    adminApi.get('/finance-ai/briefs').then(setBriefs);
  }

  useEffect(loadBriefs, [adminApi]);

  async function regenerate() {
    setRegenerating(true);
    try {
      await adminApi.post('/finance-ai/briefs/regenerate');
      loadBriefs();
    } finally {
      setRegenerating(false);
    }
  }

  async function ask() {
    const q = question.trim();
    if (!q) return;
    setQuestion('');
    setAsking(true);
    setChatError('');
    try {
      const { reply } = await adminApi.post('/finance-ai/chat', { message: q });
      setChatLog((log) => [...log, { question: q, answer: reply }]);
    } catch (err) {
      setChatError(err.message);
    } finally {
      setAsking(false);
    }
  }

  const [latest, ...history] = briefs;

  return (
    <div className="finance-brief-tab">
      <div className="finance-section">
        <div className="finance-header-row">
          <div className="finance-subtitle">Ukens brief</div>
          <button className="btn btn-icon" onClick={regenerate} disabled={regenerating}>
            {regenerating ? 'Genererer…' : 'Regenerer'}
          </button>
        </div>
        {!latest && <div className="finance-hint">Ingen brief generert ennå.</div>}
        {latest && (
          <div className="finance-brief-card">
            <div className="finance-brief-week">{formatWeek(latest.week_start)}</div>
            <div className="finance-brief-content">{latest.content}</div>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="finance-section">
          <div className="finance-subtitle">Tidligere briefer</div>
          <ul className="finance-brief-history">
            {history.map((b) => (
              <li key={b.id} className="finance-brief-history-item">
                <span className="finance-brief-week">{formatWeek(b.week_start)}</span>
                <span className="finance-brief-history-content">{b.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="finance-section">
        <div className="finance-subtitle">Spør om økonomien</div>
        <div className="finance-chat-log">
          {chatLog.map((entry, i) => (
            <div key={i} className="finance-chat-entry">
              <div className="finance-chat-question">{entry.question}</div>
              <div className="finance-chat-answer">{entry.answer}</div>
            </div>
          ))}
        </div>
        {chatError && <div className="finance-error">{chatError}</div>}
        <form
          className="finance-chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
        >
          <input
            placeholder="F.eks. hvordan ligger vi an i forhold til budsjettet?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={asking}
          />
          <button type="submit" className="btn btn-accent" disabled={asking || !question.trim()}>
            {asking ? '…' : 'Spør'}
          </button>
        </form>
      </div>
    </div>
  );
}
