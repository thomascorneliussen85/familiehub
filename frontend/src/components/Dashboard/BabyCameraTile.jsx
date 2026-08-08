import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import './BabyCameraTile.css';

const POS_KEY = 'familiehub-baby-camera-pos';
const RETRY_MS = 15000;

function loadSavedPos() {
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY));
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') return saved;
  } catch {
    // ignorer korrupt lagret posisjon, bruk standard
  }
  return null;
}

export default function BabyCameraTile() {
  const [camera, setCamera] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // Strømmen prøves alltid i bakgrunnen, men ruten vises kun (visible=true)
  // når den faktisk kommer opp – den skal forsvinne helt av seg selv når
  // kameraet ikke er tilkoblet, ikke stå igjen som en tom/feilet boks.
  const [visible, setVisible] = useState(false);
  const [streamKey, setStreamKey] = useState(0);
  const [pos, setPos] = useState(loadSavedPos);
  const boxRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    api
      .get('/cameras')
      .then((list) => {
        const baby = list.find((c) => c.name?.toLowerCase().includes('baby'));
        setCamera(baby || null);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!camera || visible) return undefined;
    const id = setInterval(() => setStreamKey((k) => k + 1), RETRY_MS);
    return () => clearInterval(id);
  }, [camera, visible]);

  function clamp(x, y) {
    const box = boxRef.current;
    const parent = box?.offsetParent;
    if (!box || !parent) return { x, y };
    const maxX = Math.max(0, parent.clientWidth - box.offsetWidth);
    const maxY = Math.max(0, parent.clientHeight - box.offsetHeight);
    return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
  }

  function onDragStart(e) {
    const box = boxRef.current;
    if (!box) return;
    const boxRect = box.getBoundingClientRect();
    const parentRect = box.offsetParent.getBoundingClientRect();
    dragRef.current = {
      offsetX: e.clientX - boxRect.left,
      offsetY: e.clientY - boxRect.top,
      parentRect,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onDragMove(e) {
    if (!dragRef.current) return;
    const { offsetX, offsetY, parentRect } = dragRef.current;
    setPos(clamp(e.clientX - parentRect.left - offsetX, e.clientY - parentRect.top - offsetY));
  }

  function onDragEnd(e) {
    if (!dragRef.current) return;
    dragRef.current = null;
    setPos((current) => {
      if (current) localStorage.setItem(POS_KEY, JSON.stringify(current));
      return current;
    });
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  if (!loaded || !camera) return null;

  const style = pos ? { left: `${pos.x}px`, top: `${pos.y}px` } : undefined;

  return (
    <div
      className={`baby-camera-tile ${pos ? 'baby-camera-tile-positioned' : ''} ${visible ? '' : 'baby-camera-tile-hidden'}`}
      style={style}
      ref={boxRef}
    >
      <div
        className="baby-camera-drag-handle"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <span className="baby-camera-name">🍼 {camera.name}</span>
        <span className="baby-camera-drag-hint">✥</span>
      </div>
      <div className="baby-camera-stream-wrap">
        <img
          key={streamKey}
          className="baby-camera-stream"
          src={`/api/cameras/${camera.id}/stream`}
          alt={camera.name}
          draggable={false}
          onLoad={() => setVisible(true)}
          onError={() => setVisible(false)}
        />
      </div>
    </div>
  );
}
