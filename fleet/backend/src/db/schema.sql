-- FamilieHub Fleet – sentral driftstjeneste for administrasjon av
-- utplasserte hubber. Se /fleet/PERSONVERN.md for hva denne databasen
-- får lov til å inneholde (kun teknisk telemetri, ALDRI familieinnhold).

CREATE TABLE IF NOT EXISTS hubs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  hub_id          TEXT NOT NULL UNIQUE,
  api_key_hash    TEXT NOT NULL,
  kundenavn       TEXT NOT NULL,
  kontakt_epost   TEXT,
  adresse_notat   TEXT,
  installert_dato TEXT NOT NULL DEFAULT (date('now')),
  notater         TEXT,
  aktiv           INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Kun ETT rad-øyeblikksbilde per hub (siste kjente status) + en egen
-- historikk-tabell for enkel graf over tid. sist_sett settes av tjenesten
-- selv (server-tidspunkt ved mottak), ALDRI av det hub-en sender.
CREATE TABLE IF NOT EXISTS hub_status (
  hub_id                    TEXT PRIMARY KEY REFERENCES hubs(hub_id) ON DELETE CASCADE,
  sist_sett                 TEXT NOT NULL,
  app_versjon               TEXT,
  oppetid_sekunder          REAL,
  fri_diskplass_mb          REAL,
  minnebruk_prosent         REAL,
  antall_tilkoblede_enheter INTEGER,
  os_versjon                TEXT
);

CREATE TABLE IF NOT EXISTS hub_status_history (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  hub_id                    TEXT NOT NULL REFERENCES hubs(hub_id) ON DELETE CASCADE,
  sist_sett                 TEXT NOT NULL,
  oppetid_sekunder          REAL,
  fri_diskplass_mb          REAL,
  minnebruk_prosent         REAL,
  antall_tilkoblede_enheter INTEGER
);
CREATE INDEX IF NOT EXISTS idx_hub_status_history_hub ON hub_status_history(hub_id, sist_sett);

CREATE TABLE IF NOT EXISTS hub_config (
  hub_id             TEXT PRIMARY KEY REFERENCES hubs(hub_id) ON DELETE CASCADE,
  abonnement_status  TEXT NOT NULL DEFAULT 'aktiv', -- 'aktiv' | 'utlopt' | 'pause'
  moduler_json       TEXT NOT NULL DEFAULT '[]',
  oppdateringskanal  TEXT NOT NULL DEFAULT 'stabil', -- 'stabil' | 'test'
  onsket_app_versjon TEXT,
  config_versjon     INTEGER NOT NULL DEFAULT 1,
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hub_errors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  hub_id      TEXT NOT NULL REFERENCES hubs(hub_id) ON DELETE CASCADE,
  tidspunkt   TEXT NOT NULL DEFAULT (datetime('now')),
  feiltype    TEXT,
  melding     TEXT,
  stacktrace  TEXT
);
CREATE INDEX IF NOT EXISTS idx_hub_errors_hub ON hub_errors(hub_id, tidspunkt);

CREATE TABLE IF NOT EXISTS config_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  hub_id       TEXT NOT NULL REFERENCES hubs(hub_id) ON DELETE CASCADE,
  endret_av    TEXT NOT NULL,
  tidspunkt    TEXT NOT NULL DEFAULT (datetime('now')),
  endring_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_config_history_hub ON config_history(hub_id, tidspunkt);

-- Utrulling: sporer hvilken hub som er utpekt testhub, og når den ble grønn/
-- feilfri, slik at dashbordet kan håndheve 24-timers testperioden før
-- "rull ut til resten" tillates.
CREATE TABLE IF NOT EXISTS rollout_state (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  test_hub_id          TEXT REFERENCES hubs(hub_id) ON DELETE SET NULL,
  test_started_at      TEXT,
  malversjon           TEXT
);
INSERT OR IGNORE INTO rollout_state (id, test_hub_id, test_started_at, malversjon) VALUES (1, NULL, NULL, NULL);
