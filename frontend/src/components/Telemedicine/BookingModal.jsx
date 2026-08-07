import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useFamilyMembers } from '../../context/FamilyMembersContext';
import './BookingModal.css';

function groupSlotsByDay(slots) {
  const groups = new Map();
  for (const slot of slots) {
    const d = new Date(slot.start_at);
    const key = d.toISOString().slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(slot);
  }
  return [...groups.entries()];
}

function formatDayLabel(dateKey) {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString('nb-NO', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
}

export default function BookingModal({ onClose }) {
  const { members } = useFamilyMembers();
  const [doctors, setDoctors] = useState([]);
  const [memberId, setMemberId] = useState(null);
  const [doctorId, setDoctorId] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/telemedicine/doctors').then(setDoctors).catch(() => {});
  }, []);

  useEffect(() => {
    if (!doctorId) return;
    setSelectedSlot(null);
    setSlotsLoading(true);
    api
      .get(`/telemedicine/slots?doctorId=${doctorId}`)
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [doctorId]);

  async function handleConfirm() {
    if (!doctorId || !selectedSlot) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post('/telemedicine/bookings', {
        member_id: memberId,
        doctor_id: doctorId,
        start_at: selectedSlot.start_at,
        reason: reason.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const dayGroups = groupSlotsByDay(slots).slice(0, 6);

  return (
    <div className="booking-overlay" onClick={onClose}>
      <div className="booking-modal" onClick={(e) => e.stopPropagation()}>
        <button className="booking-close" onClick={onClose} aria-label="Lukk">
          ✕
        </button>
        <div className="booking-title">🩺 Book time hos DoktorNå</div>
        <div className="booking-demo-hint">Demo-tjeneste – DoktorNå er et fiktivt eksempelfirma.</div>

        <div className="booking-section">
          <div className="booking-section-label">Hvem gjelder timen?</div>
          <div className="booking-chip-row">
            {members.map((m) => (
              <button
                key={m.id}
                className={`booking-chip ${memberId === m.id ? 'booking-chip-active' : ''}`}
                onClick={() => setMemberId(m.id)}
              >
                {m.avatar} {m.name}
              </button>
            ))}
          </div>
        </div>

        <div className="booking-section">
          <div className="booking-section-label">Velg lege</div>
          <div className="booking-chip-row">
            {doctors.map((d) => (
              <button
                key={d.id}
                className={`booking-chip ${doctorId === d.id ? 'booking-chip-active' : ''}`}
                onClick={() => setDoctorId(d.id)}
              >
                {d.avatar} {d.name} · {d.specialty}
              </button>
            ))}
          </div>
        </div>

        {doctorId && (
          <div className="booking-section">
            <div className="booking-section-label">Velg tidspunkt</div>
            {slotsLoading && <div className="booking-loading">Henter ledige timer…</div>}
            {!slotsLoading && dayGroups.length === 0 && (
              <div className="booking-loading">Ingen ledige timer funnet.</div>
            )}
            <div className="booking-days">
              {dayGroups.map(([dayKey, daySlots]) => (
                <div key={dayKey} className="booking-day">
                  <div className="booking-day-label">{formatDayLabel(dayKey)}</div>
                  <div className="booking-slot-row">
                    {daySlots.map((slot) => (
                      <button
                        key={slot.start_at}
                        className={`booking-slot ${selectedSlot?.start_at === slot.start_at ? 'booking-slot-active' : ''}`}
                        onClick={() => setSelectedSlot(slot)}
                      >
                        {formatTime(slot.start_at)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedSlot && (
          <div className="booking-section">
            <div className="booking-section-label">Hva gjelder det? (valgfritt)</div>
            <textarea
              className="booking-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="F.eks. vondt i halsen, hoste…"
              rows={2}
            />
          </div>
        )}

        {error && <div className="booking-error">{error}</div>}

        <button
          className="btn btn-accent"
          onClick={handleConfirm}
          disabled={!doctorId || !selectedSlot || submitting}
        >
          {submitting ? 'Booker…' : 'Bekreft booking'}
        </button>
      </div>
    </div>
  );
}
