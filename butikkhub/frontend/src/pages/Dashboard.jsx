import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAnsatt } from '../context/AnsattContext';
import PinModal from '../components/PinModal';
import AnsatteModal from '../components/AnsatteModal';
import TurnusPanel from '../components/TurnusPanel';
import OppgaverPanel from '../components/OppgaverPanel';
import BeskjedPanel from '../components/BeskjedPanel';
import TemperaturPanel from '../components/TemperaturPanel';
import KalenderPanel from '../components/KalenderPanel';
import BestillingPanel from '../components/BestillingPanel';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { ansatte, aktivId, velgAnsatt } = useAnsatt();
  const [showPin, setShowPin] = useState(false);
  const [ansattePin, setAnsattePin] = useState(null);

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-title">
          <img src="/bunnpris-logo.png" alt="Bunnpris" className="shell-logo" />
          <span className="shell-title-store">{user?.butikknavn}</span>
        </div>
        <div className="ansatt-picker">
          {ansatte.map((a) => (
            <button
              key={a.id}
              className={`ansatt-chip ${aktivId === a.id ? 'active' : ''}`}
              onClick={() => velgAnsatt(aktivId === a.id ? null : a.id)}
            >
              <span className="ansatt-chip-avatar" style={{ background: a.farge }}>
                {a.navn[0]}
              </span>
              {a.navn.split(' ')[0]}
            </button>
          ))}
        </div>
        <div className="shell-actions">
          <button className="btn btn-icon" onClick={() => setShowPin(true)} aria-label="Ansatte og innstillinger">
            ⚙️
          </button>
          <button className="btn" onClick={logout}>
            Logg ut
          </button>
        </div>
      </header>

      <div className="dashboard-grid">
        <div className="dashboard-grid-wide">
          <TurnusPanel />
        </div>
        <OppgaverPanel />
        <BeskjedPanel />
        <TemperaturPanel />
        <KalenderPanel />
        <div className="dashboard-grid-wide">
          <BestillingPanel />
        </div>
      </div>

      {showPin && (
        <PinModal
          onSuccess={(pin) => {
            setShowPin(false);
            setAnsattePin(pin);
          }}
          onClose={() => setShowPin(false)}
        />
      )}
      {ansattePin && <AnsatteModal pin={ansattePin} onClose={() => setAnsattePin(null)} />}
    </div>
  );
}
