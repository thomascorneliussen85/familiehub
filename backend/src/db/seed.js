import { db } from './index.js';

function isoAt(dayOffset, hour, minute = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function today(dayOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

const seedAll = db.transaction(() => {
  db.exec(`
    DELETE FROM chore_completions;
    DELETE FROM chores;
    DELETE FROM calendar_events;
    DELETE FROM shopping_items;
    DELETE FROM quick_items;
    DELETE FROM smart_plugs;
    DELETE FROM gps_positions;
    DELETE FROM messages;
    DELETE FROM family_members;
  `);

  const insertMember = db.prepare(
    `INSERT INTO family_members (name, role, color, avatar, sort_order) VALUES (?, ?, ?, ?, ?)`
  );
  const mor = insertMember.run('Mor', 'voksen', '#ff8fb1', '👩', 1).lastInsertRowid;
  const far = insertMember.run('Far', 'voksen', '#7c9cff', '👨', 2).lastInsertRowid;
  const adelia = insertMember.run('Adelia', 'barn', '#ffd166', '🧒', 3).lastInsertRowid;

  const insertEvent = db.prepare(
    `INSERT INTO calendar_events (member_id, title, start_at, end_at, all_day, location, source)
     VALUES (?, ?, ?, ?, ?, ?, 'local')`
  );
  insertEvent.run(mor, 'Jobbmøte', isoAt(0, 9, 0), isoAt(0, 10, 30), 0, 'Kontoret');
  insertEvent.run(far, 'Handletur', isoAt(0, 17, 0), isoAt(0, 18, 0), 0, 'Kiwi Frekhaug');
  insertEvent.run(adelia, 'Fotballtrening', isoAt(1, 17, 30), isoAt(1, 19, 0), 0, 'Frekhaug idrettsplass');
  insertEvent.run(adelia, 'Bursdag hos Emma', isoAt(2, 13, 0), isoAt(2, 16, 0), 0, 'Emmas hus');
  insertEvent.run(mor, 'Tannlege', isoAt(3, 8, 30), isoAt(3, 9, 15), 0, 'Frekhaug tannklinikk');
  insertEvent.run(far, 'Foreldremøte', isoAt(4, 18, 0), isoAt(4, 19, 30), 0, 'Skolen');
  insertEvent.run(null, 'Familiemiddag', isoAt(5, 16, 0), isoAt(5, 17, 0), 0, 'Hjemme');

  const insertChore = db.prepare(
    `INSERT INTO chores (member_id, title, recurrence, due_date, stars) VALUES (?, ?, ?, ?, ?)`
  );
  const choreRydde = insertChore.run(adelia, 'Rydde rommet', 'weekly:mon', null, 2).lastInsertRowid;
  insertChore.run(adelia, 'Dekke bord', 'daily', null, 1);
  insertChore.run(adelia, 'Mate katten', 'daily', null, 1);
  insertChore.run(mor, 'Vaske bad', 'weekly:sat', null, 1);
  insertChore.run(far, 'Vaske bil', 'weekly:sun', null, 1);
  insertChore.run(adelia, 'Lekser', 'daily', null, 2);

  const insertCompletion = db.prepare(
    `INSERT INTO chore_completions (chore_id, completed_on, stars_awarded) VALUES (?, ?, ?)`
  );
  insertCompletion.run(choreRydde, today(-7), 2);
  insertCompletion.run(choreRydde, today(-14), 2);

  const insertShopping = db.prepare(
    `INSERT INTO shopping_items (name, checked, position) VALUES (?, ?, ?)`
  );
  insertShopping.run('Melk', 0, 1);
  insertShopping.run('Brød', 0, 2);
  insertShopping.run('Bananer', 0, 3);
  insertShopping.run('Havregryn', 1, 4);

  const insertQuick = db.prepare(`INSERT OR IGNORE INTO quick_items (name, icon) VALUES (?, ?)`);
  [
    ['Melk', '🥛'],
    ['Brød', '🍞'],
    ['Egg', '🥚'],
    ['Bananer', '🍌'],
    ['Ost', '🧀'],
    ['Kaffe', '☕'],
    ['Poteter', '🥔'],
    ['Toalettpapir', '🧻'],
  ].forEach(([name, icon]) => insertQuick.run(name, icon));

  const insertPlug = db.prepare(
    `INSERT INTO smart_plugs (name, ip, is_on, last_watt, online, last_seen_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`
  );
  insertPlug.run('Kaffetrakter', '192.168.1.50', 0, 0, 0);
  insertPlug.run('Julelys stue', '192.168.1.51', 1, 42.5, 0);

  db.prepare(
    `INSERT INTO gps_positions (device_name, lat, lon, speed, battery, accuracy, recorded_at, source)
     VALUES ('Adelia', ?, ?, 0, 78, 12, datetime('now'), 'fallback')`
  ).run(60.5104, 5.2402);

  db.prepare(
    `INSERT INTO messages (author, text, color, pos_x, pos_y, rotation) VALUES (?, ?, ?, ?, ?, ?)`
  ).run('Mor', 'Husk gymposen på fredag! 🎒', '#fff59d', 40, 40, -2);
  db.prepare(
    `INSERT INTO messages (author, text, color, pos_x, pos_y, rotation) VALUES (?, ?, ?, ?, ?, ?)`
  ).run('Far', 'Handler inn til helgen 🛒', '#a5d8ff', 260, 90, 3);
});

seedAll();

console.log('✅ Demodata lagt inn i FamilieHub-databasen.');
