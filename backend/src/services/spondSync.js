import fetch from 'node-fetch';
import { db } from '../db/index.js';

// Spond har ingen offentlig API – dette er de samme udokumenterte
// endepunktene som brukes internt av Spond-appen, reverse-engineert av
// åpne kildekode-prosjekter (f.eks. github.com/Olen/Spond). Kan slutte å
// fungere uten varsel hvis Spond endrer noe på sin side.
const API_BASE = 'https://api.spond.com/core/v1/';
const SYNC_DAYS_BACK = 7;
const SYNC_DAYS_AHEAD = 90;

// Spond svarer ofte 200 OK selv ved feil innlogging, med feilen i selve
// JSON-kroppen i stedet for HTTP-statusen (bekreftet mot Olen/Spond, som
// alltid parser body-en før den sjekker om et token faktisk kom med) – å
// bare sjekke res.ok slik denne funksjonen gjorde før, ga alltid samme
// "feil e-post eller passord"-melding uansett faktisk årsak. Spond-kontoer
// med 2FA/to-trinns-verifisering slår uansett aldri gjennom her ennå, siden
// dette uoffisielle API-et ikke støtter TOTP-steget – dukker typisk opp som
// en errorKey som nevner verifisering/kode i stedet for feil passord.
async function login(email, password) {
  const res = await fetch(`${API_BASE}auth2/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => null);
  const token = data?.accessToken?.token;
  if (token) return token;
  const detail = data?.errorKey || data?.error || data?.message;
  if (detail) {
    throw new Error(`Spond avviste innloggingen: ${detail}`);
  }
  throw new Error(
    res.ok
      ? 'Fikk ikke pålogging fra Spond (uventet svar)'
      : `Spond avviste innloggingen (status ${res.status})`
  );
}

function authHeaders(token) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${token}` };
}

async function fetchGroups(token) {
  const res = await fetch(`${API_BASE}groups/`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error('Klarte ikke å hente Spond-grupper');
  return res.json();
}

async function fetchEvents(token, groupId, minStart, maxStart) {
  const params = new URLSearchParams({
    max: '100',
    scheduled: 'true',
    groupId,
    minStartTimestamp: minStart.toISOString(),
    maxStartTimestamp: maxStart.toISOString(),
  });
  const res = await fetch(`${API_BASE}sponds/?${params}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error('Klarte ikke å hente avtaler fra Spond');
  return res.json();
}

// Validerer innlogging ved tilkobling (samme mønster som
// testICloudConnection) – kaster en norsk feilmelding brukeren faktisk
// forstår i stedet for en rå HTTP-feil.
export async function testSpondConnection(email, password) {
  const token = await login(email, password);
  const groups = await fetchGroups(token);
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error('Fant ingen grupper på denne Spond-kontoen');
  }
  return groups.length;
}

function locationText(location) {
  if (!location) return null;
  const parts = [location.feature, location.address].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export async function syncSpondConnection(connection) {
  const { email, password } = JSON.parse(connection.credentials);
  const token = await login(email, password);
  const groups = await fetchGroups(token);

  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - SYNC_DAYS_BACK);
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + SYNC_DAYS_AHEAD);

  const allEvents = [];
  for (const group of groups) {
    const events = await fetchEvents(token, group.id, timeMin, timeMax);
    for (const e of events) {
      if (e.cancelled) continue;
      allEvents.push({
        id: e.id,
        title: e.heading || group.name || '(uten tittel)',
        start: new Date(e.startTimestamp),
        end: new Date(e.endTimestamp || e.startTimestamp),
        location: locationText(e.location),
        notes: e.description || null,
      });
    }
  }

  const clear = db.prepare(`DELETE FROM calendar_events WHERE connection_id = ? AND start_at >= ? AND start_at <= ?`);
  const insert = db.prepare(
    `INSERT INTO calendar_events (family_id, member_id, title, start_at, end_at, all_day, location, notes, source, external_id, connection_id)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'spond', ?, ?)`
  );

  const importTx = db.transaction(() => {
    clear.run(connection.id, timeMin.toISOString(), timeMax.toISOString());
    for (const e of allEvents) {
      insert.run(
        connection.family_id,
        connection.member_id,
        e.title,
        e.start.toISOString(),
        e.end.toISOString(),
        e.location,
        e.notes,
        e.id,
        connection.id
      );
    }
  });
  importTx();

  db.prepare(`UPDATE calendar_connections SET last_synced_at = datetime('now') WHERE id = ?`).run(connection.id);
  return allEvents.length;
}
