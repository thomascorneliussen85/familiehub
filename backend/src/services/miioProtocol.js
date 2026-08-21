import dgram from 'node:dgram';
import crypto from 'node:crypto';

// Lavnivå-klient for Xiaomi/Dreame sitt "miIO"-binærprotokoll (UDP, port
// 54321) – brukt av roboststøvsugere og mye annet i Xiaomi-økosystemet.
// Ingen offisiell dokumentasjon finnes; dette er reverse-engineert av
// community (python-miio, OpenMiHome/mihome-binary-protocol) og verifisert
// mot faktisk kildekode der, ikke gjettet. Se dreameVacuumService.js for
// enhetsspesifikke egenskaper/kommandoer bygget oppå dette.
//
// Pakkeformat (32-byte header + kryptert JSON-body):
//   0-1   magic (alltid 0x2131)
//   2-3   total pakkelengde (header + body)
//   4-7   "unknown" (0 normalt, 0xFFFFFFFF i Hello)
//   8-11  device_id (fra Hello-svaret, 0xFFFFFFFF i Hello)
//   12-15 timestamp/stamp (sekunder)
//   16-31 sjekksum = MD5(byte 0-15 + token + kryptert body)
//   32+   AES-128-CBC-kryptert JSON, key=MD5(token), iv=MD5(key+token)
const MAGIC = 0x2131;
const HELLO_TIMEOUT_MS = 3000;
const COMMAND_TIMEOUT_MS = 5000;

function keyIv(tokenBuf) {
  const key = crypto.createHash('md5').update(tokenBuf).digest();
  const iv = crypto.createHash('md5').update(Buffer.concat([key, tokenBuf])).digest();
  return { key, iv };
}

function encryptPayload(key, iv, plaintext) {
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
}

function decryptPayload(key, iv, ciphertext) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function buildHelloPacket() {
  const packet = Buffer.alloc(32, 0xff);
  packet.writeUInt16BE(MAGIC, 0);
  packet.writeUInt16BE(32, 2);
  return packet;
}

function buildCommandPacket({ deviceId, token, key, iv, payloadJson }) {
  const encrypted = encryptPayload(key, iv, payloadJson);
  const totalLen = 32 + encrypted.length;

  const head = Buffer.alloc(16);
  head.writeUInt16BE(MAGIC, 0);
  head.writeUInt16BE(totalLen, 2);
  head.writeUInt32BE(0, 4);
  deviceId.copy(head, 8);
  head.writeUInt32BE(Math.floor(Date.now() / 1000), 12);

  const checksum = crypto
    .createHash('md5')
    .update(Buffer.concat([head, token, encrypted]))
    .digest();

  return Buffer.concat([head, checksum, encrypted]);
}

// Sender ett enkelt miIO-kommando (metode+parametre) til en enhet på det
// lokale nettverket og returnerer den dekrypterte JSON-responsen. Gjør et
// nytt Hello-håndtrykk per kall i stedet for å holde en økt åpen – enklere
// og robust nok for hvor sjelden dashbordet spør (ikke en høyfrekvent
// kontrollsløyfe).
export function sendMiioCommand(ip, tokenHex, method, params = []) {
  return new Promise((resolve, reject) => {
    const token = Buffer.from(tokenHex, 'hex');
    if (token.length !== 16) {
      reject(new Error('Token må være 32 hex-tegn (16 byte)'));
      return;
    }
    const { key, iv } = keyIv(token);
    const socket = dgram.createSocket('udp4');
    let settled = false;
    let helloTimer;
    let commandTimer;

    function cleanup() {
      clearTimeout(helloTimer);
      clearTimeout(commandTimer);
      socket.close();
    }
    function fail(err) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }
    function succeed(value) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }

    socket.on('error', (err) => fail(err));

    socket.on('message', (msg) => {
      if (msg.length < 32) return;
      const deviceId = msg.subarray(8, 12);

      if (!helloTimer && !commandTimer) return; // ignorer sen/dobbel respons etter cleanup

      if (helloTimer) {
        // Hello-svar mottatt – deviceId+timestamp er nå kjent, send selve kommandoen.
        clearTimeout(helloTimer);
        helloTimer = null;

        const payloadJson = JSON.stringify({ id: Math.floor(Math.random() * 1e5), method, params });
        const commandPacket = buildCommandPacket({ deviceId, token, key, iv, payloadJson });
        commandTimer = setTimeout(() => fail(new Error('Fikk ikke svar fra støvsugeren (timeout)')), COMMAND_TIMEOUT_MS);
        socket.send(commandPacket, 54321, ip);
        return;
      }

      if (commandTimer) {
        clearTimeout(commandTimer);
        commandTimer = null;
        try {
          const encrypted = msg.subarray(32);
          const decrypted = decryptPayload(key, iv, encrypted);
          const data = JSON.parse(decrypted.toString('utf8'));
          succeed(data);
        } catch (err) {
          fail(new Error('Klarte ikke å tolke svaret fra støvsugeren – feil token?'));
        }
      }
    });

    helloTimer = setTimeout(
      () => fail(new Error('Fant ikke støvsugeren på nettverket (feil IP, eller ikke på samme nett)')),
      HELLO_TIMEOUT_MS
    );
    socket.send(buildHelloPacket(), 54321, ip);
  });
}
