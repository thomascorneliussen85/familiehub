# FamilieHub kamera-bro

En liten tjeneste som kjører på en alltid-på enhet hjemme (f.eks. en Raspberry
Pi) og kobler hjemmenettverket ditt til FamilieHub-skyen. Uten denne kan ikke
FamilieHub se kameraer på hjemmenettet i det hele tatt – skyserveren står jo
ikke på samme nettverk som kameraene dine.

Broen gjør to ting:
1. Leter jevnlig etter Tapo-kameraer på nettverket (ONVIF) og melder dem inn
   til FamilieHub automatisk når de skrus på.
2. Henter video lokalt (RTSP) og videresender den til FamilieHub når noen ser
   på kameraet i appen.

## Forutsetninger

- **ffmpeg** installert: `sudo apt install ffmpeg`
- **Node.js 18+** installert
- Kameraene må ha **"Tredjepartskompatibilitet" (ONVIF) slått på** i Tapo-appen,
  per kamera. Der setter du samtidig et eget brukernavn/passord for lokal
  tilgang – det er ikke det samme som TP-Link-kontoen din. Uten dette svarer
  ikke kameraet på nettverkssøket i det hele tatt.

## Oppsett

1. Generer en bro-nøkkel i FamilieHub: **Innstillinger → Enheter → "Generer
   bro-nøkkel"**. Du får en `BRIDGE_ID` og en `BRIDGE_API_KEY` – de vises kun
   én gang, så kopier dem med det samme.
2. På Raspberry Pi-en:
   ```bash
   git clone <repo-url>
   cd familiehub/camera-bridge
   npm install
   cp .env.example .env
   ```
3. Fyll ut `.env`:
   - `FAMILIEHUB_URL` – adressen til FamilieHub-installasjonen din
   - `BRIDGE_ID` / `BRIDGE_API_KEY` – fra steg 1
   - `TAPO_USERNAME` / `TAPO_PASSWORD` – ONVIF-legitimasjonen fra Tapo-appen
4. Start broen:
   ```bash
   npm start
   ```
   Du bør se `✅ Tilkoblet FamilieHub` og deretter kameraer dukke opp etter
   hvert som de blir funnet. Nye kameraer vises i FamilieHub under
   Innstillinger → Enheter som "oppdaget, venter på navn" – gi dem et navn
   der for å ta dem i bruk.

## Kjør alltid i bakgrunnen (systemd)

Så broen starter automatisk når Pi-en starter, og restarter selv hvis den
krasjer:

```bash
sudo tee /etc/systemd/system/familiehub-camera-bridge.service > /dev/null <<'EOF'
[Unit]
Description=FamilieHub kamera-bro
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/pi/familiehub/camera-bridge
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=pi

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now familiehub-camera-bridge
```

Se logger med `journalctl -u familiehub-camera-bridge -f`.

## Feilsøking

- **Kameraet dukker aldri opp**: sjekk at "Tredjepartskompatibilitet" (ONVIF)
  er slått på for akkurat det kameraet i Tapo-appen, og at Pi-en og kameraet
  er på samme nettverk/VLAN (ONVIF-søket er UDP-multicast, som ikke krysser
  subnett eller en del wifi-isolerte gjestenett).
- **Kameraet dukker opp, men video vises ikke**: sjekk `TAPO_USERNAME`/
  `TAPO_PASSWORD` i `.env` mot det du satte i Tapo-appen, og at `ffmpeg` er
  installert (`ffmpeg -version`).
- **"Kamera-broen er ikke tilkoblet" i appen**: broen kjører ikke, eller har
  mistet forbindelsen til FamilieHub – sjekk `journalctl -u
  familiehub-camera-bridge -f` (eller terminalen den kjører i).
