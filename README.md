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
