import { useState } from 'react';
import { api } from '../../lib/api';
import './FeedbackButton.css';

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  function close() {
    setOpen(false);
    setMessage('');
    setError('');
    setSent(false);
  }

  async function send() {
    if (!message.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.post('/feedback', { message: message.trim(), page: window.location.pathname });
      setSent(true);
      setTimeout(close, 1800);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        className="feedback-trigger"
        onClick={() => setOpen(true)}
        aria-label="Gi tilbakemelding"
        title="Fant du noe som er galt? Si ifra her"
      >
        💬
      </button>
      {open && (
        <div className="feedback-overlay" onClick={close}>
          <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
            <button className="feedback-close" onClick={close} aria-label="Lukk">
              ✕
            </button>
            {sent ? (
              <div className="feedback-sent">✓ Takk! Tilbakemeldingen er sendt.</div>
            ) : (
              <>
                <div className="feedback-title">Noe som er galt, eller noe du savner?</div>
                <div className="feedback-subtitle">Skriv det her, så tar vi tak i det.</div>
                <textarea
                  className="feedback-textarea"
                  placeholder="F.eks. «Kunne ikke legge til en handleliste-vare» …"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  autoFocus
                />
                {error && <div className="feedback-error">{error}</div>}
                <button className="btn btn-accent feedback-submit" onClick={send} disabled={sending || !message.trim()}>
                  {sending ? 'Sender…' : 'Send tilbakemelding'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
