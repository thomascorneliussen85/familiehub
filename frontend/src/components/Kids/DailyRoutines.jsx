import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
const TEMPLATES = {
  morning: { title: 'God morgen', items: ['Kle på meg', 'Pusse tenner', 'Spise frokost', 'Pakke skolesekken'] },
  evening: { title: 'God kveld', items: ['Legge frem klær', 'Pakke sekken til i morgen', 'Pusse tenner', 'Finne en bok'] },
};
export default function DailyRoutines({ memberId }) {
  const [chores, setChores] = useState([]);
  const [template, setTemplate] = useState(null);
  const [titles, setTitles] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => api.get('/chores').then(data => { if (active) { setChores(data); setError(''); } }).catch(() => { if (active) setError('Kunne ikke hente rutinene.'); });
    load(); socket.on('chores:update', load); socket.on('connect', load);
    return () => { active = false; socket.off('chores:update', load); socket.off('connect', load); };
  }, []);
  async function add() {
    setBusy(true); setError('');
    try { await api.post('/chores/routines', { member_id: memberId, group: template, titles: titles.split('\n').map(item => item.trim()).filter(Boolean) }); setChores(await api.get('/chores')); setTemplate(null); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function toggle(id) {
    if (busy) return;
    setBusy(true);
    try { await api.post(`/chores/${id}/toggle`); setChores(await api.get('/chores')); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="daily-routines">
    {error && <p role="alert">{error}</p>}
    {Object.entries(TEMPLATES).map(([key, group]) => {
      const items = chores.filter(chore => chore.member_id === memberId && chore.routine_group === key);
      return <section className="routine-card" key={key}>
        <h3>{key === 'morning' ? '☀️' : '🌙'} {group.title}</h3>
        {items.length > 0 && <p>{items.filter(item => item.done).length} av {items.length} ferdig i dag</p>}
        {items.map(item => <label key={item.id} className="routine-step"><input type="checkbox" checked={item.done} disabled={busy} onChange={() => toggle(item.id)} /><span>{item.title}</span></label>)}
        <button className="btn" onClick={() => { setTemplate(key); setTitles(group.items.join('\n')); }}>{items.length ? 'Legg til trinn' : 'Velg rutineforslag'}</button>
      </section>;
    })}
    {template && <div className="routine-editor"><label>Tilpass trinnene (ett per linje)<textarea rows={5} value={titles} onChange={e => setTitles(e.target.value)} /></label>
      <button className="btn" disabled={busy} onClick={() => setTemplate(null)}>Avbryt</button><button className="btn btn-accent" disabled={busy || !titles.trim()} onClick={add}>Legg til rutine</button>
    </div>}
  </div>;
}
