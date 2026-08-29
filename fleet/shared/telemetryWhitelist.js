// Eneste kilde til sannhet for hvilke telemetrifelt en hub har lov til å
// sende til fleet-tjenesten. Importeres BÅDE av fleet-backenden (validerer
// ved mottak) OG av hub-klienten i backend/src/services/fleetClient.js
// (validerer FØR sending) – akkurat samme fil begge steder, siden de ligger
// i samme monorepo, slik at det aldri kan oppstå avvik mellom hva klienten
// tror den får lov til å sende og hva tjenesten faktisk godtar.
//
// STRENGT forbudt her: navn, innhold, sensorverdier, posisjoner, bilder –
// kun teknisk, anonym drifts-telemetri om selve hub-installasjonen.
export const ALLOWED_TELEMETRY_FIELDS = {
  app_versjon: 'string',
  oppetid_sekunder: 'number',
  fri_diskplass_mb: 'number',
  minnebruk_prosent: 'number',
  antall_tilkoblede_enheter: 'number',
  os_versjon: 'string',
};

// Plukker KUN ut whitelistede felt fra en vilkårlig objekt, og forkaster
// alt annet uten varsel (i stedet for å feile – en fremtidig hub-versjon
// som sender et ekstra felt ved en feil skal ikke knekke telemetrimottaket,
// den skal bare miste det ene feltet). Feil type på et felt forkaster kun
// det feltet, ikke hele forespørselen.
export function sanitizeTelemetry(input) {
  const clean = {};
  if (!input || typeof input !== 'object') return clean;
  for (const [key, expectedType] of Object.entries(ALLOWED_TELEMETRY_FIELDS)) {
    const value = input[key];
    if (value == null) continue;
    if (expectedType === 'number' && typeof value === 'number' && Number.isFinite(value)) {
      clean[key] = value;
    } else if (expectedType === 'string' && typeof value === 'string' && value.length <= 200) {
      clean[key] = value;
    }
  }
  return clean;
}
