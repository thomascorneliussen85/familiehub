import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { searchFoodPhoto, isUnsplashConfigured } from './unsplashClient.js';

const PLAN_WEEK_TOOL = {
  name: 'foresla_ukemeny',
  description: 'Rapporter et forslag til middagsmeny for 7 dager på rad',
  input_schema: {
    type: 'object',
    properties: {
      days: {
        type: 'array',
        minItems: 7,
        maxItems: 7,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Kort navn på retten, f.eks. "Kremet kyllingsuppe"' },
            emoji: { type: 'string', description: 'Ett enkelt emoji som passer retten' },
            description: { type: 'string', description: 'Én kort setning som beskriver retten' },
            ingredients: {
              type: 'array',
              items: { type: 'string' },
              description: 'Ingrediensliste med mengde per stykk, f.eks. "500 g kjøttdeig", "2 stk paprika"',
            },
            instructions: {
              type: 'array',
              items: { type: 'string' },
              description: 'Fremgangsmåte, ett kort steg per element (f.eks. "Brun kjøttdeigen i en gryte")',
            },
          },
          required: ['title', 'emoji', 'description', 'ingredients', 'instructions'],
        },
      },
    },
    required: ['days'],
  },
};

const SYSTEM_PROMPT = `Du er en praktisk middagsplanlegger for en norsk barnefamilie.
Foreslå middag for 7 dager på rad ved å bruke verktøyet foresla_ukemeny.

Regler:
- Variasjon: bland kjøtt, fisk og vegetar gjennom uken, aldri samme hovedprotein to dager på rad.
- Praktisk for hverdagen: de fleste rettene bør ta 30-45 minutter, med vanlige ingredienser fra en norsk dagligvarebutikk.
- Familievennlig: ikke for sterkt krydret, ingredienser barn typisk liker.
- Ingredienslisten skal være det som trengs for ÉN middag til en vanlig familie (ca. 4 porsjoner), med mengde oppgitt naturlig på norsk (f.eks. "4 dl kremfløte", "1 boks hermetiske tomater", "500 g kyllingfilet").
- Ikke foreslå retter som står i "unngå"-listen i forespørselen (nylig servert).
- Svar KUN via verktøyet, ingen fritekst.`;

// Global Claude-nøkkel (samme mønster som assistantService.js/briefService.js)
// – i motsetning til Økonomi-modulen som bruker en per-familie krypterte
// nøkkel, siden ukemenyforslag ikke er like sensitivt som transaksjonsdata.
export async function generateWeekPlan({ startDate, existingTitles = [] }) {
  if (!config.anthropicApiKey) {
    throw new Error('Ukemeny-forslag krever en Claude API-nøkkel i .env (ANTHROPIC_API_KEY)');
  }
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const userContent = JSON.stringify({
    startDate,
    unngå: existingTitles,
  });

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [PLAN_WEEK_TOOL],
    tool_choice: { type: 'tool', name: 'foresla_ukemeny' },
    messages: [{ role: 'user', content: userContent }],
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  const days = toolUse?.input?.days || [];
  if (days.length === 0) {
    throw new Error('Klarte ikke å generere en ukemeny akkurat nå – prøv igjen');
  }

  // Bildesøk kjøres parallelt (ikke sekvensielt) siden det er opptil 7
  // uavhengige kall – og feiler aldri hele planen selv om noen bilder mangler.
  const photos = isUnsplashConfigured()
    ? await Promise.all(days.map((d) => searchFoodPhoto(d.title)))
    : days.map(() => null);

  return days.map((d, i) => ({ ...d, photo_url: photos[i] || null }));
}

const REPORT_RECIPE_TOOL = {
  name: 'rapporter_oppskrift',
  description: 'Rapporter ingredienser og fremgangsmåte for retten.',
  input_schema: {
    type: 'object',
    properties: {
      ingredients: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ingrediensliste for ca. 4 porsjoner, med mengde, f.eks. "500 g kjøttdeig"',
      },
      instructions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Fremgangsmåte, ett kort steg per element',
      },
    },
    required: ['ingredients', 'instructions'],
  },
};

// Fyller inn ingredienser/fremgangsmåte (+ bilde hvis Unsplash er
// konfigurert) for én enkelt rett i etterkant – brukes når en middag ble
// valgt fra biblioteket (kun tittel+emoji) eller skrevet inn manuelt uten
// full oppskrift, og familien senere åpner den og vil se detaljene.
export async function generateRecipeDetails(title) {
  if (!config.anthropicApiKey) {
    throw new Error('Oppskriftsgenerering krever en Claude API-nøkkel i .env (ANTHROPIC_API_KEY)');
  }
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 1024,
    system:
      'Du lager enkle, familievennlige oppskrifter for norske hjemmemiddager. Bruk verktøyet ' +
      'rapporter_oppskrift til å svare. Ingredienser skal være for ca. 4 porsjoner med mengde oppgitt ' +
      'naturlig på norsk. Fremgangsmåten skal være korte, konkrete steg – ikke for detaljert.',
    tools: [REPORT_RECIPE_TOOL],
    tool_choice: { type: 'tool', name: 'rapporter_oppskrift' },
    messages: [{ role: 'user', content: `Lag en oppskrift for retten "${title}".` }],
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  if (!toolUse) {
    throw new Error('Klarte ikke å lage en oppskrift akkurat nå – prøv igjen');
  }

  const photo_url = isUnsplashConfigured() ? await searchFoodPhoto(title) : null;
  return { ingredients: toolUse.input.ingredients || [], instructions: toolUse.input.instructions || [], photo_url };
}
