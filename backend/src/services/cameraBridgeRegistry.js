// Delt i minnet mellom sockets/cameraBridge.js (som mottar tilkoblinger fra
// broen) og routes/cameras.js (som må vite om en bro er tilkoblet, og sende
// video-forespørsler til riktig socket). Ingen persistens – kun aktive
// tilkoblinger/strømmer, akkurat som relay sin onlineHubs-Map.

const onlineBridgesByFamily = new Map(); // familyId -> Set<socket>
const pendingStreams = new Map(); // streamId -> { res, familyId }

export function registerBridgeSocket(familyId, socket) {
  if (!onlineBridgesByFamily.has(familyId)) onlineBridgesByFamily.set(familyId, new Set());
  onlineBridgesByFamily.get(familyId).add(socket);
}

export function unregisterBridgeSocket(familyId, socket) {
  const set = onlineBridgesByFamily.get(familyId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) onlineBridgesByFamily.delete(familyId);
}

export function isBridgeOnline(familyId) {
  return (onlineBridgesByFamily.get(familyId)?.size || 0) > 0;
}

export function getBridgeSocket(familyId) {
  const set = onlineBridgesByFamily.get(familyId);
  if (!set || set.size === 0) return null;
  return set.values().next().value;
}

export function registerStream(streamId, res, familyId) {
  pendingStreams.set(streamId, { res, familyId });
}

export function getStream(streamId) {
  return pendingStreams.get(streamId);
}

export function removeStream(streamId) {
  pendingStreams.delete(streamId);
}
