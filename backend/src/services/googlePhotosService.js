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

let activeSession = null; // { accessToken, sessionId, pickerUri } – kun én økt om gangen

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

export async function handlePhotosCallback(code) {
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

  activeSession = { accessToken: tokens.access_token, sessionId: session.id, pickerUri: session.pickerUri };
  return activeSession;
}

export async function getSessionStatus() {
  if (!activeSession) return { active: false, mediaItemsSet: false };
  const res = await fetch(`${PICKER_API}/sessions/${activeSession.sessionId}`, {
    headers: { Authorization: `Bearer ${activeSession.accessToken}` },
  });
  if (!res.ok) {
    activeSession = null;
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

export async function importPickedPhotos() {
  if (!activeSession) throw new Error('Ingen aktiv Google Photos-økt – trykk «Koble til Google Photos» først');
  const { accessToken, sessionId } = activeSession;

  const items = await listPickedItems(sessionId, accessToken);
  fs.mkdirSync(config.photos.dir, { recursive: true });

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
      fs.writeFileSync(path.join(config.photos.dir, `google-${item.id}.${ext}`), buffer);
      imported += 1;
    } catch {
      // hopp over enkeltbilder som feiler, resten av importen fortsetter
    }
  }

  await fetch(`${PICKER_API}/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => {});
  activeSession = null;

  return imported;
}
