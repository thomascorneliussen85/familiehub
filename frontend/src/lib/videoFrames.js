// Plukker ut noen jevnt fordelte bilder fra en video, slik at en kan "filme"
// et rom og likevel sende vanlige bilder til Claude (som ikke kan se video
// direkte). Alt skjer i nettleseren – ingen video lastes opp til serveren.

function seekTo(video, time) {
  return new Promise((resolve) => {
    function onSeeked() {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    }
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

export function extractFramesFromVideo(file, frameCount = 5) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Klarte ikke å lese videoen'));
    };

    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) {
          throw new Error('Klarte ikke å lese videoen');
        }
        const canvas = document.createElement('canvas');
        const maxWidth = 1024;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext('2d');

        const frames = [];
        for (let i = 0; i < frameCount; i += 1) {
          const t = (duration * (i + 0.5)) / frameCount;
          // eslint-disable-next-line no-await-in-loop
          await seekTo(video, t);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          // eslint-disable-next-line no-await-in-loop
          const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
          if (blob) frames.push(new File([blob], `frame-${i}.jpg`, { type: 'image/jpeg' }));
        }
        URL.revokeObjectURL(url);
        if (frames.length === 0) throw new Error('Fant ingen bilder i videoen');
        resolve(frames);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
  });
}
