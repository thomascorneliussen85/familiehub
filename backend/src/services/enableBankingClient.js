import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import { config } from '../config.js';

// MERK om usikkerhet: Enable Banking sitt eksakte API-endepunkter/skjema er
// IKKE verifisert mot en ekte sandbox her, siden Thomas ennå ikke har en
// Application ID / PEM-nøkkel fra dem (se plan-notatet "Full
// consent-flow-verifisering må vente til det finnes ekte
// sandbox-legitimasjon"). Denne klienten følger det generelle mønsteret fra
// Enable Bankings offentlige dokumentasjon (JWT-signert med RS256, app-id
// som issuer, kortlevde tokens) og MÅ dobbeltsjekkes mot deres reelle
// Swagger/API-referanse før den brukes mot ekte kontoer. JWT-signeringen
// under (signAppJwt) er derimot fullt testbar uten ekte legitimasjon, og er
// verifisert med en lokalt generert test-PEM.
const BASE_URL = () => config.enableBankingBaseUrl;
const JWT_TTL_SECONDS = 3600;

export function signAppJwt(appId, pemPrivateKey) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: appId, aud: 'api.enablebanking.com', iat: now, exp: now + JWT_TTL_SECONDS },
    pemPrivateKey,
    { algorithm: 'RS256', keyid: appId }
  );
}

async function ebRequest(appId, pemPrivateKey, path, options = {}) {
  const token = signAppJwt(appId, pemPrivateKey);
  const res = await fetch(`${BASE_URL()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Enable Banking-kall feilet (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Lister banker (ASPSP-er) som støtter kontoaggregering i et land.
export function listAspsps(appId, pemPrivateKey, country = 'NO') {
  return ebRequest(appId, pemPrivateKey, `/aspsps?country=${country}`);
}

// Starter samtykkeflyten mot en bank – brukeren sendes til bankens egen
// innloggingsside (BankID e.l.), og landing tilbake på redirectUrl med en
// kode som byttes inn i eb-callback-ruten.
export function startConsent(appId, pemPrivateKey, { aspspName, aspspCountry, redirectUrl, validUntil }) {
  return ebRequest(appId, pemPrivateKey, '/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: aspspName, country: aspspCountry },
      redirect_url: redirectUrl,
      psu_type: 'personal',
    }),
  });
}

export function listAccounts(appId, pemPrivateKey, sessionId) {
  return ebRequest(appId, pemPrivateKey, `/sessions/${sessionId}`);
}

export function getAccountBalances(appId, pemPrivateKey, accountId) {
  return ebRequest(appId, pemPrivateKey, `/accounts/${accountId}/balances`);
}

export function getAccountTransactions(appId, pemPrivateKey, accountId, dateFrom, dateTo) {
  const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  return ebRequest(appId, pemPrivateKey, `/accounts/${accountId}/transactions?${params.toString()}`);
}
