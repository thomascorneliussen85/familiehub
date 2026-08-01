import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import { useFamilyMembers } from '../../context/FamilyMembersContext';
import './PlayOutsidePanel.css';

const ACTIVITY_EMOJIS = ['⚽', '🚲', '🛝', '⛄'];

function timeAgo(dateStr) {
  const iso = dateStr.includes('T') ? dateStr : `${dateStr.replace(' ', 'T')}Z`;
  const then = new Date(iso);
  const diffMin = Math.round((Date.now() - then.getTime()) / 60000);
  if (diffMin < 1) return 'akkurat nå';
  if (diffMin < 60) return `for ${diffMin} min siden`;
  return `for ${Math.round(diffMin / 60)} t siden`;
}

export default function PlayOutsidePanel() {
  const { members } = useFamilyMembers();
  const children = members.filter((m) => m.role === 'barn');

  const [own, setOwn] = useState([]);
  const [friends, setFriends] = useState([]);
  const [locations, setLocations] = useState([]);
  const [pickerChild, setPickerChild] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('');

  useEffect(() => {
    api.get('/play-status').then((data) => {
      setOwn(data.own);
      setFriends(data.friends);
    }).catch(() => {});
    api.get('/play-locations').then(setLocations).catch(() => {});

    function onUpdate(data) {
      setOwn(data.own);
      setFriends(data.friends);
    }
    socket.on('play-status:update', onUpdate);
    return () => socket.off('play-status:update', onUpdate);
  }, []);

  function openPicker(child) {
    setPickerChild(child);
    setSelectedLocation('');
    setSelectedEmoji('');
  }

  function closePicker() {
    setPickerChild(null);
  }

  async function confirmStart() {
    if (!pickerChild || !selectedLocation) return;
    await api
      .post('/play-status', { childId: pickerChild.id, location: selectedLocation, emoji: selectedEmoji })
      .catch(() => {});
    closePicker();
  }

  async function endStatus(id) {
    await api.post(`/play-status/${id}/end`).catch(() => {});
  }

  return (
    <section className="panel panel-play-outside">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🛝</span> Ut og leke
        </div>
      </div>
      <div className="panel-body play-body">
        {pickerChild && (
          <div className="play-picker">
            <div className="play-picker-title">
              {pickerChild.avatar} {pickerChild.name} er ute og leker hvor?
            </div>
            <div className="play-picker-locations">
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  className={`play-picker-location ${
                    selectedLocation === loc.label ? 'play-picker-location-active' : ''
                  }`}
                  onClick={() => setSelectedLocation(loc.label)}
                >
                  <span className="play-picker-location-emoji">{loc.emoji}</span>
                  <span>{loc.label}</span>
                </button>
              ))}
            </div>
            <div className="play-picker-title">Hva skal de gjøre? (valgfritt)</div>
            <div className="play-picker-emojis">
              {ACTIVITY_EMOJIS.map((e) => (
                <button
                  key={e}
                  className={`play-picker-emoji ${selectedEmoji === e ? 'play-picker-emoji-active' : ''}`}
                  onClick={() => setSelectedEmoji((prev) => (prev === e ? '' : e))}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="play-picker-actions">
              <button className="btn" onClick={closePicker}>
                Avbryt
              </button>
              <button className="btn btn-accent" disabled={!selectedLocation} onClick={confirmStart}>
                Ut og leke! 🎉
              </button>
            </div>
          </div>
        )}

        {!pickerChild && (
          <>
            {children.length === 0 && (
              <div className="empty-hint">Ingen barn er registrert i familien ennå.</div>
            )}
            <div className="play-children-grid">
              {children.map((child) => {
                const status = own.find((s) => s.child_id === child.id);
                if (status) {
                  return (
                    <div key={child.id} className="play-status-card" style={{ borderColor: child.color }}>
                      <div className="play-status-emoji">{status.emoji || '🏃'}</div>
                      <div className="play-status-info">
                        <div className="play-status-name">
                          {child.avatar} {child.name} er ute og leker
                        </div>
                        <div className="play-status-location">
                          {status.location} · {timeAgo(status.started_at)}
                        </div>
                      </div>
                      <button className="btn play-status-end" onClick={() => endStatus(status.id)}>
                        Inne igjen
                      </button>
                    </div>
                  );
                }
                return (
                  <button
                    key={child.id}
                    className="play-child-btn"
                    style={{ background: child.color }}
                    onClick={() => openPicker(child)}
                  >
                    <span className="play-child-avatar">{child.avatar}</span>
                    <span className="play-child-name">{child.name}</span>
                    <span className="play-child-cta">Ut og leke!</span>
                  </button>
                );
              })}
            </div>

            <div className="play-friends-section">
              <div className="play-friends-title">Ute og leker nå (venner)</div>
              {friends.length === 0 && (
                <div className="empty-hint">Ingen vennefamilier ute og leker akkurat nå.</div>
              )}
              <ul className="play-friends-list">
                {friends.map((f) => (
                  <li key={f.id} className="play-friend-item">
                    <span className="play-friend-emoji">{f.emoji || '🏃'}</span>
                    <div className="play-friend-info">
                      <div className="play-friend-name">
                        {f.childName} <span className="play-friend-family">({f.familyName})</span>
                      </div>
                      <div className="play-friend-meta">
                        {f.location} · {timeAgo(f.startedAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
