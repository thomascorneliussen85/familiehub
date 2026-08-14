import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { generateWeekPlan } from '../services/dinnerSuggestionService.js';
import { scheduleMatchingRun } from '../services/smartShoppingService.js';

const router = Router();
router.use(requireAuth);

function serializePlan(row) {
  if (!row) return row;
  return { ...row, ingredients: JSON.parse(row.ingredients_json || '[]') };
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

router.get('/', (req, res) => {
  const { from, to } = req.query;
  let rows;
  if (from && to) {
    rows = db
      .prepare('SELECT * FROM dinner_plans WHERE family_id = ? AND date >= ? AND date <= ? ORDER BY date')
      .all(req.familyId, from, to);
  } else {
    rows = db.prepare('SELECT * FROM dinner_plans WHERE family_id = ? ORDER BY date').all(req.familyId);
  }
  res.json(rows.map(serializePlan));
});

router.post('/', (req, res) => {
  const { date, title, emoji, notes, description = null, ingredients = null, photo_url = null, source = 'manual' } = req.body || {};
  if (!date || !title) {
    return res.status(400).json({ error: 'Dato og tittel er påkrevd' });
  }
  const ingredientsJson = JSON.stringify(ingredients || []);
  db.prepare(
    `INSERT INTO dinner_plans (family_id, date, title, emoji, notes, description, ingredients_json, photo_url, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(family_id, date) DO UPDATE SET
       title = excluded.title,
       emoji = excluded.emoji,
       notes = excluded.notes,
       description = excluded.description,
       ingredients_json = excluded.ingredients_json,
       photo_url = excluded.photo_url,
       source = excluded.source`
  ).run(req.familyId, date, title, emoji || null, notes || null, description, ingredientsJson, photo_url, source);

  const plan = db.prepare('SELECT * FROM dinner_plans WHERE family_id = ? AND date = ?').get(req.familyId, date);
  req.app.get('io').to(`family:${req.familyId}`).emit('dinner-plans:update', serializePlan(plan));
  res.status(201).json(serializePlan(plan));
});

// Genererer 7 middagsforslag med Claude (+ best-effort matbilder hvis
// Unsplash er konfigurert) og lagrer dem rett inn i ukens dager. Overskriver
// eksisterende planer for de 7 dagene – brukeren ser resultatet og kan bytte
// ut enkeltdager manuelt etterpå, akkurat som med vanlig lagring.
router.post('/plan-week', async (req, res) => {
  const { startDate } = req.body || {};
  if (!startDate) {
    return res.status(400).json({ error: 'startDate er påkrevd' });
  }
  try {
    const recentTitles = db
      .prepare('SELECT title FROM dinner_plans WHERE family_id = ? ORDER BY date DESC LIMIT 14')
      .all(req.familyId)
      .map((r) => r.title);

    const days = await generateWeekPlan({ startDate, existingTitles: recentTitles });

    const insert = db.prepare(
      `INSERT INTO dinner_plans (family_id, date, title, emoji, notes, description, ingredients_json, photo_url, source)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'ai')
       ON CONFLICT(family_id, date) DO UPDATE SET
         title = excluded.title,
         emoji = excluded.emoji,
         description = excluded.description,
         ingredients_json = excluded.ingredients_json,
         photo_url = excluded.photo_url,
         source = excluded.source`
    );
    const dates = days.map((_, i) => addDays(startDate, i));
    db.transaction(() => {
      days.forEach((day, i) => {
        insert.run(req.familyId, dates[i], day.title, day.emoji, day.description, JSON.stringify(day.ingredients), day.photo_url);
      });
    })();

    const plans = db
      .prepare('SELECT * FROM dinner_plans WHERE family_id = ? AND date >= ? AND date <= ? ORDER BY date')
      .all(req.familyId, dates[0], dates[dates.length - 1])
      .map(serializePlan);

    req.app.get('io').to(`family:${req.familyId}`).emit('dinner-plans:update', { bulk: true });
    res.json(plans);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Samler ingredienser fra alle planlagte middager i en periode – brukes til
// "forslag fra ukemenyen" i middagsplanleggeren. Enkel case-insensitiv
// deduplisering (ikke mengde-summering), siden ingrediensene er frittstående
// tekst ("500 g kjøttdeig") uten strukturerte mengde/enhet-felt.
router.get('/shopping-suggestions', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from og to er påkrevd' });
  }
  const rows = db
    .prepare('SELECT ingredients_json FROM dinner_plans WHERE family_id = ? AND date >= ? AND date <= ?')
    .all(req.familyId, from, to);

  const seen = new Set();
  const suggestions = [];
  for (const row of rows) {
    const ingredients = JSON.parse(row.ingredients_json || '[]');
    for (const text of ingredients) {
      const key = text.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      suggestions.push(text.trim());
    }
  }
  res.json(suggestions);
});

// Legger valgte ingrediens-forslag til handlelisten, samme mønster som
// POST /api/shopping men i batch – hopper over det som allerede står der
// (case-insensitivt) i stedet for å lage duplikater.
router.post('/add-ingredients-to-shopping', (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items er påkrevd' });
  }
  const existing = new Set(
    db
      .prepare('SELECT name FROM shopping_items WHERE family_id = ?')
      .all(req.familyId)
      .map((r) => r.name.trim().toLowerCase())
  );
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM shopping_items WHERE family_id = ?').get(req.familyId).m;
  const insert = db.prepare('INSERT INTO shopping_items (family_id, name, position) VALUES (?, ?, ?)');

  let added = 0;
  db.transaction(() => {
    items.forEach((raw, i) => {
      const name = String(raw || '').trim();
      if (!name || existing.has(name.toLowerCase())) return;
      insert.run(req.familyId, name, maxPos + 1 + added + i);
      added += 1;
    });
  })();

  const list = db
    .prepare(
      `SELECT * FROM shopping_items
       WHERE family_id = ?
       ORDER BY checked ASC, CASE WHEN checked = 1 THEN checked_at END ASC, position ASC, id ASC`
    )
    .all(req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('shopping:update', list);
  if (added > 0) scheduleMatchingRun(req.familyId, req.app.get('io'));
  res.status(201).json({ added, list });
});

router.delete('/:date', (req, res) => {
  db.prepare('DELETE FROM dinner_plans WHERE family_id = ? AND date = ?').run(req.familyId, req.params.date);
  req.app.get('io').to(`family:${req.familyId}`).emit('dinner-plans:update', { date: req.params.date, deleted: true });
  res.status(204).end();
});

export default router;
