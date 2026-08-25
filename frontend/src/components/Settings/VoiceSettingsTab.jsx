import { useEffect, useState } from 'react';

export default function VoiceSettingsTab({ adminApi }) {
  const [configured, setConfigured] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [voices, setVoices] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingVoices, setLoadingVoices] = useState(false);

  function load() {
    adminApi
      .get('/voice/config')
      .then((cfg) => {
        setConfigured(cfg.configured);
        setVoiceId(cfg.voiceId || '');
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  function loadVoices() {
    setLoadingVoices(true);
    setError('');
    adminApi
      .get('/voice/voices')
      .then(setVoices)
      .catch((err) => setError(err.message))
      .finally(() => setLoadingVoices(false));
  }

  async function saveKey() {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError('');
    try {
      await adminApi.patch('/voice/config', { apiKey: apiKey.trim() });
      setApiKey('');
      load();
      loadVoices();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveVoice(id) {
    setVoiceId(id);
    try {
      await adminApi.patch('/voice/config', { voiceId: id });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-subtitle">Stemme (ElevenLabs)</div>
      <div className="empty-hint">
        Gir taleassistenten en naturlig stemme i stedet for nettleserens robotaktige innebygde tale. Krever en gratis
        eller betalt konto på elevenlabs.io – hent API-nøkkelen din under «Profile» der. Uten dette faller
        assistenten automatisk tilbake til nettleserens tale.
      </div>
      <div className="settings-location-item">
        <span>{configured ? '🟢 ElevenLabs-nøkkel lagret' : '⚪ Ingen nøkkel lagret ennå'}</span>
      </div>
      <div className="settings-location-add">
        <input
          type="password"
          placeholder="ElevenLabs API-nøkkel"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <button className="btn btn-accent" onClick={saveKey} disabled={saving || !apiKey.trim()}>
          {saving ? 'Lagrer…' : 'Lagre nøkkel'}
        </button>
      </div>

      {configured && (
        <>
          <div className="settings-subtitle">Velg stemme</div>
          {voices.length === 0 ? (
            <button className="btn" onClick={loadVoices} disabled={loadingVoices}>
              {loadingVoices ? 'Henter stemmer…' : 'Hent tilgjengelige stemmer'}
            </button>
          ) : (
            <select value={voiceId} onChange={(e) => saveVoice(e.target.value)}>
              <option value="">Velg en stemme…</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
        </>
      )}

      {error && <div className="settings-message">{error}</div>}
    </div>
  );
}
