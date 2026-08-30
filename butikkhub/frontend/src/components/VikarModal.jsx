import { useEffect, useState } from 'react';
import { useAnsatt } from '../context/AnsattContext';

// Vikarforespørsel ved sykemelding. Rent frontend-mønster foreløpig – ingen
// ekte varsling sendes (SMS/push krever egen backend-integrasjon, bevisst
// utelatt). Tilgjengelighet i dag og eksterne vikarer lagres lokalt i
// nettleseren (localStorage), ikke i databasen, så dette virker og
// oppfører seg som en ekte funksjon uten at noe reelt bygges bak den ennå.
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadLedige() {
  try {
    return JSON.parse(localStorage.getItem(`butikkhub-ledig-${todayKey()}`) || '[]');
  } catch {
    return [];
  }
}
function saveLedige(ids) {
  localStorage.setItem(`butikkhub-ledig-${todayKey()}`, JSON.stringify(ids));
}

function loadEksterne() {
  try {
    return JSON.parse(localStorage.getItem('butikkhub-eksterne-vikarer') || '[]');
  } catch {
    return [];
  }
}
function saveEksterne(list) {
  localStorage.setItem('butikkhub-eksterne-vikarer', JSON.stringify(list));
}

function formatDag(dato) {
  const d = new Date(dato + 'T00:00:00');
  return d.toLocaleDateString('nb-NO', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

export default function VikarModal({ skift, onClose }) {
  const { ansatte } = useAnsatt();
  const [ledigeIds, setLedigeIds] = useState(loadLedige);
  const [eksterne, setEksterne] = useState(loadEksterne);
  const [sendt, setSendt] = useState({});
  const [sender, setSender] = useState(null);
  const [nyttNavn, setNyttNavn] = useState('');
  const [nyButikk, setNyButikk] = useState('');

  useEffect(() => saveLedige(ledigeIds), [ledigeIds]);
  useEffect(() => saveEksterne(eksterne), [eksterne]);

  const andreAnsatte = ansatte.filter((a) => a.id !== skift.ansatt_id);

  function toggleLedig(id) {
    setLedigeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function leggTilEkstern() {
    if (!nyttNavn.trim()) return;
    setEksterne((prev) => [...prev, { id: `ekstern-${Date.now()}`, navn: nyttNavn.trim(), butikk: nyButikk.trim() || 'Annen butikk' }]);
    setNyttNavn('');
    setNyButikk('');
  }

  function fjernEkstern(id) {
    setEksterne((prev) => prev.filter((e) => e.id !== id));
  }

  function sendForesporsel(key) {
    setSender(key);
    setTimeout(() => {
      setSender(null);
      setSendt((prev) => ({ ...prev, [key]: true }));
    }, 900);
  }

  const ledigeAnsatte = andreAnsatte.filter((a) => ledigeIds.includes(a.id));
  const ikkeMarkerte = andreAnsatte.filter((a) => !ledigeIds.includes(a.id));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box panel vikar-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>
        <h2>🤒 Finn erstatning</h2>
        <p className="vikar-subtitle">
          {skift.ansatt_navn} er meldt syk — skift {formatDag(skift.dato)}, {skift.start_tid}–{skift.slutt_tid}
        </p>

        <div className="vikar-section">
          <div className="vikar-section-title">Ledige i dag (denne butikken)</div>
          {ledigeAnsatte.length === 0 && <div className="empty-hint">Ingen markert som ledig ennå — kryss av under.</div>}
          {ledigeAnsatte.map((a) => {
            const key = `ansatt-${a.id}`;
            return (
              <div key={a.id} className="vikar-kandidat">
                <span className="ansatt-chip-avatar" style={{ background: a.farge }}>
                  {a.navn[0]}
                </span>
                <span className="vikar-kandidat-navn">{a.navn}</span>
                <span className="pill pill-mottatt">Ledig i dag</span>
                {sendt[key] ? (
                  <span className="vikar-sendt">Forespørsel sendt ✓</span>
                ) : (
                  <button className="btn btn-accent" onClick={() => sendForesporsel(key)} disabled={sender === key}>
                    {sender === key ? 'Sender…' : 'Spør om vikar'}
                  </button>
                )}
              </div>
            );
          })}

          <details className="vikar-marker-toggle">
            <summary>Merk hvem som er ledig i dag</summary>
            <div className="vikar-marker-list">
              {ikkeMarkerte.map((a) => (
                <label key={a.id} className="checkbox-label">
                  <input type="checkbox" checked={false} onChange={() => toggleLedig(a.id)} />
                  {a.navn}
                </label>
              ))}
              {ledigeAnsatte.map((a) => (
                <label key={a.id} className="checkbox-label">
                  <input type="checkbox" checked={true} onChange={() => toggleLedig(a.id)} />
                  {a.navn}
                </label>
              ))}
            </div>
          </details>
        </div>

        <div className="vikar-section">
          <div className="vikar-section-title">Ansatte fra andre butikker</div>
          {eksterne.length === 0 && <div className="empty-hint">Ingen lagt til ennå.</div>}
          {eksterne.map((e) => {
            const key = `ekstern-${e.id}`;
            return (
              <div key={e.id} className="vikar-kandidat">
                <span className="ansatt-chip-avatar" style={{ background: '#555b68' }}>
                  {e.navn[0]}
                </span>
                <span className="vikar-kandidat-navn">
                  {e.navn} <span className="vikar-kandidat-butikk">({e.butikk})</span>
                </span>
                {sendt[key] ? (
                  <span className="vikar-sendt">Forespørsel sendt ✓</span>
                ) : (
                  <button className="btn btn-accent" onClick={() => sendForesporsel(key)} disabled={sender === key}>
                    {sender === key ? 'Sender…' : 'Spør om vikar'}
                  </button>
                )}
                <button className="turnus-slett" onClick={() => fjernEkstern(e.id)} aria-label="Fjern">
                  🗑️
                </button>
              </div>
            );
          })}
          <div className="turnus-add-row vikar-add-row">
            <input placeholder="Navn" value={nyttNavn} onChange={(e) => setNyttNavn(e.target.value)} />
            <input placeholder="Butikk (f.eks. Bunnpris Sentrum)" value={nyButikk} onChange={(e) => setNyButikk(e.target.value)} />
            <button className="btn" onClick={leggTilEkstern} disabled={!nyttNavn.trim()}>
              Legg til
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
