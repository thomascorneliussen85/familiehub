import { Router } from 'express';
import { combineIngredients } from '../services/ingredients.js';
import { archiveDeletion } from '../services/undoService.js';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { generateWeekPlan, generateRecipeDetails } from '../services/dinnerSuggestionService.js';

const router = Router();
router.use(requireAuth);

function serializePlan(row) {
  if (!row) return row;
  return {
    ...row,
    ingredients: JSON.parse(row.ingredients_json || '[]'),
    instructions: JSON.parse(row.instructions_json || '[]'),
  };
}

// Standardliste av vanlige norske familiemiddager – seedes én gang per
// familie (lazy, samme mønster som ensureDefaultCategories i
// financeImportService.js), slik at "velg fra liste" har noe å vise med en
// gang, uten å være avhengig av Claude/Unsplash.
const DEFAULT_RECIPES = [
  ['Taco', '🌮'],
  ['Spaghetti bolognese', '🍝'],
  ['Fiskegrateng', '🐟'],
  ['Kjøttkaker med brun saus', '🍖'],
  ['Hjemmelaget pizza', '🍕'],
  ['Ovnsbakt laks med poteter', '🐟'],
  ['Kylling i karri', '🍛'],
  ['Pytt i panne', '🥘'],
  ['Pasta carbonara', '🍝'],
  ['Hjemmelaget burger', '🍔'],
  ['Fiskepinner med poteter', '🐟'],
  ['Kjøttboller i tomatsaus', '🍝'],
  ['Pølser med potetmos', '🌭'],
  ['Lasagne', '🍝'],
  ['Wok med kylling', '🥡'],
  ['Kyllingfilet med ris', '🍗'],
  ['Suppe med kjøttboller', '🍲'],
  ['Grillet kylling', '🍗'],
  ['Fish and chips', '🐟'],
  ['Butter chicken', '🍛'],
  ['Pasta med pesto', '🍝'],
  ['Chili con carne', '🌶️'],
  ['Ovnsbakt torsk', '🐟'],
  ['Reinsdyrgryte', '🍲'],
  ['Quesadillas', '🫓'],
  ['Vafler til middag', '🧇'],
  ['Omelett med grønnsaker', '🍳'],
  ['Pannekaker', '🥞'],
  ['Ribbe', '🍖'],
  ['Fiskesuppe', '🍲'],
  ['Kyllingwok med nudler', '🍜'],
  ['Enchiladas', '🌯'],
];

function ensureDefaultDinnerLibrary(familyId) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM dinner_recipes WHERE family_id = ?').get(familyId).n;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO dinner_recipes (family_id, title, emoji) VALUES (?, ?, ?)');
  db.transaction(() => {
    DEFAULT_RECIPES.forEach(([title, emoji]) => insert.run(familyId, title, emoji));
  })();
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
  const {
    date,
    title,
    emoji,
    notes,
    description = null,
    ingredients = null,
    instructions = null,
    photo_url = null,
    source = 'manual',
  } = req.body || {};
  if (!date || !title) {
    return res.status(400).json({ error: 'Dato og tittel er påkrevd' });
  }
  const previous = db.prepare('SELECT * FROM dinner_plans WHERE family_id = ? AND date = ?').get(req.familyId, date);
  const ingredientsJson = ingredients === null && previous ? previous.ingredients_json : JSON.stringify(ingredients || []);
  const instructionsJson = instructions === null && previous ? previous.instructions_json : JSON.stringify(instructions || []);
  db.prepare(
    `INSERT INTO dinner_plans (family_id, date, title, emoji, notes, description, ingredients_json, instructions_json, photo_url, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(family_id, date) DO UPDATE SET
       title = excluded.title,
       emoji = excluded.emoji,
       notes = excluded.notes,
       description = excluded.description,
       ingredients_json = excluded.ingredients_json,
       instructions_json = excluded.instructions_json,
       photo_url = excluded.photo_url,
       source = excluded.source`
  ).run(req.familyId, date, title, emoji || null, Object.hasOwn(req.body, 'notes') ? notes || null : previous?.notes || null, Object.hasOwn(req.body, 'description') ? description : previous?.description || null, ingredientsJson, instructionsJson, Object.hasOwn(req.body, 'photo_url') ? photo_url : previous?.photo_url || null, Object.hasOwn(req.body, 'source') ? source : previous?.source || source);

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
      `INSERT INTO dinner_plans (family_id, date, title, emoji, notes, description, ingredients_json, instructions_json, photo_url, source)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'ai')
       ON CONFLICT(family_id, date) DO UPDATE SET
         title = excluded.title,
         emoji = excluded.emoji,
         description = excluded.description,
         ingredients_json = excluded.ingredients_json,
         instructions_json = excluded.instructions_json,
         photo_url = excluded.photo_url,
         source = excluded.source`
    );
    const dates = days.map((_, i) => addDays(startDate, i));
    db.transaction(() => {
      days.forEach((day, i) => {
        insert.run(
          req.familyId,
          dates[i],
          day.title,
          day.emoji,
          day.description,
          JSON.stringify(day.ingredients),
          JSON.stringify(day.instructions || []),
          day.photo_url
        );
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

// Fyller inn ingredienser/fremgangsmåte (+ bilde) for en middag som allerede
// står på en dag, men mangler oppskriftsdetaljer – f.eks. valgt fra
// biblioteket (kun tittel+emoji) eller skrevet inn for hånd.
router.post('/:date/generate-recipe', async (req, res) => {
  const plan = db.prepare('SELECT * FROM dinner_plans WHERE family_id = ? AND date = ?').get(req.familyId, req.params.date);
  if (!plan) return res.status(404).json({ error: 'Fant ingen middag denne dagen' });
  try {
    const { ingredients, instructions, photo_url } = await generateRecipeDetails(plan.title);
    db.prepare(
      `UPDATE dinner_plans SET ingredients_json = ?, instructions_json = ?, photo_url = COALESCE(?, photo_url)
       WHERE id = ?`
    ).run(JSON.stringify(ingredients), JSON.stringify(instructions), photo_url, plan.id);
    const updated = db.prepare('SELECT * FROM dinner_plans WHERE id = ?').get(plan.id);
    req.app.get('io').to(`family:${req.familyId}`).emit('dinner-plans:update', serializePlan(updated));
    res.json(serializePlan(updated));
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

  res.json(combineIngredients(rows.flatMap(row => JSON.parse(row.ingredients_json || '[]'))));
});

// Legger valgte ingrediens-forslag til handlelisten, samme mønster som
// POST /api/shopping men i batch – hopper over det som allerede står der
// (case-insensitivt) i stedet for å lage duplikater.
router.post('/add-ingredients-to-shopping', (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0 || items.length > 200 || items.some(item => typeof item !== 'string' || item.length > 300)) {
    return res.status(400).json({ error: 'items er påkrevd' });
  }
  const existing = new Set(
    db
      .prepare('SELECT name FROM shopping_items WHERE family_id = ? AND checked = 0')
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
      existing.add(name.toLowerCase());
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
  res.status(201).json({ added, list });
});

// Liste å bla i og velge middager fra, uavhengig av dato – seedes med
// standardutvalget over ved første kall.
router.get('/library', (req, res) => {
  ensureDefaultDinnerLibrary(req.familyId);
  const rows = db.prepare('SELECT * FROM dinner_recipes WHERE family_id = ? ORDER BY title').all(req.familyId);
  res.json(rows);
});

router.post('/library', (req, res) => {
  const { title, emoji } = req.body || {};
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Tittel er påkrevd' });
  }
  const info = db
    .prepare('INSERT INTO dinner_recipes (family_id, title, emoji) VALUES (?, ?, ?)')
    .run(req.familyId, title.trim(), emoji || '🍽️');
  res.status(201).json(db.prepare('SELECT * FROM dinner_recipes WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/library/:id', (req, res) => {
  db.prepare('DELETE FROM dinner_recipes WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  res.status(204).end();
});

router.delete('/:date', (req, res) => {
  const rows = db.prepare('SELECT * FROM dinner_plans WHERE family_id = ? AND date = ?').all(req.familyId, req.params.date);
  const undo = archiveDeletion(req, 'dinner_plans', rows, () => db.prepare('DELETE FROM dinner_plans WHERE family_id = ? AND date = ?').run(req.familyId, req.params.date));
  req.app.get('io').to(`family:${req.familyId}`).emit('dinner-plans:update', { date: req.params.date, deleted: true });
  res.json(undo);
});

export default router;
