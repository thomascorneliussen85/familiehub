import { DateTime } from 'luxon';

export const FAMILY_ZONE = 'Europe/Oslo';
export const familyDate = (offset = 0) => DateTime.now().setZone(FAMILY_ZONE).plus({ days: offset }).toISODate();

// Calendar arithmetic preserves the wall clock across summer/winter time.
export function expandWeeklyOccurrences(events, fromIso, toIso) {
  const from = DateTime.fromISO(fromIso);
  const to = DateTime.fromISO(toIso);
  if (!from.isValid || !to.isValid || to <= from) return [];
  const result = [];
  for (const event of events) {
    const zone = event.time_zone || FAMILY_ZONE;
    const start = DateTime.fromISO(event.start_at, { zone });
    const end = DateTime.fromISO(event.end_at, { zone });
    if (!start.isValid || !end.isValid || end <= start) continue;
    const firstWeek = Math.max(0, Math.floor(from.diff(end, 'days').days / 7) - 1);
    for (let week = firstWeek; ; week += 1) {
      const occurrence = start.plus({ weeks: week });
      if (occurrence >= to) break;
      const occurrenceEnd = end.plus({ weeks: week });
      if (occurrenceEnd > from) result.push({ ...event, original_start_at: event.start_at, original_end_at: event.end_at, start_at: occurrence.toUTC().toISO(), end_at: occurrenceEnd.toUTC().toISO() });
    }
  }
  return result;
}
