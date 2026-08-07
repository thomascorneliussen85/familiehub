import { useEffect, useState } from 'react';
import { useFamilyMembers } from '../../context/FamilyMembersContext';

const ADULT_MODULES = [
  ['module_calendar', '📅 Kalender'],
  ['module_weather', '🌦️ Vær og buss'],
  ['module_power', '⚡ Strømpris'],
  ['module_chores', '✅ Gjøremål'],
  ['module_news', '📰 Nyheter'],
  ['module_market', '📈 Marked'],
  ['module_verse', '📖 Dagens vers'],
  ['module_quote', '💬 Dagens sitat'],
];

const CHILD_MODULES = [
  ['module_calendar', '📅 Kalender'],
  ['module_weather', '🌦️ Vær og buss'],
  ['module_chores', '✅ Gjøremål'],
  ['module_fact', '🎉 Morsom fakta'],
];

export default function BriefSettingsTab({ adminApi }) {
  const { members } = useFamilyMembers();
  const [activeId, setActiveId] = useState(null);
  const [settings, setSettings] = useState(null);
  const [tickersText, setTickersText] = useState('');
  const [rssText, setRssText] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!activeId && members.length > 0) setActiveId(members[0].id);
  }, [members, activeId]);

  useEffect(() => {
    if (activeId == null) return;
    setSaved(false);
    adminApi.get(`/brief/settings/${activeId}`).then((s) => {
      setSettings(s);
      setTickersText((JSON.parse(s.tickers || '[]')).join(', '));
      setRssText((JSON.parse(s.rss_feed_urls || '[]')).join(', '));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const activeMember = members.find((m) => m.id === activeId);
  const isChild = activeMember?.role === 'barn';
  const moduleList = isChild ? CHILD_MODULES : ADULT_MODULES;

  function toggle(key) {
    setSettings((s) => ({ ...s, [key]: s[key] ? 0 : 1 }));
    setSaved(false);
  }

  async function save() {
    const tickers = tickersText
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const rss_feed_urls = rssText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = { ...settings, tickers, rss_feed_urls };
    if (isChild) {
      payload.module_news = 0;
      payload.module_market = 0;
    }
    const updated = await adminApi.patch(`/brief/settings/${activeId}`, payload);
    setSettings(updated);
    setSaved(true);
  }

  return (
    <div className="settings-section">
      <div className="settings-subtitle">Morgenbrief</div>
      <div className="settings-locations-list" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {members.map((m) => (
          <button
            key={m.id}
            className="btn"
            style={
              m.id === activeId
                ? { background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700 }
                : undefined
            }
            onClick={() => setActiveId(m.id)}
          >
            {m.avatar} {m.name}
          </button>
        ))}
      </div>

      {settings && activeMember && (
        <>
          <div className="settings-locations-list">
            {moduleList.map(([key, label]) => (
              <label key={key} className="settings-location-item" style={{ cursor: 'pointer' }}>
                <span>{label}</span>
                <input type="checkbox" checked={Boolean(settings[key])} onChange={() => toggle(key)} />
              </label>
            ))}
          </div>

          {!isChild && Boolean(settings.module_market) && (
            <div>
              <div className="settings-subtitle" style={{ fontSize: 13, marginTop: 4 }}>
                Tickerliste (kommaseparert, f.eks. EQNR.OL, DNB.OL, ^GSPC, TSLA)
              </div>
              <input
                type="text"
                value={tickersText}
                onChange={(e) => {
                  setTickersText(e.target.value);
                  setSaved(false);
                }}
                style={{ width: '100%' }}
              />
            </div>
          )}

          {!isChild && Boolean(settings.module_news) && (
            <div>
              <div className="settings-subtitle" style={{ fontSize: 13, marginTop: 4 }}>
                RSS-strømmer (kommaseparert, tom = NRK toppsaker)
              </div>
              <input
                type="text"
                value={rssText}
                onChange={(e) => {
                  setRssText(e.target.value);
                  setSaved(false);
                }}
                style={{ width: '100%' }}
              />
            </div>
          )}

          <div>
            <div className="settings-subtitle" style={{ fontSize: 13, marginTop: 4 }}>
              Foretrukket tidspunkt
            </div>
            <input
              type="time"
              value={settings.preferred_time}
              onChange={(e) => {
                setSettings((s) => ({ ...s, preferred_time: e.target.value }));
                setSaved(false);
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-accent" onClick={save}>
              Lagre
            </button>
            {saved && <span className="settings-saved-msg">✓ Lagret</span>}
          </div>
        </>
      )}
    </div>
  );
}
