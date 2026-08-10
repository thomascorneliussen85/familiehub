async function rpcCall(ip, method, params) {
  const res = await fetch(`http://${ip}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 1, method, params }),
    signal: AbortSignal.timeout(4000),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || `RPC-feil: ${method}`);
  return data.result;
}

// event-param -> Shellys eget hendelsesnavn (se Shelly-dokumentasjonen for
// Smoke-komponenten: smoke.alarm / smoke.alarm_off / smoke.alarm_test).
const SMOKE_EVENTS = {
  alarm: 'smoke.alarm',
  alarm_off: 'smoke.alarm_off',
  alarm_test: 'smoke.alarm_test',
};

// Setter opp webhooks DIREKTE på selve røykvarsleren via dens lokale RPC-API
// – ingen manuell konfigurasjon i noe Shelly-grensesnitt nødvendig. Sjekker
// eksisterende webhooks først (Webhook.List) slik at gjentatte kall (f.eks.
// hvis enheten godkjennes på nytt) ikke oppretter duplikater – Shelly-enheter
// har en grense på antall webhooks, spesielt batteridrevne som denne.
export async function configureSmokeWebhooks(localIp, familieHubUrl, webhookToken) {
  const existing = await rpcCall(localIp, 'Webhook.List', {});
  const existingUrls = new Set((existing?.hooks || []).flatMap((h) => h.urls || []));

  for (const [eventParam, shellyEvent] of Object.entries(SMOKE_EVENTS)) {
    const targetUrl = `${familieHubUrl}/api/shelly-webhook/${webhookToken}?event=${eventParam}`;
    if (existingUrls.has(targetUrl)) continue;
    await rpcCall(localIp, 'Webhook.Create', {
      cid: 0,
      enable: true,
      event: shellyEvent,
      urls: [targetUrl],
    });
  }
}
