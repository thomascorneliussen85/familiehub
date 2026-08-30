-- ButikkHub: skjermløsning for lager/pauserom i en dagligvarebutikk. Samme
-- multi-tenant-mønster som FamilieHub (butikker ~ families, ansatte ~
-- family_members – ETT innlogget brukernavn/passord per butikk for selve
-- nettbrettet, individuelle ansatte velges i UI per handling, ikke egen
-- innlogging per person, akkurat som familiemedlemmer i FamilieHub).

CREATE TABLE IF NOT EXISTS butikker (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  navn        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  butikk_id      INTEGER NOT NULL REFERENCES butikker(id) ON DELETE CASCADE,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Generisk nøkkel/verdi-innstillinger per butikk, samme mønster som
-- FamilieHub sin settings-tabell – brukes bl.a. til butikksjef-PIN.
CREATE TABLE IF NOT EXISTS settings (
  butikk_id  INTEGER NOT NULL REFERENCES butikker(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT,
  PRIMARY KEY (butikk_id, key)
);

CREATE TABLE IF NOT EXISTS ansatte (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  butikk_id        INTEGER NOT NULL REFERENCES butikker(id) ON DELETE CASCADE,
  navn             TEXT NOT NULL,
  rolle             TEXT NOT NULL DEFAULT 'medarbeider', -- 'butikksjef' | 'assistent' | 'medarbeider'
  telefon          TEXT,
  sertifiseringer  TEXT NOT NULL DEFAULT '[]', -- JSON-liste, f.eks. ["Ansvarlig alkoholsalg"]
  farge            TEXT NOT NULL DEFAULT '#7c9cff', -- for visuell gjenkjenning i turnus/UI, samme idé som family_members.color
  aktiv            INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ansatte_butikk ON ansatte(butikk_id);

-- Turnusliste: ett skift = én ansatt, én dato, ett tidsrom.
CREATE TABLE IF NOT EXISTS skift (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  butikk_id   INTEGER NOT NULL REFERENCES butikker(id) ON DELETE CASCADE,
  ansatt_id   INTEGER NOT NULL REFERENCES ansatte(id) ON DELETE CASCADE,
  dato        TEXT NOT NULL, -- YYYY-MM-DD
  start_tid   TEXT NOT NULL, -- HH:MM
  slutt_tid   TEXT NOT NULL, -- HH:MM
  type        TEXT NOT NULL DEFAULT 'normal', -- 'apne' | 'lukke' | 'normal'
  notat       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_skift_butikk_dato ON skift(butikk_id, dato);

-- Oppgaver: faste rutineoppgaver (maler), knyttet til skifttype heller enn
-- én bestemt person – "fullføringer" logges separat per dag, samme
-- struktur som FamilieHub sin chores/chore_completions.
CREATE TABLE IF NOT EXISTS oppgaver (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  butikk_id    INTEGER NOT NULL REFERENCES butikker(id) ON DELETE CASCADE,
  tittel       TEXT NOT NULL,
  skift_type   TEXT NOT NULL DEFAULT 'alle', -- 'apne' | 'lukke' | 'alle'
  aktiv        INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oppgaver_butikk ON oppgaver(butikk_id);

CREATE TABLE IF NOT EXISTS oppgave_fullforinger (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  oppgave_id       INTEGER NOT NULL REFERENCES oppgaver(id) ON DELETE CASCADE,
  dato             TEXT NOT NULL, -- YYYY-MM-DD - "dagens periode", samme idé som chore_completions.completed_on
  fullfort_av      INTEGER REFERENCES ansatte(id) ON DELETE SET NULL,
  fullfort_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(oppgave_id, dato)
);

-- Beskjedtavle for skiftoverlevering.
CREATE TABLE IF NOT EXISTS beskjeder (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  butikk_id   INTEGER NOT NULL REFERENCES butikker(id) ON DELETE CASCADE,
  forfatter   TEXT,
  tekst       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_beskjeder_butikk ON beskjeder(butikk_id, created_at);

-- Temperaturlogging: lovpålagt (internkontrollforskriften/Mattilsynet).
-- Enhetene (fryser/kjøl) konfigureres én gang med akseptable grenseverdier;
-- hver måling flagges automatisk som avvik hvis den er utenfor.
CREATE TABLE IF NOT EXISTS temperaturenheter (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  butikk_id   INTEGER NOT NULL REFERENCES butikker(id) ON DELETE CASCADE,
  navn        TEXT NOT NULL, -- f.eks. "Fryser 1", "Kjøl meieri"
  min_temp    REAL NOT NULL,
  max_temp    REAL NOT NULL,
  aktiv       INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_temperaturenheter_butikk ON temperaturenheter(butikk_id);

CREATE TABLE IF NOT EXISTS temperaturmalinger (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  enhet_id     INTEGER NOT NULL REFERENCES temperaturenheter(id) ON DELETE CASCADE,
  temperatur   REAL NOT NULL,
  malt_av      INTEGER REFERENCES ansatte(id) ON DELETE SET NULL,
  malt_at      TEXT NOT NULL DEFAULT (datetime('now')),
  avvik        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_temperaturmalinger_enhet ON temperaturmalinger(enhet_id, malt_at);

-- Kalender: varetelling, HMS-runder, personalmøter, kampanjestart o.l.
CREATE TABLE IF NOT EXISTS kalender_hendelser (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  butikk_id   INTEGER NOT NULL REFERENCES butikker(id) ON DELETE CASCADE,
  tittel      TEXT NOT NULL,
  start_at    TEXT NOT NULL,
  slutt_at    TEXT NOT NULL,
  all_day     INTEGER NOT NULL DEFAULT 0,
  notat       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kalender_butikk ON kalender_hendelser(butikk_id, start_at);

-- Bestillinger: "tomt for noe, må bestilles inn ekstra av det" – enkel
-- status-arbeidsflyt, samme prinsipp som handlelisten i FamilieHub, med
-- ett ekstra sporingssteg siden dette er en jobb-kontekst (hvem meldte det).
CREATE TABLE IF NOT EXISTS bestillinger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  butikk_id   INTEGER NOT NULL REFERENCES butikker(id) ON DELETE CASCADE,
  vare        TEXT NOT NULL,
  notat       TEXT,
  status      TEXT NOT NULL DEFAULT 'meldt', -- 'meldt' | 'bestilt' | 'mottatt'
  meldt_av    INTEGER REFERENCES ansatte(id) ON DELETE SET NULL,
  meldt_at    TEXT NOT NULL DEFAULT (datetime('now')),
  bestilt_at  TEXT,
  mottatt_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_bestillinger_butikk ON bestillinger(butikk_id, status);
