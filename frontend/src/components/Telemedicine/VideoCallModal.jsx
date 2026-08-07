import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import './VideoCallModal.css';

const CONNECT_DELAY_MS = 2500;

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Simulert videosamtale – DoktorNå er et fiktivt firma uten ekte lege i andre
// enden, så dette viser kun hvordan opplevelsen ville sett ut: eget kamera i
// et lite vindu, en "legen kobler til"-fase, og en tilkoblet fase med timer.
// Ingen faktisk video sendes noe sted.
export default function VideoCallModal({ booking, onEnd }) {
  const [phase, setPhase] = useState('connecting'); // 'connecting' | 'connected' | 'ended'
  const [elapsed, setElapsed] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCameraError('Fikk ikke tilgang til kamera – fortsetter uten forhåndsvisning.'));

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setPhase('connected'), CONNECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== 'connected') return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  function toggleMic() {
    setMicOn((on) => {
      streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !on));
      return !on;
    });
  }

  function toggleCamera() {
    setCameraOn((on) => {
      streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !on));
      return !on;
    });
  }

  async function endCall() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    await api.post(`/telemedicine/bookings/${booking.id}/complete`).catch(() => {});
    onEnd();
  }

  return (
    <div className="videocall-overlay">
      <div className="videocall-demo-badge">🎬 DEMO – ingen ekte videosamtale</div>

      <div className="videocall-doctor-area">
        <span className="videocall-doctor-avatar">{booking.doctor_avatar}</span>
        <div className="videocall-doctor-name">{booking.doctor_name}</div>
        <div className="videocall-doctor-specialty">{booking.doctor_specialty}</div>
        {phase === 'connecting' && <div className="videocall-status">Kobler til…</div>}
        {phase === 'connected' && <div className="videocall-timer">{formatElapsed(elapsed)}</div>}
      </div>

      <div className="videocall-self-view">
        {cameraOn ? (
          <video ref={videoRef} autoPlay muted playsInline className="videocall-self-video" />
        ) : (
          <div className="videocall-self-off">📷 Av</div>
        )}
        {cameraError && <div className="videocall-camera-error">{cameraError}</div>}
      </div>

      <div className="videocall-controls">
        <button className={`videocall-ctrl ${!micOn ? 'videocall-ctrl-off' : ''}`} onClick={toggleMic}>
          {micOn ? '🎤' : '🔇'}
        </button>
        <button className={`videocall-ctrl ${!cameraOn ? 'videocall-ctrl-off' : ''}`} onClick={toggleCamera}>
          {cameraOn ? '📷' : '🚫'}
        </button>
        <button className="videocall-ctrl videocall-end" onClick={endCall} aria-label="Avslutt samtale">
          📞
        </button>
      </div>
    </div>
  );
}
