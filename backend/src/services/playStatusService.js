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

export function getActiveOwnStatuses() {
  return db
    .prepare(
      `SELECT ps.*, m.name AS child_name, m.color AS child_color, m.avatar AS child_avatar
       FROM play_status ps
       JOIN family_members m ON m.id = ps.child_id
       WHERE ps.ended_at IS NULL AND ps.expires_at > datetime('now')
       ORDER BY ps.started_at DESC`
    )
    .all();
}

export function getPlayStatusSnapshot() {
  return { own: getActiveOwnStatuses(), friends: getFriendStatuses() };
}

// Personvernkrav: statuser slettes lokalt etter 7 dager.
export function cleanupOldPlayStatus() {
  db.prepare(`DELETE FROM play_status WHERE started_at < datetime('now', '-7 days')`).run();
}
