import { useState } from 'react';
import { api } from '../lib/api';

const PIN_LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'tøm', '0', '⌫'];

// Ber om butikksjef-PIN og returnerer den (som en gyldig withPin()-nøkkel)
// via onSuccess – gjenbrukt av alle admin-handlinger (ansatte, turnusliste,
// oppgavemaler, temperaturenheter). Samme mønster som FamilieHub sin
// foreldre-PIN-modal.
export default function PinModal({ onSuccess, onClose }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  async function submit(candidate) {
    const res = await api.post('/auth/verify-pin', { pin: candidate }).catch(() => ({ ok: false }));
    if (res.ok) {
      onSuccess(candidate);
    } else {
      setError(true);
      setTimeout(() => {
        setPin('');
        setError(false);
      }, 500);
    }
  }

  function pressKey(key) {
    if (key === 'tøm') return setPin('');
    if (key === '⌫') return setPin((p) => p.slice(0, -1));
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + key;
    setPin(next);
    if (next.length === PIN_LENGTH) submit(next);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>
        <h2>Butikksjef-PIN</h2>
        <div className={`pin-dots ${error ? 'error-text' : ''}`}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span key={i} className={`pin-dot ${i < pin.length ? 'pin-dot-filled' : ''}`} />
          ))}
        </div>
        <div className="pin-keypad">
          {KEYS.map((k) => (
            <button key={k} onClick={() => pressKey(k)}>
              {k}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
