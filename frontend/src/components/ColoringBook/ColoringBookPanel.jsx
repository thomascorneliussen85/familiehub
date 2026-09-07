import { useEffect, useRef, useState } from 'react';
import FullscreenButton from '../Fullscreen/FullscreenButton';
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

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

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
  const maskDataRef = useRef(null);
  const undoStack = useRef([]);
  const drawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const [tool, setTool] = useState('brush'); // 'brush' | 'fill' | 'eraser'
  const [color, setColor] = useState(PALETTE[0]);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1].size);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Tegneflaten skal fylle hele skjermen når man faktisk fargelegger – la
  // være å skru den av igjen ved tilbake-navigering hvis nettbrettet allerede
  // sto i fullskjerm fra før (f.eks. via sidepanelet), slik at vi ikke
  // uventet slår av en fullskjermmodus vi ikke selv satte på.
  useEffect(() => {
    const wasFullscreen = Boolean(document.fullscreenElement);
    if (!wasFullscreen) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
    return () => {
      if (!wasFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const rect = wrapRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;

    // Bøttefyll trenger et fasitkart over hvor streken faktisk er, i samme
    // pikseloppløsning som tegneflaten – bygges én gang av streke-bildet
    // (funker for både SVG-strek med gjennomsiktig bakgrunn OG opplastede
    // bilder/skann med hvit bakgrunn, siden testen under kun ser på hvor
    // MØRKT hver piksel er, ikke om bakgrunnen er gjennomsiktig).
    function buildMask() {
      const off = document.createElement('canvas');
      off.width = canvas.width;
      off.height = canvas.height;
      const octx = off.getContext('2d');
      octx.drawImage(imgRef.current, 0, 0, off.width, off.height);
      maskDataRef.current = octx.getImageData(0, 0, off.width, off.height).data;
    }
    if (imgRef.current.complete) buildMask();
    else imgRef.current.onload = buildMask;
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

  // Fyller det avgrensede området rundt (cssX, cssY) med valgt farge – ser på
  // strek-fasiten (maskDataRef) for å avgjøre hvor "veggene" er, ikke hva som
  // eventuelt allerede er fargelagt der, slik at man kan fylle et felt på
  // nytt med en annen farge uten at gamle strøk er i veien.
  function floodFillAt(cssX, cssY, hexColor) {
    const mask = maskDataRef.current;
    if (!mask) return;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width;
    const h = canvas.height;
    const startX = Math.round(cssX * dpr);
    const startY = Math.round(cssY * dpr);
    if (startX < 0 || startY < 0 || startX >= w || startY >= h) return;

    function isWall(pixelIdx) {
      const i = pixelIdx * 4;
      if (mask[i + 3] < 40) return false;
      return (mask[i] + mask[i + 1] + mask[i + 2]) / 3 < 180;
    }

    const startPixel = startY * w + startX;
    if (isWall(startPixel)) return;

    const ctx = ctxRef.current;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const [fr, fg, fb] = hexToRgb(hexColor);

    const visited = new Uint8Array(w * h);
    const stack = [startPixel];
    visited[startPixel] = 1;

    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = (p - x) / w;
      const i = p * 4;
      data[i] = fr;
      data[i + 1] = fg;
      data[i + 2] = fb;
      data[i + 3] = 255;

      if (x > 0 && !visited[p - 1] && !isWall(p - 1)) {
        visited[p - 1] = 1;
        stack.push(p - 1);
      }
      if (x < w - 1 && !visited[p + 1] && !isWall(p + 1)) {
        visited[p + 1] = 1;
        stack.push(p + 1);
      }
      if (y > 0 && !visited[p - w] && !isWall(p - w)) {
        visited[p - w] = 1;
        stack.push(p - w);
      }
      if (y < h - 1 && !visited[p + w] && !isWall(p + w)) {
        visited[p + w] = 1;
        stack.push(p + w);
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  function handlePointerDown(e) {
    e.preventDefault();
    const pos = posFromEvent(e);
    if (tool === 'fill') {
      pushUndo();
      floodFillAt(pos.x, pos.y, color);
      return;
    }
    canvasRef.current.setPointerCapture(e.pointerId);
    pushUndo();
    drawing.current = true;
    lastPos.current = pos;
  }

  function handlePointerMove(e) {
    if (!drawing.current || tool === 'fill') return;
    const pos = posFromEvent(e);
    const ctx = ctxRef.current;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
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

  function selectColor(hex) {
    setColor(hex);
    if (tool === 'eraser') setTool('brush');
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
    // Multiplisér streken oppå i stedet for å tegne den ugjennomsiktig – ellers
    // ville en hvit bakgrunn på et opplastet/skannet ark dekket over alle
    // fargene som ligger under den (se coloring-lineart i CSS-en).
    octx.globalCompositeOperation = 'multiply';
    octx.drawImage(imgRef.current, 0, 0, out.width, out.height);
    octx.globalCompositeOperation = 'source-over';

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

        <div className="coloring-tool-row">
          <button className={`btn btn-icon ${tool === 'brush' ? 'btn-accent' : ''}`} onClick={() => setTool('brush')} aria-label="Pensel" title="Pensel">
            🖌️
          </button>
          <button className={`btn btn-icon ${tool === 'fill' ? 'btn-accent' : ''}`} onClick={() => setTool('fill')} aria-label="Fyll" title="Fyll et felt med farge">
            🪣
          </button>
          <button className={`btn btn-icon ${tool === 'eraser' ? 'btn-accent' : ''}`} onClick={() => setTool('eraser')} aria-label="Viskelær" title="Viskelær">
            🧼
          </button>
        </div>

        <div className="coloring-palette">
          {PALETTE.map((c) => (
            <button
              key={c}
              className={`coloring-swatch ${tool !== 'eraser' && color === c ? 'coloring-swatch-active' : ''}`}
              style={{ background: c, borderColor: c === '#ffffff' ? '#ccc' : c }}
              onClick={() => selectColor(c)}
              aria-label={`Farge ${c}`}
            />
          ))}
          <input
            type="color"
            className="coloring-swatch coloring-swatch-custom"
            value={color}
            onChange={(e) => selectColor(e.target.value)}
            aria-label="Egen farge"
            title="Velg egen farge"
          />
        </div>

        {tool !== 'fill' && (
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
        )}

        <button className="btn btn-icon" onClick={undo} aria-label="Angre">
          ↩️
        </button>
        <button className="btn btn-icon" onClick={clearAll} aria-label="Tøm ark">
          🗑️
        </button>
        <FullscreenButton />
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
