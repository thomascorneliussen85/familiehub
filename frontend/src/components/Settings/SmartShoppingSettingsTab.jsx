import { useEffect, useState } from 'react';

// Kuratert liste over de vanligste norske dagligvarekjedene – ikke hele
// Kassalapp sin kjede-liste (som også har bokhandlere osv.), siden dette kun
// gjelder handlelisten.
const CHAINS = [
  'Kiwi',
  'Rema 1000',
  'Coop Extra',
  'Coop Mega',
  'Coop Prix',
  'Coop Obs',
  'Coop Marked',
  'Spar',
  'Joker',
  'Bunnpris',
  'Meny',
  'Europris',
  'Oda',
  'Matkroken',
];

export default function SmartShoppingSettingsTab({ adminApi }) {
  const [settings, setSettings] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/smart-shopping/settings', { credentials: 'include' })
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);

  async function save(patch) {
    setMessage('');
    try {
      const updated = await adminApi.patch('/smart-shopping/settings', patch);
      setSettings(updated);
    } catch (err) {
      setMessage(err.message);
    }
  }

  if (!settings) return null;

  // Tom liste = alle kjeder. Kryssboksene vises som avkrysset når enten
  // listen er tom (alle) eller kjeden eksplisitt er med.
  const isChainChecked = (chain) => settings.enabledChains.length === 0 || settings.enabledChains.includes(chain);

  function toggleChain(chain) {
    const current = settings.enabledChains.length === 0 ? [...CHAINS] : settings.enabledChains;
    const next = current.includes(chain) ? current.filter((c) => c !== chain) : [...current, chain];
    // Hvis alle er krysset av igjen, lagre som tom liste (betyr "alle") i stedet.
    save({ enabledChains: next.length === CHAINS.length ? [] : next });
  }

  return (
    <div className="settings-section">
      <div className="settings-subtitle">Smart handleliste</div>
      <div className="empty-hint">
        Sammenligner handlelisten din mot priser fra Kassalapp og viser hvor det er billigst.
      </div>
      <div className="settings-location-item">
        <span>Skru på prissammenligning</span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => save({ enabled: e.target.checked })}
        />
      </div>

      <div className="settings-subtitle">Radius fra hjemme</div>
      <div className="settings-location-add">
        <input
          type="number"
          min="1"
          max="50"
          value={settings.radiusKm}
          onChange={(e) => setSettings((s) => ({ ...s, radiusKm: Number(e.target.value) }))}
          onBlur={() => save({ radiusKm: settings.radiusKm })}
        />
        <span className="empty-hint">km</span>
      </div>

      <div className="settings-subtitle">Kjeder som sammenlignes</div>
      <div className="settings-locations-list">
        {CHAINS.map((chain) => (
          <label key={chain} className="settings-location-item" style={{ cursor: 'pointer' }}>
            <span>{chain}</span>
            <input type="checkbox" checked={isChainChecked(chain)} onChange={() => toggleChain(chain)} />
          </label>
        ))}
      </div>

      {message && <div className="settings-message">{message}</div>}
    </div>
  );
}
