import { db } from '../db/index.js';

const SLOT_MINUTES = 30;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 16;
const LOOKAHEAD_DAYS = 14;

export function listDoctors() {
  return db.prepare('SELECT * FROM telemedicine_doctors ORDER BY sort_order, id').all();
}

export function listBookings() {
  return db
    .prepare(
      `SELECT b.*, d.name AS doctor_name, d.specialty AS doctor_specialty, d.avatar AS doctor_avatar,
              m.name AS member_name, m.color AS member_color, m.avatar AS member_avatar
       FROM telemedicine_bookings b
       JOIN telemedicine_doctors d ON d.id = b.doctor_id
       LEFT JOIN family_members m ON m.id = b.member_id
       WHERE b.status = 'booked'
       ORDER BY b.start_at`
    )
    .all();
}

// Genererer ledige timer på virkedager kl. 08–16 (30 min per time) de neste
// LOOKAHEAD_DAYS dagene, minus allerede bookede timer hos legen. Ingen ekte
// legetjeneste finnes bak dette – DoktorNå er en fiktiv demo.
export function getAvailableSlots(doctorId) {
  const booked = new Set(
    db
      .prepare(`SELECT start_at FROM telemedicine_bookings WHERE doctor_id = ? AND status = 'booked'`)
      .all(doctorId)
      .map((r) => r.start_at)
  );

  const slots = [];
  const now = new Date();
  for (let dayOffset = 0; dayOffset < LOOKAHEAD_DAYS; dayOffset += 1) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    day.setHours(0, 0, 0, 0);
    const weekday = day.getDay(); // 0=søn, 6=lør
    if (weekday === 0 || weekday === 6) continue;

    for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour += 1) {
      for (let min = 0; min < 60; min += SLOT_MINUTES) {
        const start = new Date(day);
        start.setHours(hour, min, 0, 0);
        if (start <= now) continue;
        const startIso = start.toISOString();
        if (booked.has(startIso)) continue;
        const end = new Date(start);
        end.setMinutes(end.getMinutes() + SLOT_MINUTES);
        slots.push({ start_at: startIso, end_at: end.toISOString() });
      }
    }
  }
  return slots;
}

export function createBooking({ member_id, doctor_id, start_at, reason }) {
  const doctor = db.prepare('SELECT * FROM telemedicine_doctors WHERE id = ?').get(doctor_id);
  if (!doctor) throw new Error('Fant ikke legen');

  const conflict = db
    .prepare(`SELECT 1 FROM telemedicine_bookings WHERE doctor_id = ? AND start_at = ? AND status = 'booked'`)
    .get(doctor_id, start_at);
  if (conflict) throw new Error('Denne timen er dessverre allerede booket');

  const start = new Date(start_at);
  if (Number.isNaN(start.getTime()) || start <= new Date()) {
    throw new Error('Ugyldig eller passert tidspunkt');
  }
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + SLOT_MINUTES);

  const member = member_id ? db.prepare('SELECT * FROM family_members WHERE id = ?').get(member_id) : null;

  const insertBooking = db.transaction(() => {
    const calendarInfo = db
      .prepare(
        `INSERT INTO calendar_events (member_id, title, start_at, end_at, all_day, location, notes, source, recurrence)
         VALUES (?, ?, ?, ?, 0, ?, ?, 'local', 'once')`
      )
      .run(
        member_id || null,
        `🩺 DoktorNå: ${doctor.name} (${doctor.specialty})`,
        start.toISOString(),
        end.toISOString(),
        'Videosamtale (DoktorNå – demo-tjeneste)',
        reason || null
      );

    const bookingInfo = db
      .prepare(
        `INSERT INTO telemedicine_bookings (member_id, doctor_id, start_at, end_at, reason, calendar_event_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(member_id || null, doctor_id, start.toISOString(), end.toISOString(), reason || null, calendarInfo.lastInsertRowid);

    return bookingInfo.lastInsertRowid;
  });

  const bookingId = insertBooking();
  return {
    ...db.prepare('SELECT * FROM telemedicine_bookings WHERE id = ?').get(bookingId),
    doctor_name: doctor.name,
    doctor_specialty: doctor.specialty,
    doctor_avatar: doctor.avatar,
    member_name: member?.name || null,
    member_color: member?.color || null,
    member_avatar: member?.avatar || null,
  };
}

export function cancelBooking(id) {
  const booking = db.prepare('SELECT * FROM telemedicine_bookings WHERE id = ?').get(id);
  if (!booking) return;
  db.transaction(() => {
    db.prepare(`UPDATE telemedicine_bookings SET status = 'cancelled' WHERE id = ?`).run(id);
    if (booking.calendar_event_id) {
      db.prepare('DELETE FROM calendar_events WHERE id = ?').run(booking.calendar_event_id);
    }
  })();
}
