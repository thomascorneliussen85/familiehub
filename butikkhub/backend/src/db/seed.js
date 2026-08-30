import bcrypt from 'bcrypt';
import { db } from './index.js';

const existing = db.prepare('SELECT id FROM butikker LIMIT 1').get();
if (existing) {
  console.log('Det finnes allerede en butikk i databasen, hopper over seeding.');
  process.exit(0);
}

const butikkId = db.prepare("INSERT INTO butikker (navn) VALUES ('Bunnpris Testbutikk')").run().lastInsertRowid;
const passwordHash = bcrypt.hashSync('demo12345', 10);
db.prepare('INSERT INTO users (butikk_id, email, password_hash) VALUES (?, ?, ?)').run(
  butikkId,
  'butikksjef@example.com',
  passwordHash
);
db.prepare("INSERT INTO settings (butikk_id, key, value) VALUES (?, 'butikksjef_pin', '1234')").run(butikkId);

const ansatteData = [
  ['Kari Nordmann', 'butikksjef', '#e5484d', ['Ansvarlig alkoholsalg']],
  ['Ola Hansen', 'assistent', '#5b8def', ['Ansvarlig alkoholsalg']],
  ['Mia Larsen', 'medarbeider', '#3ecf8e', []],
  ['Jonas Berg', 'medarbeider', '#e6b422', []],
  ['Sofie Andersen', 'medarbeider', '#a855f7', []],
  ['Emil Kristiansen', 'medarbeider', '#f97316', []],
  ['Nora Johansen', 'medarbeider', '#06b6d4', []],
  ['Lucas Olsen', 'medarbeider', '#ec4899', []],
  ['Ingrid Pedersen', 'medarbeider', '#84cc16', []],
  ['Markus Haugen', 'medarbeider', '#6366f1', []],
];
const insertAnsatt = db.prepare(
  'INSERT INTO ansatte (butikk_id, navn, rolle, farge, sertifiseringer) VALUES (?, ?, ?, ?, ?)'
);
const ansattIds = ansatteData.map(
  ([navn, rolle, farge, sert]) => insertAnsatt.run(butikkId, navn, rolle, farge, JSON.stringify(sert)).lastInsertRowid
);

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const insertSkift = db.prepare(
  'INSERT INTO skift (butikk_id, ansatt_id, dato, start_tid, slutt_tid, type) VALUES (?, ?, ?, ?, ?, ?)'
);
for (let day = 0; day < 7; day++) {
  const dato = todayPlus(day);
  insertSkift.run(butikkId, ansattIds[0], dato, '07:00', '15:00', 'apne');
  insertSkift.run(butikkId, ansattIds[1 + (day % 8)], dato, '09:00', '17:00', 'normal');
  insertSkift.run(butikkId, ansattIds[2 + (day % 7)], dato, '14:00', '21:00', 'lukke');
}

const oppgaveData = [
  ['Sjekk og logg fryser-/kjøletemperaturer', 'apne'],
  ['Fyll opp melk og meieri', 'apne'],
  ['Rydd og vask bakeravdeling', 'apne'],
  ['Sett ut kampanjeskilt', 'normal'],
  ['Rydd hylle for hylle', 'normal'],
  ['Tøm søppel og papp', 'lukke'],
  ['Lås kasser og tell kassaoppgjør', 'lukke'],
  ['Sett alarm og lås dører', 'lukke'],
];
const insertOppgave = db.prepare('INSERT INTO oppgaver (butikk_id, tittel, skift_type, sort_order) VALUES (?, ?, ?, ?)');
oppgaveData.forEach(([tittel, skiftType], i) => insertOppgave.run(butikkId, tittel, skiftType, i));

const insertEnhet = db.prepare(
  'INSERT INTO temperaturenheter (butikk_id, navn, min_temp, max_temp, sort_order) VALUES (?, ?, ?, ?, ?)'
);
const fryser1 = insertEnhet.run(butikkId, 'Fryser 1', -22, -18, 0).lastInsertRowid;
const kjolMeieri = insertEnhet.run(butikkId, 'Kjøl meieri', 2, 6, 1).lastInsertRowid;
const kjolFerskvare = insertEnhet.run(butikkId, 'Kjøl ferskvare', 0, 4, 2).lastInsertRowid;
db.prepare('INSERT INTO temperaturmalinger (enhet_id, temperatur, malt_av, avvik) VALUES (?, ?, ?, 0)').run(
  fryser1,
  -19.5,
  ansattIds[0]
);
db.prepare('INSERT INTO temperaturmalinger (enhet_id, temperatur, malt_av, avvik) VALUES (?, ?, ?, 1)').run(
  kjolMeieri,
  7.2,
  ansattIds[0]
);
db.prepare('INSERT INTO temperaturmalinger (enhet_id, temperatur, malt_av, avvik) VALUES (?, ?, ?, 0)').run(
  kjolFerskvare,
  2.8,
  ansattIds[0]
);

db.prepare('INSERT INTO beskjeder (butikk_id, forfatter, tekst) VALUES (?, ?, ?)').run(
  butikkId,
  'Kari',
  'Kasse 2 har vært treg i dag – meldt til support, kommer tirsdag.'
);

db.prepare(
  `INSERT INTO kalender_hendelser (butikk_id, tittel, start_at, slutt_at, all_day, notat) VALUES (?, ?, ?, ?, 1, ?)`
).run(butikkId, 'Varetelling', `${todayPlus(3)}T00:00:00`, `${todayPlus(3)}T23:59:59`, 'Hele butikken, start kl 07.');

db.prepare('INSERT INTO bestillinger (butikk_id, vare, notat, meldt_av) VALUES (?, ?, ?, ?)').run(
  butikkId,
  'Lettmelk 1,5L',
  'Nesten tomt i kjøledisken',
  ansattIds[2]
);

console.log('Seeding ferdig.');
console.log('Innlogging: butikksjef@example.com / demo12345');
console.log('Butikksjef-PIN: 1234');
process.exit(0);
