import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { db } from '../db/index.js';

const REPORT_HOMEWORK_TOOL = {
  name: 'report_homework',
  description: 'Rapporter leksene som ble funnet i bildet av lekseplanen.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Alle lekser funnet i bildet. Tom liste hvis ingen ble funnet.',
        items: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: 'Fag, f.eks. "Matte", "Norsk", "Engelsk"' },
            task: { type: 'string', description: 'Hva som skal gjøres, f.eks. "s. 45-47" eller "Lese kapittel 3"' },
            due_date: { type: 'string', description: 'Dato leksa skal være ferdig til, format YYYY-MM-DD' },
            member_name: {
              type: 'string',
              description: 'Navnet på barnet lekseplanen gjelder, hvis det står i bildet',
            },
          },
          required: ['subject', 'due_date'],
        },
      },
    },
    required: ['items'],
  },
};

function findMemberByName(familyId, name) {
  if (!name) return null;
  const members = db.prepare('SELECT * FROM family_members WHERE family_id = ?').all(familyId);
  const lower = name.toLowerCase();
  return members.find((m) => m.name.toLowerCase().includes(lower) || lower.includes(m.name.toLowerCase())) || null;
}

// Leser et bilde av en lekseplan/ukeplan fra skolen og finner leksene i det,
// ved hjelp av Claudes bildeforståelse. Oppretter IKKE gjøremålene selv –
// returnerer dem til frontend for gjennomsyn/bekreftelse først, siden
// bildetolkning kan feiltolke ting (feil dag, uklar håndskrift osv.).
export async function scanHomeworkImage(base64Image, mediaType, familyId) {
  if (!config.anthropicApiKey) {
    throw new Error('Skanning av bilder krever en Claude API-nøkkel i .env (ANTHROPIC_API_KEY)');
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const today = new Date().toISOString().slice(0, 10);

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 2048,
    system:
      'Du leser bilder av lekseplaner/ukeplaner fra norske skoler (ofte en tabell med ukedager og fag) og ' +
      'finner alle konkrete lekser i dem, med hvilken dag/dato de skal være ferdig til. Bruk ' +
      'report_homework-verktøyet til å rapportere det du finner. Ukeplaner viser typisk hvilken uke det ' +
      'gjelder øverst – bruk det til å regne ut riktig dato for hver ukedag. Hvis årstall mangler, anta ' +
      'inneværende eller neste år (det som gir en dato nærmest fram i tid). Ikke finn på lekser som ikke ' +
      'faktisk står i bildet.',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
          { type: 'text', text: `Dagens dato er ${today}. Finn alle lekser i bildet av lekseplanen.` },
        ],
      },
    ],
    tools: [REPORT_HOMEWORK_TOOL],
    tool_choice: { type: 'tool', name: 'report_homework' },
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  const items = toolUse?.input?.items || [];

  return items.map((i) => {
    const member = findMemberByName(familyId, i.member_name);
    const title = i.task ? `${i.subject}: ${i.task}` : i.subject;
    return {
      title,
      due_date: i.due_date,
      member_id: member?.id ?? null,
      member_name: member?.name ?? i.member_name ?? null,
    };
  });
}
