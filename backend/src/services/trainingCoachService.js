import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/index.js';
import { config } from '../config.js';

const COACH_SYSTEM_PROMPT =
  'Du er en erfaren, varm og motiverende norsk personlig trener. Analyser denne ' +
  'treningsøkten opp mot personens tidligere økter av samme type. Kommenter konkret ' +
  'på endringer i puls, tempo, distanse eller varighet, fremhev fremgang der det er ' +
  'grunnlag for det, og gi 2-3 konkrete, konstruktive råd for neste økt. Maks 150 ord, ' +
  'naturlig muntlig språk, ærlig men oppmuntrende. Aldri gi medisinske råd eller ' +
  'diagnoser – ved tegn til skade eller smerte i dataen, oppfordre til å oppsøke lege ' +
  'eller fysioterapeut i stedet for å vurdere det selv.';

const PLAN_SYSTEM_PROMPT =
  'Du er en erfaren, varm og motiverende norsk personlig trener som setter opp ' +
  'treningsplaner basert på faktisk treningshistorikk. Analyser mønsteret i økter, ' +
  'frekvens, puls og fremgang over tid. Lag en konkret plan for de neste 1-2 ukene ' +
  '(hvilke typer økter, omtrentlig frekvens og intensitet), pluss 3-4 generelle ' +
  'anbefalinger. Naturlig muntlig norsk, strukturert med korte avsnitt, maks 300 ord. ' +
  'Aldri gi medisinske råd eller diagnoser – oppfordre til å oppsøke lege eller ' +
  'fysioterapeut ved tegn til skade, smerte eller overbelastning i dataen.';

function formatDuration(seconds) {
  if (seconds == null) return 'ukjent';
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

function formatDistance(meters) {
  if (!meters) return null;
  return `${(meters / 1000).toFixed(2)} km`;
}

function summarizeActivity(a) {
  const parts = [
    `${a.name} (${a.activity_type}), ${new Date(a.start_time.replace(' ', 'T')).toLocaleDateString('nb-NO')}`,
    `varighet ${formatDuration(a.duration_seconds)}`,
  ];
  if (formatDistance(a.distance_m)) parts.push(formatDistance(a.distance_m));
  if (a.avg_hr) parts.push(`snittpuls ${Math.round(a.avg_hr)}`);
  if (a.max_hr) parts.push(`makspuls ${Math.round(a.max_hr)}`);
  if (a.calories) parts.push(`${Math.round(a.calories)} kcal`);
  if (a.avg_speed_mps) parts.push(`snittfart ${(a.avg_speed_mps * 3.6).toFixed(1)} km/t`);
  if (a.vo2max) parts.push(`VO2max ${a.vo2max}`);
  if (a.aerobic_effect) parts.push(`aerob effekt ${a.aerobic_effect}`);
  return parts.join(', ');
}

async function callClaude(systemPrompt, userText, maxTokens) {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userText }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.text?.trim() || '';
}

// Analyserer én treningsøkt opp mot de siste øktene av samme type, og cacher
// resultatet i training_coach_notes. familyId sjekkes mot øktens egen
// family_id slik at én familie aldri kan be om en coach-kommentar for en
// annen families treningsdata via en gjettet garmin_activity_id.
export async function analyzeActivity(garminActivityId, familyId) {
  const activity = db
    .prepare('SELECT * FROM garmin_activities WHERE garmin_activity_id = ? AND family_id = ?')
    .get(garminActivityId, familyId);
  if (!activity) throw new Error('Treningsøkt ikke funnet');

  const history = db
    .prepare(
      `SELECT * FROM garmin_activities
       WHERE family_id = ? AND activity_type = ? AND garmin_activity_id != ?
       ORDER BY start_time DESC LIMIT 6`
    )
    .all(familyId, activity.activity_type, garminActivityId);

  let commentary;
  if (config.anthropicApiKey) {
    try {
      const userText =
        `Denne økten:\n${summarizeActivity(activity)}\n\n` +
        (history.length > 0
          ? `De ${history.length} siste øktene av samme type:\n` +
            history.map((h) => `- ${summarizeActivity(h)}`).join('\n')
          : 'Personen har ingen tidligere økter av denne typen registrert ennå – dette er den første.');
      commentary = await callClaude(COACH_SYSTEM_PROMPT, userText, 500);
      if (!commentary) throw new Error('Tomt svar fra Claude');
    } catch (err) {
      console.error('Treningscoach: Claude-kall feilet, bruker demokommentar.', err.message);
      commentary = buildDemoCommentary(activity, history);
    }
  } else {
    commentary = buildDemoCommentary(activity, history);
  }

  db.prepare(
    `INSERT INTO training_coach_notes (garmin_activity_id, commentary, generated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(garmin_activity_id) DO UPDATE SET commentary = excluded.commentary, generated_at = datetime('now')`
  ).run(garminActivityId, commentary);

  return db.prepare('SELECT * FROM training_coach_notes WHERE garmin_activity_id = ?').get(garminActivityId);
}

// training_coach_notes har ingen egen family_id – eierskap sjekkes via
// garmin_activities (som har family_id) i samme spørring, slik at et
// gjettet garmin_activity_id fra en annen familie aldri gir treff.
export function getCoachNote(garminActivityId, familyId) {
  return db
    .prepare(
      `SELECT n.* FROM training_coach_notes n
       JOIN garmin_activities a ON a.garmin_activity_id = n.garmin_activity_id
       WHERE n.garmin_activity_id = ? AND a.family_id = ?`
    )
    .get(garminActivityId, familyId);
}

function buildDemoCommentary(activity, history) {
  const parts = [`Bra jobba med «${activity.name}»! 💪`];
  if (history.length > 0) {
    const avgHr = history.filter((h) => h.avg_hr).map((h) => h.avg_hr);
    const avgHrMean = avgHr.length ? avgHr.reduce((a, b) => a + b, 0) / avgHr.length : null;
    if (avgHrMean && activity.avg_hr) {
      const diff = activity.avg_hr - avgHrMean;
      parts.push(
        diff < -2
          ? `Snittpulsen din var lavere enn de siste ${history.length} øktene av samme type – et tegn på bedre form!`
          : diff > 2
          ? `Snittpulsen var litt høyere enn vanlig denne gangen – kan tyde på en tøffere økt eller at du ikke var helt uthvilt.`
          : `Pulsen lå på nivå med de siste øktene dine.`
      );
    }
  } else {
    parts.push('Dette er den første registrerte økten av denne typen – nå har vi noe å sammenligne med fremover!');
  }
  parts.push('Husk oppvarming og god restitusjon til neste økt. Fortsett den gode jobben! 🏅');
  return parts.join(' ');
}

// Genererer en fremtidsrettet treningsplan basert på nylig treningshistorikk
// (siste 30 øktene). Regenereres på forespørsel; hver kjøring lagres som en
// ny rad, nyeste rad er gjeldende plan.
export async function generateTrainingPlan(familyId) {
  const activities = db
    .prepare('SELECT * FROM garmin_activities WHERE family_id = ? ORDER BY start_time DESC LIMIT 30')
    .all(familyId);

  let content;
  if (activities.length === 0) {
    content =
      'Ingen treningsøkter er synkronisert ennå. Trykk 🔄 for å synkronisere med Garmin Connect, ' +
      'så kan treningscoachen sette opp en plan basert på dine faktiske økter.';
  } else if (config.anthropicApiKey) {
    try {
      const userText = 'Treningshistorikk (nyeste først):\n' + activities.map((a) => `- ${summarizeActivity(a)}`).join('\n');
      content = await callClaude(PLAN_SYSTEM_PROMPT, userText, 900);
      if (!content) throw new Error('Tomt svar fra Claude');
    } catch (err) {
      console.error('Treningsplan: Claude-kall feilet, bruker demoplan.', err.message);
      content = buildDemoPlan(activities);
    }
  } else {
    content = buildDemoPlan(activities);
  }

  const info = db
    .prepare('INSERT INTO training_plans (family_id, content, activity_count) VALUES (?, ?, ?)')
    .run(familyId, content, activities.length);
  return db.prepare('SELECT * FROM training_plans WHERE id = ?').get(info.lastInsertRowid);
}

export function getLatestTrainingPlan(familyId) {
  return db.prepare('SELECT * FROM training_plans WHERE family_id = ? ORDER BY id DESC LIMIT 1').get(familyId);
}

function buildDemoPlan(activities) {
  const typeCounts = {};
  for (const a of activities) {
    typeCounts[a.activity_type] = (typeCounts[a.activity_type] || 0) + 1;
  }
  const typesSummary = Object.entries(typeCounts)
    .map(([type, count]) => `${count}x ${type}`)
    .join(', ');
  return (
    `Basert på de siste ${activities.length} øktene dine (${typesSummary}), foreslår vi en variert uke ` +
    'med 3-4 økter: en rolig utholdenhetsøkt, en intervall- eller styrkeøkt, og minst én hviledag mellom ' +
    'harde økter. Prioriter god søvn og nok væske. Lytt til kroppen – reduser intensiteten hvis pulsen ' +
    'holder seg unormalt høy over flere økter. 📋 Demoplan (ingen Claude API-nøkkel satt).'
  );
}
