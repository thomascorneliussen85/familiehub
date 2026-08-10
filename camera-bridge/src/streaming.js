import { spawn } from 'node:child_process';

const activeStreams = new Map(); // streamId -> ffmpeg-prosess

// Tapos RTSP-konvensjon: /stream1 = HD, /stream2 = SD. Brukernavn/passord er
// det du setter opp under "Tredjepartskompatibilitet" i Tapo-appen – aldri
// det samme som TP-Link-kontoen din.
function buildRtspUrl(localIp, config) {
  const user = encodeURIComponent(config.tapoUsername);
  const pass = encodeURIComponent(config.tapoPassword);
  return `rtsp://${user}:${pass}@${localIp}:554/stream1`;
}

export function startStream(socket, { streamId, localIp }, config) {
  if (activeStreams.has(streamId)) return;
  const rtspUrl = buildRtspUrl(localIp, config);

  const ffmpeg = spawn(config.ffmpegPath, [
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl,
    '-f', 'mpjpeg',
    '-boundary_tag', 'ffmpeg',
    '-q:v', '6',
    '-r', '8',
    '-an',
    'pipe:1',
  ]);
  activeStreams.set(streamId, ffmpeg);

  ffmpeg.stdout.on('data', (chunk) => {
    socket.emit('camera:stream-chunk', { streamId, chunk });
  });
  ffmpeg.on('error', (err) => {
    socket.emit('camera:stream-error', { streamId, message: err.message });
    activeStreams.delete(streamId);
  });
  ffmpeg.on('exit', () => {
    if (activeStreams.delete(streamId)) {
      socket.emit('camera:stream-ended', { streamId });
    }
  });
}

export function stopStream(streamId) {
  const ffmpeg = activeStreams.get(streamId);
  if (!ffmpeg) return;
  ffmpeg.kill('SIGKILL');
  activeStreams.delete(streamId);
}

export function stopAllStreams() {
  for (const streamId of [...activeStreams.keys()]) stopStream(streamId);
}
