import { db } from '../db/index.js';
import { DateTime } from 'luxon';

function mondayOfThisWeek() { return DateTime.now().setZone('Europe/Oslo').startOf('week').toISODate(); }

const totalStmt = db.prepare(
  `SELECT COALESCE(SUM(cc.stars_awarded), 0) AS total
   FROM chore_completions cc JOIN chores c ON c.id = cc.chore_id
   WHERE c.member_id = ? AND c.family_id = ?`
);
const weekStmt = db.prepare(
  `SELECT COALESCE(SUM(cc.stars_awarded), 0) AS total
   FROM chore_completions cc JOIN chores c ON c.id = cc.chore_id
   WHERE c.member_id = ? AND c.family_id = ? AND cc.completed_on >= ?`
);
const spentStmt = db.prepare(`SELECT COALESCE(SUM(stars_spent), 0) AS total FROM reward_redemptions WHERE member_id = ?`);

// Delt av chores.js, rewards.js og familyGoals.js – tidligere var denne
// total/uke/saldo-beregningen kopiert to steder (og ville blitt en tredje med
// sparemål), som lett kunne driftet fra hverandre ved fremtidige endringer.
export function getStarsBalance(familyId, memberId) {
  const total = totalStmt.get(memberId, familyId).total;
  const spent = spentStmt.get(memberId).total;
  return {
    stars_total: total,
    stars_this_week: weekStmt.get(memberId, familyId, mondayOfThisWeek()).total,
    stars_spent: spent,
    stars_balance: total - spent,
  };
}
