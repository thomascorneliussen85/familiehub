import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function SaveStatus() {
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState(null);
  const [undo, setUndo] = useState([]);
  const [restoring, setRestoring] = useState(null);
  useEffect(() => {
    function changed({ detail }) {
      if (detail.phase === 'start') { setPending(n => n + 1); return; }
      setPending(n => Math.max(0, n - 1));
      setMessage({ error: detail.phase === 'error', text: detail.phase === 'error' ? detail.error : 'Lagret ✓' });
      if (detail.undoToken) setUndo(rows => [...rows, { token: detail.undoToken, label: detail.label, expires: Date.now() + 600000 }]);
    }
    window.addEventListener('hub:save', changed);
    const timer = setInterval(() => setUndo(rows => rows.filter(row => row.expires > Date.now())), 10000);
    return () => { window.removeEventListener('hub:save', changed); clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!message || message.error) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);
  async function restore(token) {
    setRestoring(token);
    try { await api.post(`/undo/${token}`); setUndo(rows => rows.filter(row => row.token !== token)); }
    catch { /* The request error is displayed by this status component. */ }
    finally { setRestoring(null); }
  }
  return <div className="hub-save-status">
    {(pending > 0 || message) && <div className={message?.error ? 'hub-notice hub-notice-error' : 'hub-notice'} role={message?.error ? 'alert' : 'status'}>
      <span>{pending > 0 ? 'Lagrer…' : message?.text}</span>
      {pending === 0 && <button onClick={() => setMessage(null)} aria-label="Lukk melding">×</button>}
    </div>}
    {undo.map(row => <div className="hub-notice" key={row.token}>
      <span>{row.label} slettet</span>
      <button disabled={restoring !== null} onClick={() => restore(row.token)}>{restoring === row.token ? 'Gjenoppretter…' : 'Angre'}</button>
      <button onClick={() => setUndo(rows => rows.filter(item => item.token !== row.token))} aria-label="Lukk angremulighet">×</button>
    </div>)}
  </div>;
}
