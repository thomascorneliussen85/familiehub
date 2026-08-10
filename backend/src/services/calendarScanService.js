import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { db } from '../db/index.js';

const REPORT_EVENTS_TOOL = {
  name: 'report_events',
  description: 'Rapporter avtalene/hendelsene som ble funnet i bildet.',
  input_schema: {
    type: 'object',
    properties: {
      events: {
        type: 'array',
        description: 'Alle avtaler/hendelser funnet i bildet. Tom liste hvis ingen ble funnet.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Tittel/hva avtalen gjelder' },
            date: { type: 'string', description: 'Dato i format YYYY-MM-DD' },
            time: {
              type: 'string',
              description: 'Klokkeslett i format HH:MM (24-timers). Utelates hvis ikke oppgitt eller heldags.',
            },
            location: { type: 'string', description: 'Sted, hvis oppgitt' },
            member_name: {
              type: 'string',
              description: 'Navnet på personen avtalen gjelder, hvis det står i bildet',
            },
          },
          required: ['title', 'date'],
        },
      },
    },
    required: ['events'],
  },
};

function findMemberByName(familyId, name) {
  if (!name) return null;
  const members = db.prepare('SELECT * FROM family_members WHERE family_id = ?').all(familyId);
  const lower = name.toLowerCase();
  return members.find((m) => m.name.toLowerCase().includes(lower) || lower.includes(m.name.toLowerCase())) || null;
}

// Leser et bilde av en timeplan/oppslag/invitasjon o.l. og finner avtaler i
// det, ved hjelp av Claudes bildeforståelse. Oppretter IKKE avtalene selv –
// returnerer dem til frontend for gjennomsyn/bekreftelse først, siden
// bildetolkning kan feiltolke ting (feil år, uklar tekst osv.).
export async function scanCalendarImage(base64Image, mediaType, familyId) {
  if (!config.anthropicApiKey) {
    throw new Error('Skanning av bilder krever en Claude API-nøkkel i .env (ANTHROPIC_API_KEY)');
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const today = new Date().toISOString().slice(0, 10);

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 2048,
    system:
      'Du leser bilder av timeplaner, oppslag, lapper, invitasjoner og lignende, og finner alle konkrete ' +
      'avtaler/hendelser med dato i dem. Bruk report_events-verktøyet til å rapportere det du finner. ' +
      'Hvis et årstall mangler, anta inneværende eller neste år (det som gir en dato nærmest fram i tid). ' +
      'Ikke finn på avtaler som ikke faktisk står i bildet.',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
          { type: 'text', text: `Dagens dato er ${today}. Finn alle avtaler/hendelser i bildet.` },
        ],
      },
    ],
    tools: [REPORT_EVENTS_TOOL],
    tool_choice: { type: 'tool', name: 'report_events' },
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  const events = toolUse?.input?.events || [];

  return events.map((e) => {
    const member = findMemberByName(familyId, e.member_name);
    return {
      title: e.title,
      date: e.date,
      time: e.time || null,
      location: e.location || null,
      member_id: member?.id ?? null,
      member_name: member?.name ?? e.member_name ?? null,
    };
  });
}
