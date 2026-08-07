// Små kuraterte lister for "dagens sitat" (voksne) og "morsom fakta"
// (barneprofiler). Ingen ekstern API nødvendig – roterer deterministisk per
// dato, slik at alle i familien ser samme sitat/fakta samme dag.

const QUOTES = [
  'Den beste tiden å plante et tre var for tjue år siden. Den nest beste tiden er nå.',
  'Man trenger ikke å se hele trappen, bare ta det første trinnet.',
  'Livet er det som skjer mens du er opptatt med å legge andre planer.',
  'Det er aldri for sent å bli den du kunne ha vært.',
  'Fall ned sju ganger, reis deg åtte.',
  'Gjør det du kan, med det du har, der du er.',
  'En rolig morgen legger tonen for en god dag.',
  'Små steg hver dag fører til store forandringer over tid.',
  'Det du gjør i dag kan forbedre alle dine morgendager.',
  'Glede finnes ikke i å eie ting, men i å oppdage dem.',
];

const FUN_FACTS = [
  'Visste du at honning aldri blir dårlig? Arkeologer har funnet 3000 år gammel honning som fortsatt kan spises!',
  'En blekksprut har tre hjerter og blått blod.',
  'Bananer er egentlig bær, mens jordbær ikke er det!',
  'Det tar solen omtrent 8 minutter å sende lys til jorden.',
  'Sommerfugler smaker med føttene sine.',
  'En dag på Venus er lengre enn ett år på Venus.',
  'Hjertet ditt slår omtrent 100 000 ganger hver eneste dag.',
  'Isbjørner har svart hud under den hvite pelsen.',
  'Sjiraffer sover bare 1-2 timer i døgnet.',
  'Det finnes flere stjerner i verdensrommet enn sandkorn på alle jordens strender.',
];

function pickForDate(list, dateStr) {
  const dayNumber = Math.floor(new Date(`${dateStr}T00:00:00`).getTime() / 86400000);
  const index = ((dayNumber % list.length) + list.length) % list.length;
  return list[index];
}

export function getDailyQuote(dateStr) {
  return pickForDate(QUOTES, dateStr);
}

export function getDailyFunFact(dateStr) {
  return pickForDate(FUN_FACTS, dateStr);
}
