# FamilieHub Fleet

Sentral driftstjeneste for å administrere alle utplasserte FamilieHub-
installasjoner: se hvilke hubber som er i live, styre hvilke moduler som er
på/av per kunde, håndtere abonnementsstatus, og rulle ut nye versjoner trygt.

**Les [PERSONVERN.md](./PERSONVERN.md) først** – beskriver nøyaktig hva
denne tjenesten får og ikke får vite om en families hub.

## Struktur

```
fleet/
  backend/    Express + SQLite API (port 4100 i dev)
  frontend/   React-dashbord (Vite, port 5180 i dev)
  shared/     telemetryWhitelist.js – importeres av BÅDE backend her OG
              hoved-appens fleetClient.js, se PERSONVERN.md
  PERSONVERN.md
  Dockerfile  Ett image for Cloud Run (bygger frontend, serverer statisk fra backend)
```

## Kjøre lokalt

```bash
cd fleet/backend
cp .env.example .env
# Sett FLEET_ADMIN_USERNAME og generer FLEET_ADMIN_PASSWORD_HASH:
node src/scripts/hashPassword.mjs <ditt-passord>
# Generer FLEET_SETUP_TOKEN og JWT_SECRET, f.eks.: openssl rand -hex 24
npm install
npm run seed   # oppretter to demo-hubber
npm run dev    # http://localhost:4100

cd ../frontend
npm install
npm run dev    # http://localhost:5180 (proxyer /api mot :4100)
```

## Database: SQLite nå, Postgres for ekte produksjonsdrift

Backenden bruker SQLite (better-sqlite3) som standard – fint for lokal
utvikling og demo. **Viktig for ekte Cloud Run-drift**: Cloud Run-instanser er
flyktige (disk nullstilles ved omstart/skalering til null/ny utrulling), så en
lokal SQLite-fil overlever IKKE pålitelig der i produksjon. For faktisk drift
av mange kunders hubber, bytt `DB_PATH`-baserte SQLite-oppsettet ut med en
ekte Postgres-tilkobling (f.eks. Cloud SQL) før dette tas i bruk for virkelige
kunder – databaselaget (`src/db/`) er holdt enkelt nok til at det er en
overkommelig etterfølgende jobb, men er ikke gjort i denne runden.

## Deploy til Google Cloud Run

```bash
gcloud run deploy familiehub-fleet \
  --source fleet \
  --region europe-north1 \
  --set-env-vars NODE_ENV=production,CORS_ORIGIN=https://<din-cloud-run-url> \
  --set-secrets JWT_SECRET=fleet-jwt-secret:latest,FLEET_ADMIN_PASSWORD_HASH=fleet-admin-hash:latest,FLEET_SETUP_TOKEN=fleet-setup-token:latest
```

(Dockerfile-en ligger i `fleet/Dockerfile` – pek `--source` til `fleet`-mappen
som vist over, eller bygg og push imaget manuelt med `docker build -f
fleet/Dockerfile .` fra repo-roten.)

## Registrere en ny hub

To måter:

1. **Fra dashbordet** (enklest): logg inn → "+ Legg til hub" → fyll inn
   kundenavn. Hub-ID og API-nøkkel vises ÉN gang – lim dem rett inn i
   kundens `.env`.
2. **Fra kommandolinjen på selve hub-en** (når du sitter fysisk der):
   ```bash
   cd backend
   node ../fleet-register.mjs
   ```
   Se hoved-README for detaljer om oppsettskommandoen.
