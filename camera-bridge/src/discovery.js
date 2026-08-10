import dgram from 'node:dgram';
import { randomUUID } from 'node:crypto';

const WS_DISCOVERY_ADDR = '239.255.255.250';
const WS_DISCOVERY_PORT = 3702;

function buildProbeMessage(messageId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:${messageId}</w:MessageID>
    <w:To e:mustUnderstand="1">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action e:mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>`;
}

// Ett ONVIF WS-Discovery-søk: sender en UDP-multicast-probe og samler inn
// XAddrs (enhetens tjeneste-URL, som inneholder dens lokale IP) fra alle som
// svarer innen tidsfristen. Krever at kameraet har "Tredjepartskompatibilitet"
// (ONVIF) slått på i Tapo-appen – uten det svarer det ikke på dette i det hele tatt.
function probeOnce(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const seen = new Set();
    const results = [];

    socket.on('message', (msg) => {
      const text = msg.toString('utf8');
      const xaddrMatch = text.match(/<[^>]*XAddrs[^>]*>([^<]+)<\/[^>]*XAddrs>/i);
      if (!xaddrMatch) return;
      for (const xaddr of xaddrMatch[1].trim().split(/\s+/)) {
        if (seen.has(xaddr)) continue;
        seen.add(xaddr);
        results.push(xaddr);
      }
    });
    socket.on('error', () => {});

    socket.bind(() => {
      socket.setBroadcast(true);
      try {
        socket.setMulticastTTL(4);
      } catch {
        // ikke kritisk hvis dette feiler på enkelte nettverk
      }
      socket.send(Buffer.from(buildProbeMessage(randomUUID())), WS_DISCOVERY_PORT, WS_DISCOVERY_ADDR);
    });

    setTimeout(() => {
      socket.close();
      resolve(results);
    }, timeoutMs);
  });
}

function extractIpFromXAddr(xaddr) {
  return xaddr.match(/^https?:\/\/([^/:]+)/i)?.[1] || null;
}

// Best-effort: spør enheten selv om produsent/modell/serienummer via ONVIF
// GetDeviceInformation. Enkel regex-utpakking av SOAP-svaret i stedet for en
// full XML-parser-avhengighet – svarformatet er fast/kjent, og hvis det ikke
// matcher går vi bare glipp av navn/modell, kameraet oppdages fortsatt.
async function getDeviceInformation(xaddr) {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <e:Body>
    <tds:GetDeviceInformation/>
  </e:Body>
</e:Envelope>`;
  try {
    const res = await fetch(xaddr, {
      method: 'POST',
      headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
      body,
      signal: AbortSignal.timeout(4000),
    });
    const text = await res.text();
    const pick = (tag) => text.match(new RegExp(`<[^>]*${tag}[^>]*>([^<]*)<\\/[^>]*${tag}>`, 'i'))?.[1] || null;
    return { manufacturer: pick('Manufacturer'), model: pick('Model'), serial: pick('SerialNumber') };
  } catch {
    return { manufacturer: null, model: null, serial: null };
  }
}

export async function discoverCameras() {
  const xaddrs = await probeOnce();
  const cameras = [];
  for (const xaddr of xaddrs) {
    const localIp = extractIpFromXAddr(xaddr);
    if (!localIp) continue;
    const info = await getDeviceInformation(xaddr);
    cameras.push({ localIp, ...info });
  }
  return cameras;
}
