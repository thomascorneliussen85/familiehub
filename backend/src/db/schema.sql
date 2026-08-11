-- FamilieHub database-skjema (SQLite)

-- Én rad per familie ("tenant") – all data i appen hører til nøyaktig én
-- familie, og hver forespørsel skopes til innlogget brukers family_id.
CREATE TABLE IF NOT EXISTS families (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Innlogging (foreldre/voksne). Barn har ingen egen konto – de er fortsatt
-- bare profiler i family_members, valgt direkte på den delte skjermen.
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id      INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS family_members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'voksen', -- 'voksen' | 'barn'
  color       TEXT NOT NULL DEFAULT '#7c9cff',
  avatar      TEXT,                            -- emoji eller initial
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Personlig kalendertilkobling (Google/iCloud) per familiemedlem. Kun manuell
-- synkronisering – ingen automatisk polling i bakgrunnen. Skopes transitivt
-- via member_id -> family_members, trenger ikke egen family_id-kolonne.
CREATE TABLE IF NOT EXISTS calendar_connections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id       INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL, -- 'google' | 'icloud'
  label           TEXT,           -- e-post/konto-navn, vises i UI
  credentials     TEXT NOT NULL,  -- JSON: {refresh_token} for google, {appleId, appPassword} for icloud
  last_synced_at  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- family_id er direkte her (ikke bare via member_id) fordi member_id kan være
-- NULL for familie-felles avtaler uten ett bestemt medlem.
CREATE TABLE IF NOT EXISTS calendar_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id       INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id       INTEGER REFERENCES family_members(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  start_at        TEXT NOT NULL, -- ISO datetime
  end_at          TEXT NOT NULL, -- ISO datetime
  all_day         INTEGER NOT NULL DEFAULT 0,
  location        TEXT,
  notes           TEXT,
  source          TEXT NOT NULL DEFAULT 'local', -- 'local' | 'google' | 'icloud'
  google_event_id TEXT,
  recurrence      TEXT NOT NULL DEFAULT 'once', -- 'once' | 'weekly'
  external_id     TEXT,    -- unik id fra Google/iCloud, brukes til å unngå duplikater ved synk
  connection_id   INTEGER REFERENCES calendar_connections(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Samme begrunnelse som calendar_events: member_id kan være NULL.
CREATE TABLE IF NOT EXISTS chores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id    INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id    INTEGER REFERENCES family_members(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  recurrence   TEXT NOT NULL DEFAULT 'once', -- 'once' | 'daily' | 'weekly:mon' | 'weekly:tue' ...
  due_date     TEXT,                          -- kun relevant for 'once'
  stars        INTEGER NOT NULL DEFAULT 1,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Registrerer hver fullførte forekomst av et gjøremål (håndterer gjentakelse).
-- Skopes transitivt via chore_id -> chores.
CREATE TABLE IF NOT EXISTS chore_completions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  chore_id       INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
  completed_on   TEXT NOT NULL, -- YYYY-MM-DD
  stars_awarded  INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(chore_id, completed_on)
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  checked     INTEGER NOT NULL DEFAULT 0,
  checked_at  TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quick_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id  INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  icon       TEXT,
  UNIQUE(family_id, name)
);

CREATE TABLE IF NOT EXISTS smart_plugs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id    INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  ip           TEXT NOT NULL,
  is_on        INTEGER NOT NULL DEFAULT 0,
  last_watt    REAL,
  last_seen_at TEXT,
  online       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gps_positions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id    INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  device_name  TEXT NOT NULL DEFAULT 'Adelia',
  lat          REAL NOT NULL,
  lon          REAL NOT NULL,
  speed        REAL,
  battery      REAL,
  accuracy     REAL,
  recorded_at  TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'traccar', -- 'traccar' | 'xplora' | 'fallback'
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  author      TEXT,
  text        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#fff59d',
  pos_x       REAL NOT NULL DEFAULT 0,
  pos_y       REAL NOT NULL DEFAULT 0,
  rotation    REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Nøkkel-verdi-innstillinger per familie (bl.a. forsidebilde, geofence,
-- vær-/buss-/strømpris-lokasjon, relay-hub-identitet). PK er sammensatt siden
-- samme nøkkel (f.eks. "dashboard_cover_photo") finnes én gang per familie.
CREATE TABLE IF NOT EXISTS settings (
  family_id  INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT,
  PRIMARY KEY (family_id, key)
);

CREATE TABLE IF NOT EXISTS play_locations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '📍',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(family_id, label)
);

-- Skopes transitivt via child_id -> family_members.
CREATE TABLE IF NOT EXISTS play_status (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id    INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  location    TEXT NOT NULL,
  emoji       TEXT,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  ended_at    TEXT
);

-- Andre (eksterne) familier denne familien er paret med via relay-tjenesten.
-- Hver familie i denne installasjonen har sin egen liste og sin egen
-- relay-hub-identitet (lagret i settings), slik at paring skjer per familie,
-- ikke per hele installasjonen.
CREATE TABLE IF NOT EXISTS friend_families (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id     INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  pairing_code  TEXT,
  paired_at     TEXT,
  approved      INTEGER NOT NULL DEFAULT 0,
  friend_hub_id TEXT
);

-- rtsp_url er '' (tom streng) for kameraer oppdaget av en kamera-bro (se
-- camera_bridges) – broen kjenner selv RTSP-legitimasjonen lokalt, den
-- lagres aldri i skyen. rtsp_url brukes bare av det gamle manuelle
-- oppsettet, som fortsatt fungerer for noen som kjører FamilieHub direkte
-- på hjemmenettet.
CREATE TABLE IF NOT EXISTS cameras (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id     INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  rtsp_url      TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active', -- 'active' | 'pending' (oppdaget, venter på navn/godkjenning)
  local_ip      TEXT,
  manufacturer  TEXT,
  model         TEXT,
  serial        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Smart handleliste: prissammenligning/tilbudsmatch mot Kassalapp (kassal.app).
-- product_matches holder de 3 beste produkttreffene per handleliste-linje;
-- product_prices holder prisen i hver nærliggende butikk for hvert treff.
-- family_id står direkte her (ikke bare via shopping_item_id) av samme grunn
-- som andre steder i skjemaet: raskere/sikrere skoping uten en ekstra join.
CREATE TABLE IF NOT EXISTS product_matches (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id         INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  shopping_item_id  INTEGER NOT NULL REFERENCES shopping_items(id) ON DELETE CASCADE,
  ean               TEXT,
  product_name      TEXT,
  image_url         TEXT,
  rank              INTEGER NOT NULL DEFAULT 0, -- 0 = beste treff, 1, 2 = nr. to/tre
  matched_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_prices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id    INTEGER NOT NULL REFERENCES product_matches(id) ON DELETE CASCADE,
  store_name  TEXT NOT NULL,
  store_id    INTEGER,
  price       REAL NOT NULL,
  is_offer    INTEGER NOT NULL DEFAULT 0, -- utledet fra prishistorikk, se smartShoppingService.js
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Låser en handleliste-TEKST (ikke selve raden, som forsvinner når varen
-- krysses av/fjernes) til et bestemt produkt – "Dette mener jeg"-knappen.
-- item_text er normalisert (trim + lowercase) slik at "Melk" og "melk"
-- gjenbruker samme lås neste gang noen skriver ordet på nytt.
CREATE TABLE IF NOT EXISTS item_locks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id     INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  item_text     TEXT NOT NULL,
  ean           TEXT NOT NULL,
  product_name  TEXT,
  locked_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(family_id, item_text)
);

CREATE INDEX IF NOT EXISTS idx_product_matches_item ON product_matches(shopping_item_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_match ON product_prices(match_id);

-- Nøkkel-verdi-innstillinger for HELE installasjonen (ikke per familie) –
-- foreløpig kun VAPID-nøkkelparet som signerer web push-varsler. Generert
-- automatisk ved første oppstart (se services/pushService.js) og lagret her
-- slik at det er stabilt på tvers av restarter, uten manuelt .env-steg.
CREATE TABLE IF NOT EXISTS app_config (
  key    TEXT PRIMARY KEY,
  value  TEXT
);

-- Web push-abonnement per nettleser/enhet en familiemedlem har skrudd på
-- varsler fra. Ett medlem kan ha flere (telefon + nettbrett), og samme
-- endpoint dukker aldri opp to ganger.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  keys_json   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Shelly-enheter (Gen2/"Plus"-serien) funnet av kamera-broen på hjemmenettet
-- – samme "oppdaget, venter på navn"-mønster som cameras. device_type styrer
-- oppfølging: 'smoke' får automatisk satt opp webhook for alarm-hendelser,
-- se services/cameraBridgeRegistry.js/sockets/cameraBridge.js.
-- webhook_token er hemmeligheten i webhook-URL-en enheten selv roper til –
-- ingen innlogging mulig fra en fysisk enhet, så URL-en ER autentiseringen
-- (samme mønster som f.eks. Slack sine incoming webhooks).
CREATE TABLE IF NOT EXISTS shelly_devices (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id      INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'active'
  device_type    TEXT NOT NULL DEFAULT 'unknown', -- 'smoke' | 'unknown'
  local_ip       TEXT,
  shelly_id      TEXT,
  model          TEXT,
  mac            TEXT UNIQUE,
  webhook_token  TEXT UNIQUE,
  alarm          INTEGER NOT NULL DEFAULT 0,
  alarm_at       TEXT,
  last_event     TEXT,
  last_event_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- En "bro" er en liten lokal tjeneste (typisk på en alltid-på Raspberry Pi
-- hjemme) som familien kobler til FamilieHub-skyen. Den finner Tapo-kameraer
-- på hjemmenettet automatisk (ONVIF) og henter/videresender RTSP-video – noe
-- selve sky-serveren aldri kan gjøre siden den ikke er på hjemmenettet.
-- api_key_hash er sha256 av en engangsvist nøkkel, samme mønster som
-- relay/src/crypto.js sin hashApiKey.
CREATE TABLE IF NOT EXISTS camera_bridges (
  id            TEXT PRIMARY KEY,
  family_id     INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  api_key_hash  TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT 'Kamera-bro',
  last_seen_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dinner_plans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  date        TEXT NOT NULL, -- YYYY-MM-DD
  title       TEXT NOT NULL,
  emoji       TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(family_id, date)
);

-- Garmin er foreløpig én delt konto for hele installasjonen (satt opp via
-- .env av installasjonens eier), ikke per-familie – se README. Ingen
-- family_id her ennå; egen kreditiv-lagring per familie er en senere jobb.
CREATE TABLE IF NOT EXISTS garmin_activities (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  garmin_activity_id  INTEGER NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  activity_type       TEXT,
  start_time          TEXT NOT NULL,
  duration_seconds    REAL,
  distance_m          REAL,
  calories            REAL,
  avg_hr              REAL,
  max_hr              REAL,
  elevation_gain_m    REAL,
  elapsed_seconds     REAL,
  moving_seconds      REAL,
  elevation_loss_m    REAL,
  min_elevation_m     REAL,
  avg_speed_mps       REAL,
  max_speed_mps       REAL,
  avg_cadence         REAL,
  max_cadence         REAL,
  vo2max              REAL,
  aerobic_effect      REAL,
  anaerobic_effect    REAL,
  avg_stride_length_m REAL,
  lap_count           INTEGER,
  device_name         TEXT,
  raw_json            TEXT, -- hele den rå Garmin-payloaden, for detaljsiden og AI-treningscoach
  synced_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AI-treningscoach: kommentar per treningsøkt (sammenligner med tidligere økter
-- av samme type), cachet slik at den ikke regenereres ved hver visning.
CREATE TABLE IF NOT EXISTS training_coach_notes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  garmin_activity_id  INTEGER NOT NULL UNIQUE REFERENCES garmin_activities(garmin_activity_id) ON DELETE CASCADE,
  commentary          TEXT NOT NULL,
  generated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AI-generert fremtidsrettet treningsplan basert på nylig treningshistorikk.
-- Regenereres på forespørsel; nyeste rad er gjeldende plan.
CREATE TABLE IF NOT EXISTS training_plans (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  content        TEXT NOT NULL,
  activity_count INTEGER NOT NULL DEFAULT 0,
  generated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Morgenbrief: hvilke moduler som er med i den personlige morgenrapporten,
-- per familiemedlem. Rad opprettes med standardverdier når medlemmet først
-- åpner innstillingene, eller ved seeding. Skopes transitivt via member_id.
CREATE TABLE IF NOT EXISTS brief_settings (
  member_id       INTEGER PRIMARY KEY REFERENCES family_members(id) ON DELETE CASCADE,
  module_calendar INTEGER NOT NULL DEFAULT 1,
  module_weather  INTEGER NOT NULL DEFAULT 1,
  module_power    INTEGER NOT NULL DEFAULT 0,
  module_chores   INTEGER NOT NULL DEFAULT 1,
  module_news     INTEGER NOT NULL DEFAULT 0,
  module_market   INTEGER NOT NULL DEFAULT 0,
  module_verse    INTEGER NOT NULL DEFAULT 0,
  module_quote    INTEGER NOT NULL DEFAULT 0,
  module_fact     INTEGER NOT NULL DEFAULT 0, -- kun barneprofil: én morsom fakta
  tickers         TEXT NOT NULL DEFAULT '[]', -- JSON-array, f.eks. ["EQNR.OL","^GSPC"]
  rss_feed_urls   TEXT NOT NULL DEFAULT '[]', -- JSON-array; tom = standard NRK-feed
  preferred_time  TEXT NOT NULL DEFAULT '07:00',
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ferdig generert (eller demo-) brief, cachet per person per dag. Skopes
-- transitivt via member_id.
CREATE TABLE IF NOT EXISTS daily_briefs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  brief_date  TEXT NOT NULL, -- YYYY-MM-DD
  content     TEXT NOT NULL,
  modules     TEXT NOT NULL DEFAULT '[]', -- JSON-array over moduler brukt (for ikonvisning)
  is_demo     INTEGER NOT NULL DEFAULT 0,
  heard       INTEGER NOT NULL DEFAULT 0,
  heard_at    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(member_id, brief_date)
);

-- Kuratert liste over bibelvers til "dagens vers"-modulen. Delt/global
-- referansedata, ikke per-familie. fallback_text_no brukes som demo-
-- /offline-fallback siden bible-api.com ikke tilbyr norsk oversettelse (den
-- engelske teksten hentes live og oversettes av AI-en når briefen settes sammen).
CREATE TABLE IF NOT EXISTS bible_verses (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reference         TEXT NOT NULL UNIQUE, -- f.eks. "Salme 23:1"
  fallback_text_no  TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_daily_briefs_member_date ON daily_briefs(member_id, brief_date);

-- DoktorNå (fiktiv demo-legetjeneste – ingen ekte legetimer, kun en
-- simulert booking-opplevelse siden familien ikke har valgt en reell
-- leverandør ennå). Legelisten er delt/global referansedata.
CREATE TABLE IF NOT EXISTS telemedicine_doctors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  specialty   TEXT NOT NULL,
  avatar      TEXT NOT NULL DEFAULT '🩺',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- family_id er direkte her av samme grunn som calendar_events/chores:
-- member_id kan være NULL.
CREATE TABLE IF NOT EXISTS telemedicine_bookings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id         INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id         INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  doctor_id         INTEGER NOT NULL REFERENCES telemedicine_doctors(id),
  start_at          TEXT NOT NULL,
  end_at            TEXT NOT NULL,
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'booked', -- 'booked' | 'cancelled'
  calendar_event_id INTEGER REFERENCES calendar_events(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_telemedicine_bookings_start ON telemedicine_bookings(start_at);
CREATE INDEX IF NOT EXISTS idx_telemedicine_bookings_doctor ON telemedicine_bookings(doctor_id, start_at);

-- Belønningssystem: foreldre setter opp belønninger (med bilde) som
-- familiemedlemmer kan løse inn stjerner de har opptjent fra gjøremål mot.
CREATE TABLE IF NOT EXISTS rewards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  star_cost   INTEGER NOT NULL,
  image       TEXT, -- filnavn i reward-images/<family_id>/, NULL = ikke satt
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- reward_title lagres som et øyeblikksbilde ved innløsning, slik at
-- historikken forblir meningsfull selv om belønningen senere endres/slettes.
-- Skopes transitivt via member_id.
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id    INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  reward_id    INTEGER REFERENCES rewards(id) ON DELETE SET NULL,
  reward_title TEXT NOT NULL,
  stars_spent  INTEGER NOT NULL,
  redeemed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_member ON reward_redemptions(member_id);

CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_at);
CREATE INDEX IF NOT EXISTS idx_chore_completions_chore ON chore_completions(chore_id);
CREATE INDEX IF NOT EXISTS idx_gps_positions_recorded ON gps_positions(recorded_at);
CREATE INDEX IF NOT EXISTS idx_garmin_activities_start ON garmin_activities(start_time);
CREATE INDEX IF NOT EXISTS idx_play_status_child ON play_status(child_id);
CREATE INDEX IF NOT EXISTS idx_play_status_active ON play_status(ended_at, expires_at);

-- Tilbakemelding fra familier (typisk vennefamilier som tester appen), slik at
-- installasjonens eier kan se og følge opp feil/ønsker. Alle innloggede kan
-- sende inn; kun eierfamilien kan lese listen (samme owner-family-mønster som
-- garmin.js/relay.js).
CREATE TABLE IF NOT EXISTS feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  message     TEXT NOT NULL,
  page        TEXT,
  resolved    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);

-- Veikart over kommende funksjoner ("Dette kommer framover"). Satt opp av
-- installasjonens eier, men synlig for alle familier – delt/global
-- referansedata, ikke per-familie (samme mønster som telemedicine_doctors).
CREATE TABLE IF NOT EXISTS roadmap_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'planned', -- 'planned' | 'in_progress' | 'done'
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Vennefamilie-paring MELLOM familier på samme installasjon (i motsetning
-- til friend_families, som er paring mot en helt separat installasjon via
-- relay-tjenesten). Man søker opp en familie ved navn og sender en
-- forespørsel som må godkjennes – uten det ville alle som noensinne
-- oppretter en familie på samme lenke automatisk se hverandres barns
-- lekestatus, som ikke er ønskelig.
CREATE TABLE IF NOT EXISTS local_friend_pairs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  family_a_id  INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  family_b_id  INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  paired_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(family_a_id, family_b_id)
);

CREATE TABLE IF NOT EXISTS local_friend_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  from_family_id  INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  to_family_id    INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(from_family_id, to_family_id)
);

-- Forespørsel om å bli med i en EKSISTERENDE familie (i stedet for å
-- opprette en ny) – f.eks. en ektefelle som vil ha sin egen innlogging i
-- familien. Passordet hashes med en gang; selve users-raden opprettes først
-- når familien godkjenner forespørselen (se auth.js).
CREATE TABLE IF NOT EXISTS family_join_requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id      INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Merk: indekser på family_id-kolonner (family_members, calendar_events, chores,
-- shopping_items, users) opprettes i JS i db/index.js, ETTER en ev. migrering –
-- de kan ikke stå her siden kolonnen ikke finnes ennå på en database som
-- migreres fra før flerfamilie-støtten fantes.
