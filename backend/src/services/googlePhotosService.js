import fs from 'node:fs';
import path from 'node:path';
import fetch from 'node-fetch';
import { google } from 'googleapis';
import { config } from '../config.js';

// Google fjernet i 2025 muligheten til å lese eksisterende album/mapper
// løpende fra tredjepartsapper – det som er igjen er "Picker"-flyten: en
// interaktiv engangs-økt der brukeren velger bilder i Googles eget UI, og vi
// laster ned de valgte bildene i løpet av det 60 minutter lange vinduet
// øktens baseUrl-er er gyldige. Det finnes derfor ingen "koble til og hold
// synkronisert"-modus – kun "plukk bilder nå".
const PICKER_API = 'https://photospicker.googleapis.com/v1';

// { accessToken, sessionId, pickerUri } per familie – kartlagt på familyId
// slik at to familier som plukker bilder samtidig på samme installasjon ikke
// overskriver hverandres økt.
const activeSessions = new Map();

function createOAuthClient() {
  return new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, config.google.photosRedirectUri);
}

export function getPhotosAuthUrl() {
  const oauth2Client = createOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'online',
    scope: ['https://www.googleapis.com/auth/photospicker.mediaitems.readonly'],
  });
}

export async function handlePhotosCallback(familyId, code) {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.access_token) throw new Error('Fikk ingen tilgangsnøkkel fra Google');

  const res = await fetch(`${PICKER_API}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`Klarte ikke å starte Google Photos-økt (status ${res.status})`);
  const session = await res.json();

  const activeSession = { accessToken: tokens.access_token, sessionId: session.id, pickerUri: session.pickerUri };
  activeSessions.set(familyId, activeSession);
  return activeSession;
}

export async function getSessionStatus(familyId) {
  const activeSession = activeSessions.get(familyId);
  if (!activeSession) return { active: false, mediaItemsSet: false };
  const res = await fetch(`${PICKER_API}/sessions/${activeSession.sessionId}`, {
    headers: { Authorization: `Bearer ${activeSession.accessToken}` },
  });
  if (!res.ok) {
    activeSessions.delete(familyId);
    throw new Error(`Klarte ikke å sjekke status på Google Photos-økten (status ${res.status})`);
  }
  const session = await res.json();
  return { active: true, mediaItemsSet: !!session.mediaItemsSet };
}

async function listPickedItems(sessionId, accessToken) {
  const items = [];
  let pageToken = '';
  do {
    const url = new URL(`${PICKER_API}/mediaItems`);
    url.searchParams.set('sessionId', sessionId);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Klarte ikke å hente valgte bilder (status ${res.status})`);
    const data = await res.json();
    items.push(...(data.mediaItems || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return items;
}

export async function importPickedPhotos(familyId) {
  const activeSession = activeSessions.get(familyId);
  if (!activeSession) throw new Error('Ingen aktiv Google Photos-økt – trykk «Koble til Google Photos» først');
  const { accessToken, sessionId } = activeSession;

  const items = await listPickedItems(sessionId, accessToken);
  const dir = path.join(config.photos.dir, String(familyId));
  fs.mkdirSync(dir, { recursive: true });

  let imported = 0;
  for (const item of items) {
    const file = item.mediaFile;
    if (!file?.baseUrl || item.type !== 'PHOTO') continue;
    try {
      const imgRes = await fetch(`${file.baseUrl}=w2048-h2048`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!imgRes.ok) continue;
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const ext = (file.mimeType?.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      fs.writeFileSync(path.join(dir, `google-${item.id}.${ext}`), buffer);
      imported += 1;
    } catch {
      // hopp over enkeltbilder som feiler, resten av importen fortsetter
    }
  }

  await fetch(`${PICKER_API}/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => {});
  activeSessions.delete(familyId);

  return imported;
}
