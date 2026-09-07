import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

// POST /api/games/results – lagrer utfallet av ETT parti. players er en liste
// over alle deltakerne i partiet (rekkefølge er likegyldig), hver enten en
// ekte familieprofil (member_id) eller en gjest uten profil (guest_name) –
// aldri begge, aldri ingen.
router.post('/results', (req, res) => {
  const { game_key, players } = req.body;
  if (!game_key || typeof game_key !== 'string') {
    return res.status(400).json({ error: 'Mangler game_key' });
  }
  if (!Array.isArray(players) || players.length === 0) {
    return res.status(400).json({ error: 'Mangler spillere' });
  }
  for (const p of players) {
    if (!p.member_id && !p.guest_name) {
      return res.status(400).json({ error: 'Hver spiller trenger member_id eller guest_name' });
    }
    if (!Number.isInteger(p.placement) || p.placement < 1) {
      return res.status(400).json({ error: 'Ugyldig placement' });
    }
  }

  const sessionId = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO game_sessions (family_id, game_key) VALUES (?, ?)')
      .run(req.familyId, game_key);
    const insertResult = db.prepare(
      `INSERT INTO game_results (session_id, member_id, guest_name, placement, score)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const p of players) {
      insertResult.run(lastInsertRowid, p.member_id || null, p.member_id ? null : p.guest_name, p.placement, p.score ?? null);
    }
    return lastInsertRowid;
  })();

  res.status(201).json({ session_id: sessionId });
});

// GET /api/games/:key/leaderboard – enkel toppliste for ett spill: antall
// seiere og antall partier per familiemedlem. Gjester regnes med i partier
// men holdes utenfor topplisten, siden de ikke er en vedvarende profil å
// rangere over tid.
router.get('/:key/leaderboard', (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.id, m.name, m.avatar, m.color,
              COUNT(*) AS games_played,
              SUM(CASE WHEN gr.placement = 1 THEN 1 ELSE 0 END) AS wins
       FROM game_results gr
       JOIN game_sessions gs ON gs.id = gr.session_id
       JOIN family_members m ON m.id = gr.member_id
       WHERE gs.family_id = ? AND gs.game_key = ?
       GROUP BY m.id
       ORDER BY wins DESC, games_played DESC`
    )
    .all(req.familyId, req.params.key);
  res.json(rows);
});

export default router;
