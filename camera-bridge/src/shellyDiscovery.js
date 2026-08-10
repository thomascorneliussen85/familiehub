import os from 'node:os';

const PROBE_TIMEOUT_MS = 400;
const CONCURRENCY = 40;

// Shellys egne API-dokumenter beskriver ikke en pålitelig mDNS-tjenestetype
// for Gen2-enheter, så vi bruker i stedet et rett-fram undernett-søk mot det
// dokumenterte RPC-endepunktet Shelly.GetDeviceInfo – fungerer uansett om
// mDNS er skrudd på/videresendes riktig på nettverket eller ikke.
function localSubnetPrefix() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        const parts = entry.address.split('.');
        return parts.slice(0, 3).join('.');
      }
    }
  }
  return null;
}

async function probeShellyDevice(ip) {
  try {
    const res = await fetch(`http://${ip}/rpc/Shelly.GetDeviceInfo`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.mac) return null;
    return { localIp: ip, id: data.id, model: data.model, mac: data.mac, app: data.app, gen: data.gen };
  } catch {
    return null;
  }
}

export async function discoverShellyDevices() {
  const prefix = localSubnetPrefix();
  if (!prefix) return [];
  const candidateIps = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);
  const found = [];

  for (let i = 0; i < candidateIps.length; i += CONCURRENCY) {
    const batch = candidateIps.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(probeShellyDevice));
    for (const r of results) if (r) found.push(r);
  }

  return found;
}
