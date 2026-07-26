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
