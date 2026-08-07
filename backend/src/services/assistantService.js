import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { setPlugRelay } from './shellyPoller.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const TOOLS = [
  {
    name: 'create_calendar_event',
    description:
      'Legg til en avtale i familiekalenderen. Bruk denne når noen ber om å legge inn en avtale, time, hendelse el.l. på en dato.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Tittel på avtalen' },
        date: { type: 'string', description: 'Dato i format YYYY-MM-DD' },
        time: { type: 'string', description: 'Klokkeslett i format HH:MM (24-timers). Utelates for en heldagsavtale.' },
        recurrence: {
          type: 'string',
          enum: ['once', 'weekly'],
          description: '"once" for engangsavtale (standard), "weekly" hvis den skal gjenta seg hver uke',
        },
        member_name: { type: 'string', description: 'Navnet på familiemedlemmet avtalen gjelder, hvis nevnt' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'create_chore',
    description: 'Opprett et nytt gjøremål/husarbeid som familien skal gjøre.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        member_name: { type: 'string', description: 'Hvem gjøremålet gjelder, hvis nevnt' },
        schedule: {
          type: 'string',
          enum: ['date', 'weekly', 'anytime'],
          description:
            '"date" = bestemt dag (krever date), "weekly" = ukentlig på en ukedag (krever weekday), "anytime" = ingen bestemt dag, bare må gjøres på et tidspunkt',
        },
        date: { type: 'string', description: 'YYYY-MM-DD, kun når schedule er "date"' },
        weekday: {
          type: 'string',
          enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          description: 'Kun når schedule er "weekly"',
        },
        stars: { type: 'integer', description: 'Antall stjerner gjøremålet er verdt, 1-3. Standard 1.' },
      },
      required: ['title', 'schedule'],
    },
  },
  {
    name: 'create_reward',
    description:
      'Opprett en ny belønning i belønningskatalogen som familiemedlemmer kan løse inn opptjente stjerner mot.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string', description: 'Kort beskrivelse, valgfritt' },
        star_cost: { type: 'integer', description: 'Antall stjerner det koster å løse inn belønningen' },
      },
      required: ['title', 'star_cost'],
    },
  },
  {
    name: 'add_shopping_item',
    description: 'Legg en vare til på handlelisten.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'set_timer',
    description: 'Start en nedtellingstimer som vises på skjermen.',
    input_schema: {
      type: 'object',
      properties: {
        minutes: { type: 'number' },
        label: { type: 'string', description: 'Kort merkelapp for timeren, valgfritt' },
      },
      required: ['minutes'],
    },
  },
  {
    name: 'toggle_smart_plug',
    description: 'Slå en smart-plugg av eller på.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Navnet på pluggen' },
        on: { type: 'boolean' },
      },
      required: ['name', 'on'],
    },
  },
  {
    name: 'get_today_overview',
    description:
      'Hent dagens kalenderavtaler og ugjorte gjøremål. Bruk denne for å svare på spørsmål om hva som skjer i dag.',
    input_schema: { type: 'object', properties: {} },
  },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function findMemberByName(name) {
  if (!name) return null;
  const members = db.prepare('SELECT * FROM family_members').all();
  const lower = name.toLowerCase();
  return members.find((m) => m.name.toLowerCase().includes(lower) || lower.includes(m.name.toLowerCase())) || null;
}

function findPlugByName(name) {
  const plugs = db.prepare('SELECT * FROM smart_plugs').all();
  const lower = (name || '').toLowerCase();
  return plugs.find((p) => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase())) || null;
}

function expandWeeklyForToday(events, dayStartMs, dayEndMs) {
  const result = [];
  for (const e of events) {
    const originalStart = new Date(e.start_at).getTime();
    const duration = new Date(e.end_at).getTime() - originalStart;
    let occStart = originalStart;
    if (occStart < dayStartMs) {
      occStart += Math.ceil((dayStartMs - occStart) / WEEK_MS) * WEEK_MS;
    }
    if (occStart < dayEndMs && occStart + duration > dayStartMs) {
      result.push({ ...e, start_at: new Date(occStart).toISOString() });
    }
  }
  return result;
}

export async function executeTool(name, input, io) {
  switch (name) {
    case 'create_calendar_event': {
      const member = findMemberByName(input.member_name);
      const [y, m, d] = input.date.split('-').map(Number);
      let start;
      let end;
      let allDay;
      if (input.time) {
        const [hh, mm] = input.time.split(':').map(Number);
        start = new Date(y, m - 1, d, hh, mm, 0, 0);
        end = new Date(start);
        end.setHours(end.getHours() + 1);
        allDay = false;
      } else {
        start = new Date(y, m - 1, d, 0, 0, 0, 0);
        end = new Date(start);
        end.setDate(end.getDate() + 1);
        allDay = true;
      }
      const recurrence = input.recurrence === 'weekly' ? 'weekly' : 'once';
      db.prepare(
        `INSERT INTO calendar_events (member_id, title, start_at, end_at, all_day, source, recurrence)
         VALUES (?, ?, ?, ?, ?, 'local', ?)`
      ).run(member?.id ?? null, input.title, start.toISOString(), end.toISOString(), allDay ? 1 : 0, recurrence);
      io.emit('calendar:update', { type: 'created' });
      return { ok: true, title: input.title, member: member?.name ?? null };
    }

    case 'create_chore': {
      const member = findMemberByName(input.member_name);
      const recurrence = input.schedule === 'weekly' ? `weekly:${input.weekday || 'mon'}` : 'once';
      const due_date = input.schedule === 'date' ? input.date : null;
      const stars = Number(input.stars) >= 1 && Number(input.stars) <= 3 ? Number(input.stars) : 1;
      db.prepare('INSERT INTO chores (member_id, title, recurrence, due_date, stars) VALUES (?, ?, ?, ?, ?)').run(
        member?.id ?? null,
        input.title,
        recurrence,
        due_date,
        stars
      );
      io.emit('chores:update');
      return { ok: true, title: input.title, member: member?.name ?? null };
    }

    case 'create_reward': {
      const star_cost = Math.max(1, Number(input.star_cost) || 1);
      db.prepare('INSERT INTO rewards (title, description, star_cost) VALUES (?, ?, ?)').run(
        input.title,
        input.description || null,
        star_cost
      );
      io.emit('rewards:update');
      return { ok: true, title: input.title, star_cost };
    }

    case 'add_shopping_item': {
      const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM shopping_items').get().m;
      db.prepare('INSERT INTO shopping_items (name, position) VALUES (?, ?)').run(input.name.trim(), maxPos + 1);
      io.emit('shopping:update', db.prepare('SELECT * FROM shopping_items ORDER BY checked, position').all());
      return { ok: true, name: input.name };
    }

    case 'set_timer': {
      // Timeren er kun frontend-tilstand (TimerContext) – ingen databaseoperasjon her.
      // Returneres som en clientAction som ruten sender videre til frontend.
      return { ok: true, clientAction: { type: 'set_timer', minutes: input.minutes, label: input.label || '' } };
    }

    case 'toggle_smart_plug': {
      const plug = findPlugByName(input.name);
      if (!plug) return { error: `Fant ingen plugg som heter «${input.name}»` };
      try {
        await setPlugRelay(plug.ip, input.on);
        db.prepare(
          `UPDATE smart_plugs SET is_on = ?, online = 1, last_seen_at = datetime('now') WHERE id = ?`
        ).run(input.on ? 1 : 0, plug.id);
      } catch {
        db.prepare('UPDATE smart_plugs SET online = 0 WHERE id = ?').run(plug.id);
        return { error: `Fikk ikke kontakt med ${plug.name} på ${plug.ip}` };
      }
      io.emit('plugs:update', db.prepare('SELECT * FROM smart_plugs ORDER BY id').all());
      return { ok: true, name: plug.name, on: input.on };
    }

    case 'get_today_overview': {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const onceRows = db
        .prepare(
          `SELECT e.*, m.name AS member_name FROM calendar_events e
           LEFT JOIN family_members m ON m.id = e.member_id
           WHERE e.recurrence = 'once' AND e.start_at < ? AND e.end_at > ?`
        )
        .all(dayEnd.toISOString(), dayStart.toISOString());
      const weeklyBases = db
        .prepare(
          `SELECT e.*, m.name AS member_name FROM calendar_events e
           LEFT JOIN family_members m ON m.id = e.member_id
           WHERE e.recurrence = 'weekly'`
        )
        .all();
      const events = [...onceRows, ...expandWeeklyForToday(weeklyBases, dayStart.getTime(), dayEnd.getTime())].sort(
        (a, b) => new Date(a.start_at) - new Date(b.start_at)
      );

      const today = todayStr();
      const chores = db
        .prepare(
          `SELECT c.*, m.name AS member_name FROM chores c
           LEFT JOIN family_members m ON m.id = c.member_id
           WHERE c.active = 1`
        )
        .all()
        .filter((c) => c.recurrence === 'daily' || c.due_date === today || c.recurrence.startsWith('weekly:'));
      const doneStmt = db.prepare('SELECT 1 FROM chore_completions WHERE chore_id = ? AND completed_on = ?');
      const undoneChores = chores.filter((c) => !doneStmt.get(c.id, today));

      return {
        events: events.map((e) => ({
          title: e.title,
          time: e.all_day ? 'hele dagen' : new Date(e.start_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }),
          member: e.member_name,
        })),
        undone_chores: undoneChores.map((c) => ({ title: c.title, member: c.member_name })),
      };
    }

    default:
      return { error: `Ukjent verktøy: ${name}` };
  }
}

function buildSystemPrompt() {
  const members = db.prepare('SELECT name FROM family_members').all().map((m) => m.name);
  const plugs = db.prepare('SELECT name FROM smart_plugs').all().map((p) => p.name);
  return (
    'Du er en hjelpsom norsk taleassistent innebygd i FamilieHub, en delt familietavle på kjøkkenet. ' +
    'Du kan legge til avtaler i kalenderen, opprette gjøremål, opprette belønninger i belønningskatalogen, ' +
    'legge varer på handlelisten, starte en nedtellingstimer, slå smarte plugger av/på, og svare på hva som ' +
    'skjer i dag. Bruk alltid det aktuelle verktøyet når brukeren ber om en handling som passer – ikke bare ' +
    'beskriv hva du ville gjort. Hvis noe er tvetydig, gjør et rimelig valg fremfor å spørre tilbake, siden ' +
    'dette er en talesamtale uten mulighet for oppfølgingsspørsmål akkurat nå.\n\n' +
    `Dagens dato: ${todayStr()} (bruk denne til å regne ut "i morgen", "på tirsdag" osv.)\n` +
    `Familiemedlemmer: ${members.join(', ') || 'ingen registrert'}\n` +
    `Smarte plugger: ${plugs.join(', ') || 'ingen registrert'}\n\n` +
    'Svar alltid kort og naturlig på norsk til slutt, egnet til å bli lest høyt av en talesyntese. Maks 2 setninger.'
  );
}

// Kjører én taleforespørsel gjennom Claude med verktøy, utfører de verktøyene
// Claude velger, og returnerer et naturlig norsk svar pluss ev. handlinger
// frontend selv må utføre (kun nedtellingstimer, som er ren klienttilstand).
export async function runAssistantCommand(text, io) {
  if (!config.anthropicApiKey) {
    throw new Error('AI-assistenten krever en Claude API-nøkkel i .env (ANTHROPIC_API_KEY)');
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const system = buildSystemPrompt();
  let messages = [{ role: 'user', content: text }];
  const clientActions = [];

  for (let turn = 0; turn < 5; turn += 1) {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      system,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find((b) => b.type === 'text');
      return { reply: textBlock?.text?.trim() || 'Ferdig.', clientActions };
    }

    messages.push({ role: 'assistant', content: response.content });
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const result = await executeTool(block.name, block.input, io);
      if (result?.clientAction) clientActions.push(result.clientAction);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return { reply: 'Jeg fikk ikke helt gjort dette – prøv å si det på en annen måte.', clientActions };
}
