import { db } from '../db/index.js';

function orderPair(familyIdA, familyIdB) {
  return familyIdA < familyIdB ? [familyIdA, familyIdB] : [familyIdB, familyIdA];
}

// Søk etter familier ved navn (f.eks. "Corneliussen") for å sende en
// venneforespørsel. Ekskluderer egen familie og de man allerede er
// vennefamilie med.
export function searchFamilies(familyId, query) {
  const like = `%${query.trim()}%`;
  return db
    .prepare(
      `SELECT id, name FROM families
       WHERE id != ? AND name LIKE ?
       AND id NOT IN (
         SELECT CASE WHEN family_a_id = ? THEN family_b_id ELSE family_a_id END
         FROM local_friend_pairs WHERE family_a_id = ? OR family_b_id = ?
       )
       ORDER BY name ASC
       LIMIT 20`
    )
    .all(familyId, like, familyId, familyId, familyId);
}

export function createFriendRequest(fromFamilyId, toFamilyId) {
  if (fromFamilyId === toFamilyId) {
    throw new Error('Du kan ikke sende forespørsel til din egen familie');
  }
  const [a, b] = orderPair(fromFamilyId, toFamilyId);
  const alreadyPaired = db
    .prepare('SELECT 1 FROM local_friend_pairs WHERE family_a_id = ? AND family_b_id = ?')
    .get(a, b);
  if (alreadyPaired) {
    throw new Error('Dere er allerede vennefamilier');
  }
  const existing = db
    .prepare(
      `SELECT 1 FROM local_friend_requests
       WHERE (from_family_id = ? AND to_family_id = ?) OR (from_family_id = ? AND to_family_id = ?)`
    )
    .get(fromFamilyId, toFamilyId, toFamilyId, fromFamilyId);
  if (existing) {
    throw new Error('Det finnes allerede en forespørsel mellom dere');
  }
  db.prepare('INSERT INTO local_friend_requests (from_family_id, to_family_id) VALUES (?, ?)').run(
    fromFamilyId,
    toFamilyId
  );
}

export function listIncomingRequests(familyId) {
  return db
    .prepare(
      `SELECT r.id, r.from_family_id, f.name AS family_name, r.created_at
       FROM local_friend_requests r JOIN families f ON f.id = r.from_family_id
       WHERE r.to_family_id = ? ORDER BY r.created_at DESC`
    )
    .all(familyId);
}

export function listOutgoingRequests(familyId) {
  return db
    .prepare(
      `SELECT r.id, r.to_family_id, f.name AS family_name, r.created_at
       FROM local_friend_requests r JOIN families f ON f.id = r.to_family_id
       WHERE r.from_family_id = ? ORDER BY r.created_at DESC`
    )
    .all(familyId);
}

// Sletter forespørselen (begge veier, i tilfelle en dobbel forespørsel
// oppsto) og oppretter paringen hvis godkjent. Returnerer raden slik at
// kalleren vet hvem som skal varsles.
export function respondToFriendRequest(familyId, requestId, approve) {
  const request = db
    .prepare('SELECT * FROM local_friend_requests WHERE id = ? AND to_family_id = ?')
    .get(requestId, familyId);
  if (!request) {
    throw new Error('Fant ikke forespørselen');
  }
  db.prepare(
    `DELETE FROM local_friend_requests
     WHERE (from_family_id = ? AND to_family_id = ?) OR (from_family_id = ? AND to_family_id = ?)`
  ).run(request.from_family_id, request.to_family_id, request.to_family_id, request.from_family_id);
  if (approve) {
    const [a, b] = orderPair(request.from_family_id, request.to_family_id);
    db.prepare(
      `INSERT INTO local_friend_pairs (family_a_id, family_b_id) VALUES (?, ?)
       ON CONFLICT(family_a_id, family_b_id) DO NOTHING`
    ).run(a, b);
  }
  return request;
}

export function listLocalFriendFamilies(familyId) {
  return db
    .prepare(
      `SELECT f.id, f.name, p.paired_at
       FROM local_friend_pairs p
       JOIN families f ON f.id = (CASE WHEN p.family_a_id = ? THEN p.family_b_id ELSE p.family_a_id END)
       WHERE p.family_a_id = ? OR p.family_b_id = ?
       ORDER BY p.paired_at DESC`
    )
    .all(familyId, familyId, familyId);
}

export function removeLocalFriendPair(familyId, otherFamilyId) {
  const [a, b] = orderPair(familyId, otherFamilyId);
  db.prepare('DELETE FROM local_friend_pairs WHERE family_a_id = ? AND family_b_id = ?').run(a, b);
}
