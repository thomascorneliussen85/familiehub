import 'dotenv/config';
import { io as ioClient } from 'socket.io-client';
import { discoverCameras } from './discovery.js';
import { startStream, stopStream, stopAllStreams } from './streaming.js';
import { discoverShellyDevices } from './shellyDiscovery.js';
import { configureSmokeWebhooks } from './shellyWebhook.js';

const config = {
  familieHubUrl: (process.env.FAMILIEHUB_URL || '').replace(/\/+$/, ''),
  bridgeId: process.env.BRIDGE_ID || '',
  bridgeApiKey: process.env.BRIDGE_API_KEY || '',
  tapoUsername: process.env.TAPO_USERNAME || '',
  tapoPassword: process.env.TAPO_PASSWORD || '',
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
  discoveryIntervalMs: Number(process.env.DISCOVERY_INTERVAL_MS) || 30000,
};

if (!config.familieHubUrl || !config.bridgeId || !config.bridgeApiKey) {
  console.error('FAMILIEHUB_URL, BRIDGE_ID og BRIDGE_API_KEY må settes i .env – se .env.example og README.md');
  process.exit(1);
}
if (!config.tapoUsername || !config.tapoPassword) {
  console.warn('⚠️  TAPO_USERNAME/TAPO_PASSWORD er ikke satt – kameraer kan oppdages, men video vil ikke fungere.');
}

const socket = ioClient(`${config.familieHubUrl}/camera-bridge`, {
  auth: { bridgeId: config.bridgeId, apiKey: config.bridgeApiKey },
  reconnection: true,
});

socket.on('connect', () => {
  console.log('✅ Tilkoblet FamilieHub');
  startDiscoveryLoop();
});
socket.on('connect_error', (err) => {
  console.error('❌ Kunne ikke koble til FamilieHub:', err.message);
});
socket.on('disconnect', () => {
  console.log('🔌 Frakoblet FamilieHub – socket.io kobler til på nytt automatisk');
});

socket.on('camera:stream-request', ({ streamId, localIp }) => {
  console.log(`▶️  Starter strøm ${streamId} for ${localIp}`);
  startStream(socket, { streamId, localIp }, config);
});
socket.on('camera:stream-stop', ({ streamId }) => {
  console.log(`⏹️  Stopper strøm ${streamId}`);
  stopStream(streamId);
});

// Sendes når familien navngir/godkjenner en oppdaget røykvarsler i
// Innstillinger – setter opp alarm-webhooken direkte på enheten, lokalt.
socket.on('shelly:configure-webhook', async ({ localIp, webhookToken, deviceType }) => {
  if (deviceType !== 'smoke') return;
  try {
    await configureSmokeWebhooks(localIp, config.familieHubUrl, webhookToken);
    console.log(`✅ Satte opp alarm-varsling for ${localIp}`);
  } catch (err) {
    console.error(`❌ Klarte ikke sette opp varsling for ${localIp}:`, err.message);
  }
});

let discoveryTimer = null;
function startDiscoveryLoop() {
  if (discoveryTimer) return;
  const tick = async () => {
    try {
      const cameras = await discoverCameras();
      if (cameras.length === 0) {
        console.log('🔍 Søkte etter kameraer på nettverket – fant ingen.');
      }
      for (const camera of cameras) {
        socket.emit('camera:discovered', camera, (result) => {
          if (result?.error) {
            console.warn(`Kunne ikke registrere ${camera.localIp}: ${result.error}`);
          } else {
            const label = camera.manufacturer ? `${camera.manufacturer} ${camera.model || ''}`.trim() : 'ukjent modell';
            console.log(`📷 Fant kamera ${camera.localIp} (${label}) – status: ${result.status}`);
          }
        });
      }
    } catch (err) {
      console.error('Feil under kamera-søk:', err.message);
    }

    try {
      const shellyDevices = await discoverShellyDevices();
      if (shellyDevices.length === 0) {
        console.log('🔍 Søkte etter Shelly-enheter på nettverket – fant ingen.');
      }
      for (const device of shellyDevices) {
        socket.emit('shelly:discovered', device, (result) => {
          if (result?.error) {
            console.warn(`Kunne ikke registrere Shelly ${device.localIp}: ${result.error}`);
          } else {
            console.log(`🔌 Fant Shelly-enhet ${device.localIp} (${device.model || 'ukjent modell'}) – status: ${result.status}`);
          }
        });
      }
    } catch (err) {
      console.error('Feil under Shelly-søk:', err.message);
    }
  };
  tick();
  discoveryTimer = setInterval(tick, config.discoveryIntervalMs);
}

process.on('SIGINT', () => {
  stopAllStreams();
  socket.close();
  process.exit(0);
});
