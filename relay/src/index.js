import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { Server } from 'socket.io';
import { db } from './db.js';
import { generateApiKey, hashApiKey, generatePairingCode, generateId } from './crypto.js';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PAIRING_CODE_TTL_MS = 15 * 60 * 1000;

// hubId -> socket. Kun aktive tilkoblinger holdes i minnet – ingen historikk.
const onlineHubs = new Map();

app.get('/health', (req, res) => res.json({ ok: true }));

// Registrer en ny hub – kalles én gang av hver FamilieHub-instans som tar i bruk relayen.
app.post('/hubs/register', (req, res) => {
  const { familyName } = req.body || {};
  if (!familyName) {
    return res.status(400).json({ error: 'familyName er påkrevd' });
  }
  const id = generateId();
  const apiKey = generateApiKey();
  db.prepare('INSERT INTO hubs (id, family_name, api_key_hash) VALUES (?, ?, ?)').run(
    id,
    familyName,
    hashApiKey(apiKey)
  );
  res.status(201).json({ hubId: id, apiKey });
});

function authenticateHub(hubId, apiKey) {
  if (!hubId || !apiKey) return null;
  const hub = db.prepare('SELECT * FROM hubs WHERE id = ?').get(hubId);
  if (!hub) return null;
  if (hub.api_key_hash !== hashApiKey(apiKey)) return null;
  return hub;
}

io.use((socket, next) => {
  const { hubId, apiKey } = socket.handshake.auth || {};
  const hub = authenticateHub(hubId, apiKey);
  if (!hub) return next(new Error('Ugyldig hub-legitimasjon'));
  socket.hub = hub;
  next();
});

function pairedHubIds(hubId) {
  const rows = db
    .prepare(
      `SELECT hub_a_id, hub_b_id FROM pairings
       WHERE status = 'confirmed' AND (hub_a_id = ? OR hub_b_id = ?)`
    )
    .all(hubId, hubId);
  return rows.map((r) => (r.hub_a_id === hubId ? r.hub_b_id : r.hub_a_id));
}

io.on('connection', (socket) => {
  const hubId = socket.hub.id;
  const familyName = socket.hub.family_name;
  onlineHubs.set(hubId, socket);
  console.log(`🔌 Hub tilkoblet: ${familyName} (${hubId})`);

  socket.on('disconnect', () => {
    if (onlineHubs.get(hubId) === socket) onlineHubs.delete(hubId);
    console.log(`🔌 Hub frakoblet: ${familyName} (${hubId})`);
  });

  socket.on('pairing:create-code', (_payload, cb) => {
    db.prepare('DELETE FROM pairing_codes WHERE hub_id = ?').run(hubId);
    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();
    db.prepare('INSERT INTO pairing_codes (code, hub_id, expires_at) VALUES (?, ?, ?)').run(
      code,
      hubId,
      expiresAt
    );
    cb?.({ code, expiresAt });
  });

  socket.on('pairing:redeem-code', ({ code } = {}, cb) => {
    const row = db.prepare('SELECT * FROM pairing_codes WHERE code = ?').get(code);
    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      return cb?.({ error: 'Koden er ugyldig eller utløpt' });
    }
    if (row.hub_id === hubId) {
      return cb?.({ error: 'Du kan ikke parre med deg selv' });
    }
    const hubA = db.prepare('SELECT * FROM hubs WHERE id = ?').get(row.hub_id);
    const existing = db
      .prepare(
        `SELECT * FROM pairings WHERE (hub_a_id = ? AND hub_b_id = ?) OR (hub_a_id = ? AND hub_b_id = ?)`
      )
      .get(hubA.id, hubId, hubId, hubA.id);
    if (existing?.status === 'confirmed') {
      return cb?.({ error: 'Dere er allerede venner' });
    }

    const pairingId = existing?.id || generateId();
    if (!existing) {
      db.prepare('INSERT INTO pairings (id, hub_a_id, hub_b_id, status) VALUES (?, ?, ?, ?)').run(
        pairingId,
        hubA.id,
        hubId,
        'pending'
      );
    }
    db.prepare('DELETE FROM pairing_codes WHERE code = ?').run(code);

    // Varsle den som genererte koden (A) – A må godkjenne parringen eksplisitt.
    onlineHubs.get(hubA.id)?.emit('pairing:incoming', { pairingId, familyName });

    cb?.({ pairingId, waitingForApprovalFrom: hubA.family_name });
  });

  socket.on('pairing:approve', ({ pairingId, approve } = {}) => {
    const pairing = db.prepare('SELECT * FROM pairings WHERE id = ?').get(pairingId);
    if (!pairing || pairing.hub_a_id !== hubId || pairing.status !== 'pending') return;

    const hubB = db.prepare('SELECT * FROM hubs WHERE id = ?').get(pairing.hub_b_id);
    const socketB = onlineHubs.get(pairing.hub_b_id);

    if (!approve) {
      db.prepare('DELETE FROM pairings WHERE id = ?').run(pairingId);
      socketB?.emit('pairing:rejected', { pairingId });
      return;
    }

    db.prepare(`UPDATE pairings SET status = 'confirmed', confirmed_at = datetime('now') WHERE id = ?`).run(
      pairingId
    );
    socket.emit('pairing:confirmed', { pairingId, friendHubId: hubB.id, familyName: hubB.family_name });
    socketB?.emit('pairing:confirmed', { pairingId, friendHubId: hubId, familyName });
  });

  socket.on('pairing:remove', ({ friendHubId } = {}) => {
    db.prepare(
      `DELETE FROM pairings WHERE (hub_a_id = ? AND hub_b_id = ?) OR (hub_a_id = ? AND hub_b_id = ?)`
    ).run(hubId, friendHubId, friendHubId, hubId);
    onlineHubs.get(friendHubId)?.emit('pairing:removed', { friendHubId: hubId });
  });

  // Videresender KUN sanntids lekestatus-felter mellom parrede huber – lagres aldri.
  socket.on('play-status:broadcast', (status = {}) => {
    const payload = {
      statusId: status.statusId,
      childName: status.childName,
      familyName,
      location: status.location,
      emoji: status.emoji,
      startedAt: status.startedAt,
      expiresAt: status.expiresAt,
      ended: Boolean(status.ended),
    };
    for (const friendHubId of pairedHubIds(hubId)) {
      onlineHubs.get(friendHubId)?.emit('play-status:friend-update', payload);
    }
  });
});

const port = process.env.PORT || 8090;
server.listen(port, () => console.log(`🔗 FamilieHub-relay kjører på port ${port}`));
