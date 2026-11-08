import { useRef, useState } from 'react';
import { extractFramesFromVideo } from '../../lib/videoFrames';
import DeclutterReviewModal from './DeclutterReviewModal';
import './DeclutterPanel.css';

async function sendScan(files) {
  const formData = new FormData();
  files.forEach((file) => formData.append('images', file));
  const res = await fetch('/api/declutter/scan', { method: 'POST', credentials: 'include', body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Klarte ikke å skanne rommet');
  return data;
}

export default function DeclutterPanel() {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanning(true);
    setError('');
    try {
      setResult(await sendScan([file]));
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  async function handleVideo(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanning(true);
    setError('');
    try {
      const frames = await extractFramesFromVideo(file, 5);
      setResult(await sendScan(frames));
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  return (
    <section className="panel panel-declutter">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🧹</span> Rydde opp
        </div>
      </div>
      <div className="panel-body declutter-body">
        <p className="declutter-intro">
          Ta et bilde eller film et rom, så ser Claude etter ting som bør ryddes bort og foreslår gjøremål du
          kan legge rett inn.
        </p>

        <div className="declutter-buttons">
          <button className="btn btn-accent declutter-scan-btn" onClick={() => photoInputRef.current?.click()} disabled={scanning}>
            {scanning ? '⏳ Skanner…' : '📷 Ta bilde'}
          </button>
          <button className="btn declutter-scan-btn" onClick={() => videoInputRef.current?.click()} disabled={scanning}>
            {scanning ? '⏳ Skanner…' : '🎥 Film rommet'}
          </button>
        </div>
        <input type="file" accept="image/*" capture="environment" ref={photoInputRef} onChange={handlePhoto} hidden />
        <input type="file" accept="video/*" capture="environment" ref={videoInputRef} onChange={handleVideo} hidden />

        {error && <div className="declutter-error">{error}</div>}
        {!error && !scanning && !result && <div className="empty-hint">Ingen skanning gjort ennå.</div>}
      </div>

      {result && (
        <DeclutterReviewModal summary={result.summary} items={result.items} onClose={() => setResult(null)} />
      )}
    </section>
  );
}
