import { useEffect, useRef, useState } from 'react';
import './ColoringBookPanel.css';

const BUILTIN_SHEETS = [
  { name: 'Hus', emoji: '🏠', url: '/coloring-sheets/hus.svg' },
  { name: 'Blomst', emoji: '🌸', url: '/coloring-sheets/blomst.svg' },
  { name: 'Bil', emoji: '🚗', url: '/coloring-sheets/bil.svg' },
  { name: 'Katt', emoji: '🐱', url: '/coloring-sheets/katt.svg' },
  { name: 'Ballonger', emoji: '🎈', url: '/coloring-sheets/ballonger.svg' },
  { name: 'Dinosaur', emoji: '🦕', url: '/coloring-sheets/dinosaur.svg' },
];

const PALETTE = [
  '#e0433d', '#f2994a', '#f2c94c', '#6fcf67', '#2fb6a5', '#3b82f6',
  '#7c5cff', '#e85fb3', '#8a5a3b', '#2b2f36', '#8a8f98', '#ffffff',
];

const BRUSH_SIZES = [
  { key: 'liten', size: 7 },
  { key: 'medium', size: 16 },
  { key: 'stor', size: 30 },
];

// Egne opplastede ark (⚙️ → Innstillinger → Bilder) kommer i tillegg til det
// faste, innebygde settet over – ingen foreldre-PIN trengs for å bla i eller
// fargelegge disse, kun for å legge inn NYE ark (se coloringSheets.js).
export default function ColoringBookPanel() {
  const [sheets, setSheets] = useState(BUILTIN_SHEETS);
  const [active, setActive] = useState(null);

  useEffect(() => {
    fetch('/api/coloring-sheets', { credentials: 'include' })
      .then((r) => r.json())
      .then((custom) => {
        if (custom.length === 0) return;
        setSheets([...BUILTIN_SHEETS, ...custom.map((c) => ({ name: 'Eget ark', emoji: '🖍️', url: c.url }))]);
      })
      .catch(() => {});
  }, []);

  if (active) {
    return <ColoringCanvas sheet={active} onBack={() => setActive(null)} />;
  }

  return (
    <div className="coloring-gallery">
      <p className="coloring-gallery-hint">Velg et ark å fargelegge</p>
      <div className="coloring-gallery-grid">
        {sheets.map((s, i) => (
          <button key={i} className="coloring-gallery-item" onClick={() => setActive(s)}>
            <span className="coloring-gallery-item-thumb">
              <img src={s.url} alt="" />
            </span>
            <span className="coloring-gallery-item-label">
              {s.emoji} {s.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ColoringCanvas({ sheet, onBack }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const imgRef = useRef(null);
  const undoStack = useRef([]);
  const drawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const [color, setColor] = useState(PALETTE[0]);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1].size);
  const [eraser, setEraser] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    const rect = wrapRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;
  }, []);

  function posFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function pushUndo() {
    const canvas = canvasRef.current;
    const snap = ctxRef.current.getImageData(0, 0, canvas.width, canvas.height);
    undoStack.current.push(snap);
    if (undoStack.current.length > 15) undoStack.current.shift();
  }

  function undo() {
    const snap = undoStack.current.pop();
    if (!snap) return;
    ctxRef.current.putImageData(snap, 0, 0);
  }

  function handlePointerDown(e) {
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    pushUndo();
    drawing.current = true;
    lastPos.current = posFromEvent(e);
  }

  function handlePointerMove(e) {
    if (!drawing.current) return;
    const pos = posFromEvent(e);
    const ctx = ctxRef.current;
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }

  function handlePointerUp() {
    drawing.current = false;
  }

  function clearAll() {
    pushUndo();
    const canvas = canvasRef.current;
    ctxRef.current.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function saveFinished() {
    const canvas = canvasRef.current;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const octx = out.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0);
    octx.drawImage(imgRef.current, 0, 0, out.width, out.height);

    const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
    const formData = new FormData();
    formData.append('image', blob, 'fargelegging.png');

    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/coloring-sheets/finished', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) throw new Error();
      setMessage('Lagt i fotorammen! 🎉');
      setTimeout(onBack, 1600);
    } catch {
      setMessage('Klarte ikke å lagre – prøv igjen.');
      setSaving(false);
    }
  }

  return (
    <div className="coloring-canvas-page">
      <div className="coloring-toolbar">
        <button className="btn" onClick={onBack}>
          ← Andre ark
        </button>
        <div className="coloring-palette">
          {PALETTE.map((c) => (
            <button
              key={c}
              className={`coloring-swatch ${!eraser && color === c ? 'coloring-swatch-active' : ''}`}
              style={{ background: c, borderColor: c === '#ffffff' ? '#ccc' : c }}
              onClick={() => {
                setColor(c);
                setEraser(false);
              }}
              aria-label={`Farge ${c}`}
            />
          ))}
        </div>
        <div className="coloring-brush-sizes">
          {BRUSH_SIZES.map((b) => (
            <button
              key={b.key}
              className={`coloring-brush-btn ${brushSize === b.size ? 'coloring-brush-btn-active' : ''}`}
              onClick={() => setBrushSize(b.size)}
              aria-label={b.key}
            >
              <span style={{ width: b.size * 0.6, height: b.size * 0.6 }} />
            </button>
          ))}
        </div>
        <button className={`btn btn-icon ${eraser ? 'btn-accent' : ''}`} onClick={() => setEraser((v) => !v)} aria-label="Viskelær">
          🧼
        </button>
        <button className="btn btn-icon" onClick={undo} aria-label="Angre">
          ↩️
        </button>
        <button className="btn btn-icon" onClick={clearAll} aria-label="Tøm ark">
          🗑️
        </button>
        <button className="btn btn-accent" onClick={saveFinished} disabled={saving}>
          {saving ? 'Lagrer…' : '✓ Ferdig'}
        </button>
      </div>
      {message && <div className="coloring-message">{message}</div>}
      <div className="coloring-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="coloring-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        <img ref={imgRef} className="coloring-lineart" src={sheet.url} alt="" />
      </div>
    </div>
  );
}
