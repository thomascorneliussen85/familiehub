import { io as ioClient } from 'socket.io-client';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { getSetting, setSetting } from './settingsStore.js';
import { getFriendStatuses, setFriendStatuses, getPlayStatusSnapshot } from './playStatusService.js';
import { getOwnerFamilyId } from './ownerFamily.js';

export { getOwnerFamilyId };

let relaySocket = null;
let localIo = null;
let connected = false;
let pendingIncoming = []; // [{ pairingId, familyName }] – venter på foreldregodkjenning

function ownerRoom() {
  return `family:${getOwnerFamilyId()}`;
}

function localBroadcastFriendFamilies() {
  const ownerFamilyId = getOwnerFamilyId();
  const rows = db.prepare('SELECT * FROM friend_families WHERE family_id = ? ORDER BY paired_at DESC').all(ownerFamilyId);
  localIo?.to(ownerRoom()).emit('relay:friend-families-update', rows);
}

function localBroadcastPending() {
  localIo?.to(ownerRoom()).emit('relay:pending-update', pendingIncoming);
}

function localBroadcastStatus() {
  localIo?.to(ownerRoom()).emit('play-status:update', getPlayStatusSnapshot(getOwnerFamilyId(), { includeFriends: true }));
}

function clearFriendStatusesForFamily(familyName) {
  if (!familyName) return;
  setFriendStatuses(getFriendStatuses().filter((s) => s.familyName !== familyName));
  localBroadcastStatus();
}

function mergeIncomingFriendStatus(payload) {
  const key = `${payload.familyName}:${payload.childName}`;
  const list = getFriendStatuses().filter(
    (s) => `${s.familyName}:${s.childName}` !== key
  );
  if (!payload.ended) {
    list.push({
      id: key,
      childName: payload.childName,
      familyName: payload.familyName,
      location: payload.location,
      emoji: payload.emoji,
      startedAt: payload.startedAt,
      expiresAt: payload.expiresAt,
    });
  }
  setFriendStatuses(list);
  localBroadcastStatus();
}

async function ensureHubIdentity() {
  const ownerFamilyId = getOwnerFamilyId();
  const hubId = getSetting(ownerFamilyId, 'relay_hub_id');
  const apiKey = getSetting(ownerFamilyId, 'relay_api_key');
  if (hubId && apiKey) return { hubId, apiKey };

  const res = await fetch(`${config.relay.url}/hubs/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ familyName: config.relay.familyName }),
  });
  if (!res.ok) {
    throw new Error(`Klarte ikke å registrere hos relay (${res.status})`);
  }
  const data = await res.json();
  setSetting(ownerFamilyId, 'relay_hub_id', data.hubId);
  setSetting(ownerFamilyId, 'relay_api_key', data.apiKey);
  return { hubId: data.hubId, apiKey: data.apiKey };
}

export async function initRelayClient(io) {
  localIo = io;
  if (!config.relay.url) {
    console.log('ℹ️  RELAY_URL er ikke satt – "Ut og leke" kjører i kun lokal modus.');
    return;
  }

  try {
    const { hubId, apiKey } = await ensureHubIdentity();
    relaySocket = ioClient(config.relay.url, { auth: { hubId, apiKey }, reconnection: true });

    relaySocket.on('connect', () => {
      connected = true;
      console.log('🔗 Koblet til FamilieHub-relay');
    });
    relaySocket.on('disconnect', () => {
      connected = false;
      console.log('🔌 Mistet forbindelse til FamilieHub-relay');
    });
    relaySocket.on('connect_error', (err) => {
      console.error('Relay-tilkobling feilet:', err.message);
    });

    relaySocket.on('pairing:incoming', ({ pairingId, familyName }) => {
      pendingIncoming = pendingIncoming.filter((p) => p.pairingId !== pairingId);
      pendingIncoming.push({ pairingId, familyName });
      localBroadcastPending();
    });

    relaySocket.on('pairing:confirmed', ({ pairingId, friendHubId, familyName }) => {
      pendingIncoming = pendingIncoming.filter((p) => p.pairingId !== pairingId);
      localBroadcastPending();
      db.prepare(
        `INSERT INTO friend_families (family_id, name, paired_at, approved, friend_hub_id)
         VALUES (?, ?, datetime('now'), 1, ?)
         ON CONFLICT(friend_hub_id) DO UPDATE SET name = excluded.name, approved = 1`
      ).run(getOwnerFamilyId(), familyName, friendHubId);
      localBroadcastFriendFamilies();
    });

    relaySocket.on('pairing:rejected', ({ pairingId }) => {
      pendingIncoming = pendingIncoming.filter((p) => p.pairingId !== pairingId);
      localBroadcastPending();
    });

    relaySocket.on('pairing:removed', ({ friendHubId }) => {
      const friend = db.prepare('SELECT * FROM friend_families WHERE friend_hub_id = ?').get(friendHubId);
      db.prepare('DELETE FROM friend_families WHERE friend_hub_id = ?').run(friendHubId);
      localBroadcastFriendFamilies();
      clearFriendStatusesForFamily(friend?.name);
    });

    relaySocket.on('play-status:friend-update', mergeIncomingFriendStatus);
  } catch (err) {
    console.error('Klarte ikke å koble til relay:', err.message);
  }
}

export function getRelayStatus() {
  return { configured: Boolean(config.relay.url), connected };
}

export function getPendingIncoming() {
  return pendingIncoming;
}

export function listFriendFamilies() {
  return db.prepare('SELECT * FROM friend_families WHERE family_id = ? ORDER BY paired_at DESC').all(getOwnerFamilyId());
}

function requireConnected() {
  if (!relaySocket || !connected) {
    throw new Error('Ikke koblet til relay ennå');
  }
}

export function createPairingCode() {
  requireConnected();
  return new Promise((resolve, reject) => {
    relaySocket.emit('pairing:create-code', {}, (result) => {
      if (result?.error) return reject(new Error(result.error));
      resolve(result);
    });
  });
}

export function redeemPairingCode(code) {
  requireConnected();
  return new Promise((resolve, reject) => {
    relaySocket.emit('pairing:redeem-code', { code }, (result) => {
      if (result?.error) return reject(new Error(result.error));
      resolve(result);
    });
  });
}

export function approvePairing(pairingId, approve) {
  requireConnected();
  relaySocket.emit('pairing:approve', { pairingId, approve });
  pendingIncoming = pendingIncoming.filter((p) => p.pairingId !== pairingId);
  localBroadcastPending();
}

export function removeFriend(friendHubId) {
  if (relaySocket && connected) {
    relaySocket.emit('pairing:remove', { friendHubId });
  }
  const friend = db.prepare('SELECT * FROM friend_families WHERE friend_hub_id = ?').get(friendHubId);
  db.prepare('DELETE FROM friend_families WHERE friend_hub_id = ?').run(friendHubId);
  localBroadcastFriendFamilies();
  clearFriendStatusesForFamily(friend?.name);
}

export function broadcastLocalStatus(status) {
  if (!relaySocket || !connected) return;
  relaySocket.emit('play-status:broadcast', status);
}
