import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const REPORT_CLUTTER_TOOL = {
  name: 'report_clutter',
  description: 'Rapporter alt som bør ryddes bort i rommet som er avbildet.',
  input_schema: {
    type: 'object',
    properties: {
      room_summary: {
        type: 'string',
        description: 'Kort, hyggelig oppsummering av hvor ryddig/rotete rommet er (én setning)',
      },
      items: {
        type: 'array',
        description: 'Alt som bør ryddes bort eller settes på plass. Tom liste hvis rommet allerede er ryddig.',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description:
                'Kort, konkret ryddeoppgave som beskriver HVOR tingen er, f.eks. "Heng opp jakken som ligger på gulvet i gangen" eller "Sett glassene på kjøkkenbenken i oppvaskmaskinen"',
            },
            stars: {
              type: 'integer',
              description: 'Hvor mye jobb oppgaven er, fra 1 (veldig lite) til 3 (en del jobb)',
            },
          },
          required: ['title'],
        },
      },
    },
    required: ['items'],
  },
};

// Leser ett eller flere bilder av et rom (enten ett foto, eller noen bilder
// plukket ut fra en video filmet av rommet – se lib/videoFrames.js i
// frontend) og bruker Claude til å finne konkrete ting som bør ryddes bort.
// Oppretter IKKE gjøremål selv – returnerer funnene til frontend for
// gjennomsyn/bekreftelse først, samme mønster som calendarScanService og
// homeworkScanService.
export async function scanRoomForClutter(base64Images, mediaType) {
  if (!config.anthropicApiKey) {
    throw new Error('Romskanning krever en Claude API-nøkkel i .env (ANTHROPIC_API_KEY)');
  }
  if (!base64Images?.length) {
    throw new Error('Ingen bilder å skanne');
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const imageBlocks = base64Images.map((data) => ({
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data },
  }));
  const intro =
    base64Images.length > 1
      ? `Dette er ${base64Images.length} bilder tatt fra en video av samme rom, fra litt forskjellige vinkler.`
      : 'Dette er ett bilde av et rom.';

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 2048,
    system:
      'Du ser på bilde(r) av et rom hjemme hos en familie, og finner konkrete ting som bør ryddes bort eller ' +
      'settes på plass (f.eks. klær eller leker på gulvet, rot på bord/benker, oppvask, søppel, sko som ikke ' +
      'står i hylla). Hvis flere bilder viser samme rom fra ulike vinkler, slå sammen funnene og ikke rapporter ' +
      'det samme to ganger. Ikke kommenter møblering, innredning eller ting som tydelig ligger fremme med ' +
      'vilje (pyntegjenstander, bøker i en bokhylle, planter). Vær konkret om HVOR tingen er, ikke bare hva det ' +
      'er, slik at den som rydder vet hva som menes uten å se bildet igjen. Ikke finn på ting som ikke faktisk ' +
      'er synlige i bildet/bildene. Bruk report_clutter-verktøyet.',
    messages: [
      {
        role: 'user',
        content: [...imageBlocks, { type: 'text', text: `${intro} Finn alt som bør ryddes bort.` }],
      },
    ],
    tools: [REPORT_CLUTTER_TOOL],
    tool_choice: { type: 'tool', name: 'report_clutter' },
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  const input = toolUse?.input || { items: [] };

  return {
    summary: input.room_summary || null,
    items: (input.items || []).map((i) => ({
      title: i.title,
      stars: Math.min(3, Math.max(1, Number.isFinite(i.stars) ? i.stars : 1)),
    })),
  };
}
