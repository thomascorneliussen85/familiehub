import fetch from 'node-fetch';
import { db } from '../db/index.js';

const POLL_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 2500;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function setPlugRelay(ip, turnOn) {
  const res = await fetchWithTimeout(`http://${ip}/relay/0?turn=${turnOn ? 'on' : 'off'}`);
  if (!res.ok) throw new Error(`Shelly svarte med status ${res.status}`);
  return res.json().catch(() => ({}));
}

async function pollOnce(io) {
  const plugs = db.prepare('SELECT * FROM smart_plugs').all();
  let changed = false;

  await Promise.all(
    plugs.map(async (plug) => {
      try {
        const res = await fetchWithTimeout(`http://${plug.ip}/status`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        const isOn = Boolean(data?.relays?.[0]?.ison);
        const watt = data?.meters?.[0]?.power ?? null;
        db.prepare(
          `UPDATE smart_plugs SET is_on = ?, last_watt = ?, online = 1, last_seen_at = datetime('now') WHERE id = ?`
        ).run(isOn ? 1 : 0, watt, plug.id);
        changed = true;
      } catch {
        if (plug.online) {
          db.prepare('UPDATE smart_plugs SET online = 0 WHERE id = ?').run(plug.id);
          changed = true;
        }
      }
    })
  );

  if (changed) {
    io.emit('plugs:update', db.prepare('SELECT * FROM smart_plugs ORDER BY id').all());
  }
}

export function startPlugPolling(io) {
  pollOnce(io).catch((err) => console.error('Feil ved polling av Shelly-plugger:', err.message));
  setInterval(() => {
    pollOnce(io).catch((err) => console.error('Feil ved polling av Shelly-plugger:', err.message));
  }, POLL_INTERVAL_MS);
}
