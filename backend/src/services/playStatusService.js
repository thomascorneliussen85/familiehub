import { db } from '../db/index.js';

// Vennestatuser kommer fra relay-tjenesten i del 2 og skal ALDRI lagres i
// databasen eller på disk (personvernkrav) – kun holdes i minnet her så
// lenge de er aktive.
let friendStatuses = [];

export function getFriendStatuses() {
  const now = Date.now();
  friendStatuses = friendStatuses.filter((s) => new Date(s.expiresAt).getTime() > now);
  return friendStatuses;
}

export function setFriendStatuses(list) {
  friendStatuses = list;
}

export function getActiveOwnStatuses(familyId) {
  return db
    .prepare(
      `SELECT ps.*, m.name AS child_name, m.color AS child_color, m.avatar AS child_avatar
       FROM play_status ps
       JOIN family_members m ON m.id = ps.child_id
       WHERE m.family_id = ? AND ps.ended_at IS NULL AND ps.expires_at > datetime('now')
       ORDER BY ps.started_at DESC`
    )
    .all(familyId);
}

// Andre familier på samme installasjon (f.eks. vennefamilier som har
// opprettet sin egen konto her) – disse er alltid "kjente" av samme system,
// så det trengs ingen paringskode slik som for eksterne relay-venner.
export function getOtherFamiliesActiveStatuses(excludeFamilyId) {
  return db
    .prepare(
      `SELECT ps.id, ps.location, ps.emoji, ps.started_at, ps.expires_at,
              m.name AS child_name, f.name AS family_name
       FROM play_status ps
       JOIN family_members m ON m.id = ps.child_id
       JOIN families f ON f.id = m.family_id
       WHERE m.family_id != ? AND ps.ended_at IS NULL AND ps.expires_at > datetime('now')
       ORDER BY ps.started_at DESC`
    )
    .all(excludeFamilyId)
    .map((row) => ({
      id: `same-install:${row.id}`,
      childName: row.child_name,
      familyName: row.family_name,
      location: row.location,
      emoji: row.emoji,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
    }));
}

// "friends" er en sammenslåing av to kilder: andre familier på samme
// installasjon (fungerer for ALLE familier), og eksterne relay-venner – egne,
// separate FamilieHub-installasjoner koblet til via paringskode, som i Fase 1
// fortsatt kun er tilgjengelig for hovedfamilien (se relayClient.js).
export function getPlayStatusSnapshot(familyId, { includeFriends = false } = {}) {
  const sameInstallation = getOtherFamiliesActiveStatuses(familyId);
  const external = includeFriends ? getFriendStatuses() : [];
  return { own: getActiveOwnStatuses(familyId), friends: [...sameInstallation, ...external] };
}

// Personvernkrav: statuser slettes lokalt etter 7 dager.
export function cleanupOldPlayStatus() {
  db.prepare(`DELETE FROM play_status WHERE started_at < datetime('now', '-7 days')`).run();
}
