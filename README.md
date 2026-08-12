# FamilieHub

Veggmontert kjøkkenskjerm-app for familien – kalender, gjøremål, handleliste,
smarthjem, GPS-kart, vær/buss, strømpris, stemmestyring, timer, beskjedtavle
og fotoramme, samlet på ett dashbord.

Bygget som monorepo:

- **`frontend/`** – React (Vite) PWA, mørkt tema, touch-vennlig, landskapsmodus
- **`backend/`** – Node.js/Express REST-API + Socket.io for sanntid, SQLite via `better-sqlite3`

## Kom i gang (utvikling)

Krav: Node.js 20 eller nyere, npm.

```bash
# 1. Installer alle avhengigheter (frontend + backend)
npm install

# 2. Kopier miljøvariabler og fyll inn dine egne verdier
cp .env.example .env

# 3. Legg inn demodata (familiemedlemmer, avtaler, gjøremål, handleliste, plugger osv.)
npm run seed

# 4. Start backend og frontend samtidig med hot-reload
npm run dev
```

Frontend kjører da på **http://localhost:5173** (Vite dev-server, proxyer
`/api` og `/socket.io` til backend), backend på **http://localhost:4000**.

Legg egne bilder i `/photos`-mappen for at fotoramme-modusen skal vise noe.

For at 🎤-knappen (talegjenkjenning) skal fungere når appen åpnes fra et
nettbrett via IP-adressen på hjemmenettverket, må Vite serveres over https –
se [`certs/README.md`](certs/README.md) for oppsett (nødvendig kun for
talegjenkjenning; resten av appen fungerer fint over vanlig http).

### Nyttige scripts

| Kommando | Beskrivelse |
|---|---|
| `npm run dev` | Starter backend + frontend med hot-reload |
| `npm run dev:backend` / `npm run dev:frontend` | Start kun én av delene |
| `npm run seed` | Nullstiller og fyller databasen med demodata |
| `npm run build` | Bygger frontend for produksjon (`frontend/dist`) |
| `npm start` | Starter backend i produksjonsmodus |

## Miljøvariabler (`.env`)

Alle nøkler, IP-er og koordinater konfigureres i `.env` – se `.env.example`
for en fullstendig, kommentert liste. De viktigste gruppene:

- **Server**: port, CORS-origin, database-sti
- **Google Calendar**: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (forberedt,
  kalenderen bruker lokal lagring helt til dette fylles inn)
- **Traccar** (GPS-klokke): URL, brukernavn, passord, enhets-ID, polling-intervall
- **Xplora** (GPS-klokke, alternativ til Traccar): telefonnummer/e-post + passord (samme innlogging som Xplora-appen)
- **Geofence**: koordinater + radius for "hjemme"-varsel
- **Vær**: koordinater (standard Frekhaug) + påkrevd User-Agent til api.met.no
- **Buss**: Entur stoppested-ID
- **Strømpris**: prisområde (standard NO5 / Bergen)
- **Fotoramme**: mappe og inaktivitetstid
- **Morgenbrief**: `ANTHROPIC_API_KEY` (valgfri – uten den vises en
  ferdiggenerert demobrief) og `BRIEF_RSS_FEEDS` (standard-nyhetsstrøm)

## "Morgenbrief" – personlig opplest morgenrapport

Hvert familiemedlem kan sette sammen sin egen morgenbrief under
⚙️ → **Morgenbrief**: kalender, vær/buss, strømpris, gjøremål, nyheter,
marked (kun kurser/prosent, aldri anbefalinger), dagens bibelvers og dagens
sitat. Barneprofiler får en forenklet brief (kalender, vær, gjøremål og én
morsom fakta) og har aldri tilgang til nyheter eller marked.

Mellom kl. 05–10 viser dashbordet et «God morgen»-kort med profilknapper for
alle som ikke har hørt briefen sin ennå. Trykk på en profil for å se og høre
briefen (Web Speech API, norsk stemme). Uten `ANTHROPIC_API_KEY` i `.env`
brukes en ferdiggenerert demobrief basert på de samme dataene, slik at
modulen fungerer helt uten AI-nøkkel. Legg inn en nøkkel fra
[console.anthropic.com](https://console.anthropic.com) for ekte AI-genererte
briefer (modell `claude-haiku-4-5`).

## AI-taleassistent

Mikrofonknappen (🎤) øverst er nå en ekte AI-assistent (Claude, `claude-opus-5`)
i stedet for enkel nøkkelord-gjenkjenning. Den forstår naturlig norsk tale og
kan selv utføre handlinger: legge til avtaler i kalenderen, opprette
gjøremål, opprette belønninger, legge varer på handlelisten, starte en
nedtellingstimer, slå smarte plugger av/på, og svare på hva som skjer i dag.
Si f.eks. «legg til tannlegetime for Adelia på tirsdag klokka to» eller
«lag en belønning: kinobesøk for ti stjerner». Krever `ANTHROPIC_API_KEY` i
`.env` (samme nøkkel som Morgenbrief og treningscoachen) – uten den viser
knappen en tydelig feilmelding i stedet for å late som den virker.

## Belønningssystem

Stjerner opptjent fra gjøremål vises tydelig under 🏆 **Belønninger**, per
familiemedlem: total opptjent, denne uken, og gjeldende saldo (opptjent minus
brukt). Under ⚙️ → **Belønninger** kan foreldre legge til belønninger med
tittel, beskrivelse, stjernekostnad og valgfritt bilde. På hovedsiden velger
familiemedlemmet seg selv, trykker "Løs inn" på en belønning de har nok
stjerner til, og saldoen oppdateres med det samme (med en liten
feiringsanimasjon). Historikk over nylige innløsninger vises nederst, og en
feiltrykt innløsning kan angres (refunderer stjernene) fra samme sted i
innstillingene.

## Treningscoach (Garmin)

Under ⌚ **Garmin** kan du trykke på en treningsøkt for å se alle detaljer fra
klokken (puls, fart/tempo, kadens, høydemeter, VO2max, treningseffekt osv.)
pluss en AI-generert treningscoach-kommentar som sammenligner økten med dine
siste økter av samme type. 🧭-knappen i panelhodet åpner en fremtidsrettet
treningsplan basert på nylig treningshistorikk. Begge deler bruker samme
`ANTHROPIC_API_KEY` som Morgenbrief (se over) – uten nøkkel vises en enkel
demokommentar/-plan basert på de samme tallene. Krever at Garmin er
synkronisert (`GARMIN_USERNAME`/`GARMIN_PASSWORD` i `.env`).

## Økonomimodul – personlig økonomi

Under 💰 **Økonomi**-kortet på dashbordet vises et lettvekts, PIN-frie
"nivå 1"-sammendrag (budsjett-status som trafikklys, sum brukt, kommende
faste regninger de neste 14 dagene, dagens strømpris) – trygt å vise fram
uten opplåsing, siden det aldri inneholder saldoer eller enkelttransaksjoner.
Trykk på kortet for å låse opp full oversikt (foreldre-PIN, samme som
Enheter/Belønninger) med kontoer, transaksjoner, budsjett per kategori,
diagrammer og en AI-generert ukesbrief + chat. Nivå 2 låser seg automatisk
igjen etter 2 minutter uten aktivitet.

Modulen har to uavhengige datakilder:

- **CSV-import** (fungerer med det samme, ingen ekstra oppsett): last opp en
  kontoutskrift under **Opplasting**, bekreft hvilke kolonner som er
  dato/beløp/motpart i veiviseren (den gjetter ofte riktig automatisk), og
  transaksjonene kategoriseres selv (Claude, med gjenkjenning av tidligere
  sette kategorier som gratis "cache" – ingen kontonummer eller navn sendes
  til Claude, kun motpart/beløp/dato).
- **Enable Banking** (ekte, automatisk kontosynk) – se eget avsnitt under.

### Krav

- `FINANCE_ENCRYPTION_KEY` i `.env` – **må** settes før noen nøkler
  (Claude/Enable Banking) kan lagres. Generer med:
  ```bash
  openssl rand -hex 32
  ```
- Claude-nøkkelen til Økonomimodulen settes **per familie** i appen (⚙️
  Økonomi → Oppsett), i motsetning til Morgenbrief/AI-assistenten som bruker
  `ANTHROPIC_API_KEY` fra `.env`. Uten nøkkel fungerer CSV-import og budsjett
  fint, men kategorisering/ukesbrief/chat viser demo-innhold i stedet.

### CSV-eksport – hvor finner jeg den i banken?

Nettbankenes menyer endrer seg fra tid til annen, så bruk dette som en
pekepinn – uansett hvilke kolonner filen har, bekrefter du dem selv i
opplastingsveiviseren, så et lite avvik i banken sin meny knekker ingenting:

| Bank | Vanlig plassering |
|---|---|
| DNB | Konto → velg konto → «Transaksjoner» → eksporter/last ned (CSV) |
| Sparebanken Vest | Nettbank → konto → «Kontoutskrift»/«Transaksjoner» → eksporter |
| Bulder Bank | App/nettbank → konto → transaksjonsliste → del/eksporter som fil |
| Sbanken | Nettbank → konto → «Vis flere transaksjoner» → eksporter til CSV/Excel |
| Nordea | Nettbank → konto → «Kontoutskrift» → velg periode → last ned CSV |

Filer med semikolon eller komma som skilletegn, norsk tallformat
(`1 234,56`), og både UTF-8- og Latin-1-kodede filer støttes automatisk.

### Enable Banking – ekte kontotilkobling (avansert, valgfritt)

Enable Banking gir automatisk daglig kontosynk (i stedet for manuell
CSV-opplasting) via bankenes offisielle PSD2-API-er, men krever en egen
utviklerkonto hos [enablebanking.com](https://enablebanking.com) (Application
ID + privat nøkkel) som ikke følger med FamilieHub. Funksjonen er derfor
bygget ferdig, men **skrudd av som standard** bak to uavhengige brytere:

1. `ENABLE_BANKING_ACTIVE=true` i `.env` (global, skrur på funksjonen for
   *hele* installasjonen – krever omstart av backend).
2. Per familie: ⚙️ Økonomi → Oppsett → fyll inn Application ID + privat
   nøkkel (PEM) fra Enable Banking, samt domenet installasjonen kjører på
   (brukes til tilbakekoblings-URL-en etter samtykke i banken), og skru på
   "Aktiver kontosynk for denne familien".

Uten en ekte Enable Banking-avtale vises seksjonen som «Kommer snart» i
Oppsett, og resten av modulen (CSV, budsjett, AI-lag) fungerer helt uvirket.

### Selvhosting med Docker (for en vennefamilie som vil ha Økonomimodulen)

I motsetning til Raspberry Pi-planen lenger ned (systemd + Chromium kiosk,
uten innebygget HTTPS), er dette oppsettet ment for en vennefamilie som vil
kjøre en *egen* FamilieHub-instans, tilgjengelig utenfra via HTTPS uten
portforwarding – nyttig for Enable Banking, som krever en ekte HTTPS-URL for
tilbakekoblingen etter samtykke i banken:

```bash
git clone <ditt-repo-url> familiehub
cd familiehub
./scripts/install-finance-pi.sh
```

Skriptet installerer Docker om nødvendig, genererer `JWT_SECRET` og
`FINANCE_ENCRYPTION_KEY` automatisk, spør om familienavn/innlogging/domene,
og starter appen med `docker compose up -d`. Cloudflare Tunnel (for HTTPS)
må settes opp manuelt én gang (krever nettleser-innlogging hos Cloudflare) –
se `cloudflared/config.yml.example` for stegene. Uten tunnelen fungerer
appen fint lokalt på `http://<pi-ens-ip>:4000`, bare uten ekstern HTTPS-tilgang.

## GPS-klokke (Xplora)

Under 📍 **Kart** vises barnets siste kjente posisjon på et kart, med et
"hjemme"-varsel når geofencen i `.env` (`GEOFENCE_HOME_*`) treffes. Xplora
har ingen offentlig/dokumentert API, så integrasjonen bruker samme
innlogging som Xplora-appen (telefonnummer + landkode, eller e-post, pluss
passord) – legg dette inn som `XPLORA_PHONE`/`XPLORA_COUNTRY_CODE` eller
`XPLORA_EMAIL`, samt `XPLORA_PASSWORD`, i `.env`. `XPLORA_WARD_NAME` velger
riktig barn hvis kontoen har flere. Backend poller siste kjente posisjon
hvert 3. minutt (samme intervall som Traccar, konfigurerbart med
`XPLORA_POLL_INTERVAL_MS`) – klokken spørres ikke aktivt om en fersk posisjon
for å spare batteri. Traccar (for andre GPS-klokker som støtter en egen
server) kan kjøre side om side med Xplora, siden de skriver til samme tabell
med hver sin `source`.

## Google Photos til fotoramme

Under ⚙️ → **Bilder** kan du koble til Google Photos og plukke bilder rett
inn i fotoramme-mappen. Google fjernet i 2025 muligheten for tredjepartsapper
å lese et album/en mappe løpende – det som er igjen er en engangs-"plukker":
du trykker «Koble til Google Photos», velger bilder i vinduet som åpner seg
(Googles eget grensesnitt, kan navigere inn i et album og velge flere), og
FamilieHub laster dem ned. Gjenta når du vil legge til flere – det finnes
ingen automatisk synkronisering, det tillater ikke Google lenger.

Krever et engangsoppsett i [Google Cloud Console](https://console.cloud.google.com/):

1. Opprett et prosjekt (eller bruk et eksisterende) og skru på **Google
   Photos Picker API** under "APIs & Services" → "Library".
2. Under "APIs & Services" → "Credentials", opprett (eller gjenbruk, hvis du
   allerede har satt opp Google Kalender) en **OAuth Client ID** av typen
   "Web application".
3. Legg til `http://localhost:4000/api/photos/google/callback` i "Authorized
   redirect URIs" (i tillegg til kalender sin URI, hvis den også er satt opp).
4. Legg `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (samme som kalender bruker)
   og `GOOGLE_PHOTOS_REDIRECT_URI` inn i `.env`.

## "Ut og leke" – dele lekestatus med vennefamilier

Vennefamilier trenger **ikke** eget Render-/Fly.io-oppsett – de trenger bare
sin egen FamilieHub-installasjon (samme steg som over). `RELAY_URL` i
`.env.example` peker allerede på den delte relay-tjenesten
(`https://familiehub.onrender.com`), så den er ferdig konfigurert med mindre
den bevisst tømmes (da kjører "Ut og leke" kun lokalt, uten vennedeling).

Det eneste vennefamilien MÅ endre er `FAMILY_NAME` i sin egen `.env` – dette
er navnet som vises hos dere når dere deler status, og bør derfor være
unikt per familie (ikke la det stå som "Vår familie").

Når begge familier kjører FamilieHub med samme `RELAY_URL`:

1. Åpne ⚙️ (foreldre-PIN, standard `1234`, endres i `.env` som `PARENT_PIN`) hos den ene familien → **Vennefamilier** → **Generer kode**.
2. Den andre familien åpner samme sted → **Bruk kode**.
3. Familien som genererte koden godkjenner forespørselen som dukker opp.

Merk: siden relayen kjører på Render sin gratis-plan uten disk, kan par-listen
nullstilles ved omstart av tjenesten – da må dere bare parre på nytt.

## Arkitektur i korte trekk

- Backend eksponerer REST under `/api/*` og sender sanntidsoppdateringer
  (handleliste, gjøremål, kalender, smarthjem, GPS, beskjedtavle) via Socket.io.
- SQLite-databasen (`backend/data/familiehub.db`) er eneste datalager og
  flytter uendret med til Raspberry Pi.
- Bakgrunnsjobber i backend poller Shelly-plugger (hvert 5. sek) og Traccar
  (hvert 3. min, konfigurerbart) og cacher værmelding (30 min) og strømpriser
  (30 min) for å overholde ekstern API-bruk.
- Stemmestyring tolkes i dag med enkel nøkkelord-matching
  (`frontend/src/lib/voiceCommands.js`), strukturert som en ren
  tekst-til-intent-funksjon slik at den senere kan byttes ut med et AI-API-kall
  uten at resten av appen må endres.

## Flerfamilie-støtte – dele FamilieHub med en vennefamilie

FamilieHub støtter nå ekte innlogging: flere familier kan bruke samme
installasjon, med full adskillelse av data (kalender, gjøremål, GPS,
kameraer, bilder osv. – hver familie ser kun sitt eget). Dette er noe annet
enn Raspberry Pi-planen under, som fortsatt er riktig for **din egen**
kjøkkenskjerm – flerfamilie-støtten er for å *i tillegg* dele en internett-
tilgjengelig installasjon med f.eks. en vennefamilie som vil prøve appen uten
å sette opp noe selv.

### Hva er fortsatt delt (Fase 1-begrensning)

Noen integrasjoner er ikke bygget om til per-familie ennå, og er derfor
reservert **hovedfamilien** (den første kontoen som ble opprettet på
installasjonen – typisk deg): Garmin-treningscoach, Xplora/Traccar
GPS-klokke, og "Ut og leke"-venneparing. Andre familier ser rett og slett
ikke disse panelene/funksjonene ennå. Alt annet (kalender, gjøremål,
handleliste, belønninger, meldingstavle, smarte plugger, kameraer,
DoktorNå, Morgenbrief, AI-assistenten, bilder) er fullt adskilt per familie.

### Sette opp innlogging

1. Legg en ekte, tilfeldig `JWT_SECRET` i `.env` (f.eks. `openssl rand -hex 32`)
   – **må** gjøres før dette hostes for andre enn deg selv.
2. Har du allerede en database fra før flerfamilie-støtten fantes? Legg også
   inn `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` (og valgfritt
   `INITIAL_ADMIN_FAMILY_NAME`) – dette kjører automatisk én gang neste gang
   backend starter, og knytter all eksisterende data til denne innloggingen.
   En helt fersk installasjon trenger ikke dette – bare bruk "Opprett konto"
   i appen.
3. Foreldre-PIN-en (samme funksjon som før, gjelder admin-handlinger som å
   legge til familiemedlemmer, kameraer osv.) er nå per familie i stedet for
   global, standard `1234` for hver ny familie – byttes via
   `PATCH /api/auth/pin` (egen innstillingsknapp kommer).

### Deploy til Render (gratis, samme mønster som `relay/`)

1. Opprett en ny "Web Service" på [render.com](https://render.com) fra dette
   repoet (rot-mappen, ikke `/relay`).
2. Build command: `npm install && npm run build`
3. Start command: `npm start`
4. Legg til en persistent disk montert på `/data`, og sett i miljøvariablene:
   - `DB_PATH=/data/familiehub.db`
   - `PHOTOS_DIR=/data/photos`
   - `REWARDS_IMAGES_DIR=/data/reward-images`
5. Legg inn resten av `.env`-variablene du vil ha med (minst `JWT_SECRET`;
   `CORS_ORIGIN` kan settes til Render-URL-en din, selv om den ikke er
   strengt nødvendig når frontend og backend serveres fra samme origin slik
   produksjonsoppsettet gjør).
6. Vil du ta med din eksisterende lokale familie til Render (i stedet for å
   starte helt ferskt der)? Last opp `backend/data/familiehub.db` til
   `/data/familiehub.db` på den nye disken (Render sitt shell/SFTP) før
   første oppstart – ellers starter Render-installasjonen med en tom database
   og du oppretter en ny konto der i stedet.

Når tjenesten er oppe: du (og vennefamilien) går til Render-URL-en, trykker
"Opprett konto" og fyller inn familienavn, e-post og passord – ferdig, ingen
lokalt oppsett trengs på deres side.

## Plan for deploy til Raspberry Pi

Målet er en Raspberry Pi (4 eller nyere anbefalt) som kjører backend som en
systemd-tjeneste og viser frontend i Chromium kiosk-modus på en tilkoblet
skjerm.

### 1. Forbered Raspberry Pi OS

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y chromium-browser git
# Installer Node.js LTS (f.eks. via NodeSource) – match versjonen som er
# brukt i utvikling, siden better-sqlite3 kompileres mot Node-versjonen.
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Hent koden og installer

```bash
git clone <ditt-repo-url> /home/pi/familiehub
cd /home/pi/familiehub
npm install
cp .env.example .env    # fyll inn ekte verdier (Traccar, Entur-stoppested osv.)
npm run seed             # kun ved førstegangs oppsett
npm run build             # bygger frontend til frontend/dist
```

### 3. La backend servere det bygde frontend-bygget

I produksjon trenger man ikke Vite dev-serveren – enklest er å la Express
servere de statiske filene fra `frontend/dist`. Legg til i `backend/src/index.js`
(eller en egen produksjonsvariant) noe i stil med:

```js
import path from 'node:path';
app.use(express.static(path.join(backendRoot, '../frontend/dist')));
app.get('*', (req, res) => res.sendFile(path.join(backendRoot, '../frontend/dist/index.html')));
```

### 4. systemd-tjeneste for backend

Opprett `/etc/systemd/system/familiehub.service`:

```ini
[Unit]
Description=FamilieHub backend
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/familiehub/backend
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
EnvironmentFile=/home/pi/familiehub/.env

[Install]
WantedBy=multi-user.target
```

Aktiver og start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now familiehub.service
sudo systemctl status familiehub.service
```

### 5. Chromium i kiosk-modus ved oppstart

Opprett en autostart-oppføring for skrivebordsmiljøet (Raspberry Pi OS med LXDE),
`/home/pi/.config/lxsession/LXDE-pi/autostart`:

```
@xset s off
@xset -dpms
@xset s noblank
@chromium-browser --kiosk --incognito --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble --check-for-update-interval=1 \
  http://localhost:4000
```

Alternativt kan Chromium selv startes som en systemd-tjeneste (`--kiosk` mot
`http://localhost:4000` når backend serverer det bygde frontend-bygget).

### 6. Vedlikehold

- `sudo systemctl restart familiehub.service` etter `git pull` + `npm install` + `npm run build`
- Databasen (`backend/data/familiehub.db`) bør tas sikkerhetskopi av jevnlig
  (den ligger utenfor git via `.gitignore`)
- Bilder til fotoramme legges i `/home/pi/familiehub/photos`
