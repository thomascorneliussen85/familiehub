import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import BookingModal from './BookingModal';
import './TelemedicinePanel.css';

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('nb-NO', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TelemedicinePanel() {
  const [bookings, setBookings] = useState([]);
  const [showBooking, setShowBooking] = useState(false);

  function load() {
    api.get('/telemedicine/bookings').then(setBookings).catch(() => {});
  }

  useEffect(() => {
    load();
    socket.on('telemedicine:update', load);
    return () => socket.off('telemedicine:update', load);
  }, []);

  async function cancel(id) {
    await api.delete(`/telemedicine/bookings/${id}`).catch(() => {});
  }

  return (
    <section className="panel panel-telemedicine">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🩺</span> DoktorNå
        </div>
        <button className="btn btn-icon" onClick={() => setShowBooking(true)} aria-label="Book time">
          +
        </button>
      </div>
      <div className="panel-body telemedicine-body">
        <div className="telemedicine-demo-hint">
          Demo-tjeneste – DoktorNå er et fiktivt eksempelfirma, ikke en reell legetjeneste.
        </div>
        {bookings.length === 0 && <div className="empty-hint">Ingen bookede timer. Trykk + for å booke.</div>}
        <ul className="telemedicine-list">
          {bookings.map((b) => (
            <li key={b.id} className="telemedicine-booking">
              <span className="telemedicine-booking-icon">{b.doctor_avatar}</span>
              <div className="telemedicine-booking-info">
                <div className="telemedicine-booking-doctor">
                  {b.doctor_name} · {b.doctor_specialty}
                </div>
                <div className="telemedicine-booking-meta">
                  {formatDateTime(b.start_at)}
                  {b.member_name ? ` · ${b.member_name}` : ''}
                </div>
                {b.reason && <div className="telemedicine-booking-reason">{b.reason}</div>}
              </div>
              <button className="btn btn-icon" onClick={() => cancel(b.id)} aria-label="Avbestill">
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>
      {showBooking && <BookingModal onClose={() => setShowBooking(false)} />}
    </section>
  );
}
