import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
export default function PackingChecklist({ event, date }) {
  const [checked, setChecked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => api.get(`/calendar/events/${event.id}/packing?date=${date}`).then(data => { if (active) { setChecked(data); setError(''); } }).catch(() => { if (active) setError('Kunne ikke hente avkrysninger.'); });
    load(); socket.on('packing:update', load);
    return () => { active = false; socket.off('packing:update', load); };
  }, [event.id, date]);
  async function toggle(item, value) {
    setBusy(true);
    try { setChecked(await api.put(`/calendar/events/${event.id}/packing`, { date, item, checked: value })); setError(''); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="packing-checklist">{error && <span role="alert">{error}</span>}{[...new Set((event.bring_list || '').split('\n').map(item => item.trim()).filter(Boolean))].map(item => <label key={item}><input type="checkbox" checked={checked.includes(item)} disabled={busy} onChange={e => toggle(item, e.target.checked)} />{item}</label>)}</div>;
}
