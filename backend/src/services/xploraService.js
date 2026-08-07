import crypto from 'node:crypto';
import fetch from 'node-fetch';
import { config } from '../config.js';

// Uoffisiell Xplora-API (samme som Xplora-mobilappen bruker) – det finnes
// ingen offentlig/dokumentert API for tredjeparter, så dette er basert på
// reverse-engineering-arbeidet i https://github.com/MiGoller/xplora-api.js
// og https://github.com/Ludy87/pyxplora_api. Endepunkt/nøkler er hentet fra
// selve GraphQL-svaret appen mottar, ikke noe hemmelig FamilieHub eier.
const ENDPOINT = 'https://api.myxplora.com/api';
const OPEN_API_KEY = 'fc45d50304511edbf67a12b93c413b6a';
const OPEN_API_SECRET = '1e9b6fe0327711ed959359c157878dcb';

const LOGIN_MUTATION = `
mutation signInWithEmailOrPhone($countryPhoneNumber: String, $phoneNumber: String, $password: String!, $emailAddress: String, $client: ClientType!, $userLang: String!, $timeZone: String!) {
  signInWithEmailOrPhone(countryPhoneNumber: $countryPhoneNumber, phoneNumber: $phoneNumber, password: $password, emailAddress: $emailAddress, client: $client, userLang: $userLang, timeZone: $timeZone) {
    token
    expireDate
    user {
      id
      children {
        ward { id name }
      }
    }
  }
}`;

const WATCH_LAST_LOCATE_QUERY = `
query WatchLastLocate($uid: String!) {
  watchLastLocate(uid: $uid) {
    tm
    lat
    lng
    battery
    isCharging
    addr
    isInSafeZone
  }
}`;

let session = null; // { accessToken, expireDate, wardId, wardName }

function getRequestHeaders() {
  const headers = {
    Accept: 'application/json; charset=UTF-8',
    'Content-Type': 'application/json; charset=UTF-8',
  };
  let authorizationHeader;
  if (!session?.accessToken) {
    authorizationHeader = `Open ${OPEN_API_KEY}:${OPEN_API_SECRET}`;
  } else {
    headers['H-Date'] = new Date().toUTCString();
    authorizationHeader = `Bearer ${session.accessToken}:${OPEN_API_SECRET}`;
  }
  // Xplora-serveren ser ut til å faktisk sjekke H-Authorization – H-BackDoor-Authorization
  // alene (uten denne) gir et generisk "Authentication failed" uansett gyldige innloggingsdetaljer.
  headers['H-Authorization'] = authorizationHeader;
  headers['H-BackDoor-Authorization'] = authorizationHeader;
  headers['H-Tid'] = String(Math.floor(Date.now() / 1000));
  return headers;
}

async function runGqlQuery(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Xplora-API svarte med status ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0]?.message || 'Ukjent feil fra Xplora-API');
  return json.data;
}

// "tm" sitt eksakte format er ikke dokumentert noe sted (uoffisielt API) –
// håndterer både sekunder og millisekunder siden epoch, samt en ev. ISO-streng.
function parseXploraTimestamp(tm) {
  if (!tm) return new Date().toISOString();
  const n = Number(tm);
  if (Number.isFinite(n)) {
    const ms = n < 1e12 ? n * 1000 : n;
    return new Date(ms).toISOString();
  }
  const d = new Date(tm);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function findWard(children) {
  const wards = (children || []).map((c) => c.ward).filter(Boolean);
  const wanted = (config.xplora.wardName || '').toLowerCase();
  const match = wards.find((w) => w.name?.toLowerCase().includes(wanted) || wanted.includes(w.name?.toLowerCase() || ''));
  return match || wards[0] || null;
}

async function login() {
  if (!config.xplora.password || (!config.xplora.phoneNumber && !config.xplora.email)) {
    throw new Error('Xplora er ikke konfigurert i .env (XPLORA_PHONE/XPLORA_EMAIL + XPLORA_PASSWORD)');
  }
  const passwordMd5 = crypto.createHash('md5').update(config.xplora.password).digest('hex');
  const data = await runGqlQuery(LOGIN_MUTATION, {
    countryPhoneNumber: config.xplora.phoneNumber ? config.xplora.countryPhoneNumber : null,
    phoneNumber: config.xplora.phoneNumber || null,
    emailAddress: config.xplora.email || null,
    password: passwordMd5,
    client: 'APP',
    userLang: 'nb-NO',
    timeZone: 'Europe/Oslo',
  });
  const result = data?.signInWithEmailOrPhone;
  if (!result?.token) throw new Error('Innlogging mot Xplora feilet – sjekk telefonnummer/e-post og passord i .env');
  const ward = findWard(result.user?.children);
  if (!ward) throw new Error('Fant ingen barn (ward) på Xplora-kontoen');
  session = {
    accessToken: result.token,
    expireDate: Number(result.expireDate) || Date.now() + 60 * 60 * 1000,
    wardId: ward.id,
    wardName: ward.name,
  };
}

async function ensureSession() {
  if (!session || Date.now() >= session.expireDate) {
    session = null;
    await login();
  }
}

export async function getLastLocation() {
  await ensureSession();
  const data = await runGqlQuery(WATCH_LAST_LOCATE_QUERY, { uid: session.wardId });
  const loc = data?.watchLastLocate;
  if (!loc || loc.lat == null || loc.lng == null) return null;
  return {
    wardName: session.wardName,
    lat: loc.lat,
    lon: loc.lng,
    battery: loc.battery ?? null,
    isCharging: !!loc.isCharging,
    address: loc.addr || null,
    isInSafeZone: !!loc.isInSafeZone,
    recordedAt: parseXploraTimestamp(loc.tm),
  };
}
