import { useState } from 'react';
import { createAdminApi } from '../../lib/adminApi';
import FriendsTab from './FriendsTab';
import PlaySettingsTab from './PlaySettingsTab';
import DevicesTab from './DevicesTab';
import CalendarConnectionsTab from './CalendarConnectionsTab';
import FamilyMembersTab from './FamilyMembersTab';
import BriefSettingsTab from './BriefSettingsTab';
import './SettingsModal.css';

const PIN_LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'tøm', '0', '⌫'];

export default function SettingsModal({ onClose }) {
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [adminApi, setAdminApi] = useState(null);
  const [tab, setTab] = useState('family');

  async function submitPin(candidate) {
    const res = await fetch('/api/relay/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: candidate }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false }));

    if (res.ok) {
      setAdminApi(() => createAdminApi(candidate));
    } else {
      setPinError(true);
      setTimeout(() => {
        setPin('');
        setPinError(false);
      }, 500);
    }
  }

  function pressKey(key) {
    if (key === 'tøm') return setPin('');
    if (key === '⌫') return setPin((p) => p.slice(0, -1));
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + key;
    setPin(next);
    if (next.length === PIN_LENGTH) submitPin(next);
  }

  if (!adminApi) {
    return (
      <div className="settings-overlay">
        <div className="settings-modal settings-pin-modal">
          <button className="settings-close" onClick={onClose} aria-label="Lukk">
            ✕
          </button>
          <div className="settings-pin-title">Skriv inn foreldre-PIN</div>
          <div className={`settings-pin-dots ${pinError ? 'settings-pin-error' : ''}`}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <span key={i} className={`settings-pin-dot ${i < pin.length ? 'settings-pin-dot-filled' : ''}`} />
            ))}
          </div>
          <div className="settings-pin-keypad">
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

  return (
    <div className="settings-overlay">
      <div className="settings-modal">
        <button className="settings-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>
        <div className="settings-tabs">
          <button
            className={`settings-tab ${tab === 'family' ? 'settings-tab-active' : ''}`}
            onClick={() => setTab('family')}
          >
            Familie
          </button>
          <button
            className={`settings-tab ${tab === 'friends' ? 'settings-tab-active' : ''}`}
            onClick={() => setTab('friends')}
          >
            Vennefamilier
          </button>
          <button
            className={`settings-tab ${tab === 'settings' ? 'settings-tab-active' : ''}`}
            onClick={() => setTab('settings')}
          >
            Ut og leke-innstillinger
          </button>
          <button
            className={`settings-tab ${tab === 'devices' ? 'settings-tab-active' : ''}`}
            onClick={() => setTab('devices')}
          >
            Enheter
          </button>
          <button
            className={`settings-tab ${tab === 'calendars' ? 'settings-tab-active' : ''}`}
            onClick={() => setTab('calendars')}
          >
            Kalendere
          </button>
          <button
            className={`settings-tab ${tab === 'brief' ? 'settings-tab-active' : ''}`}
            onClick={() => setTab('brief')}
          >
            Morgenbrief
          </button>
        </div>
        {tab === 'family' && <FamilyMembersTab adminApi={adminApi} />}
        {tab === 'friends' && <FriendsTab adminApi={adminApi} />}
        {tab === 'settings' && <PlaySettingsTab adminApi={adminApi} />}
        {tab === 'devices' && <DevicesTab adminApi={adminApi} />}
        {tab === 'calendars' && <CalendarConnectionsTab adminApi={adminApi} />}
        {tab === 'brief' && <BriefSettingsTab adminApi={adminApi} />}
      </div>
    </div>
  );
}
