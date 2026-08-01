# FamilieHub-relay

Minimal formidlingstjeneste for "Ut og leke"-modulen i FamilieHub. Videresender
KUN sanntids lekestatusmeldinger (barnenavn, familienavn, sted-label, emoji,
tidspunkt) mellom parrede familier. Lagrer ingen meldinger, posisjon eller
historikk – kun hvem som er parret med hvem (`hubs` og `pairings`-tabellene).

## Kjøre lokalt

```
npm install
cp .env.example .env
npm run dev
```

## Deploy gratis på Fly.io

```
fly launch --no-deploy   # bruk fly.toml som ligger her
fly volumes create relay_data --size 1
fly deploy
```

## Deploy gratis på Render

1. Opprett en ny "Web Service" fra denne mappen (`/relay`).
2. Build command: `npm install`
3. Start command: `npm start`
4. Legg til en disk (persistent disk) montert på `/data`, og sett `DB_PATH=/data/relay.db`.

## Koble FamilieHub-huben til relayen

Sett `RELAY_URL` i FamilieHub sin `.env` til relayens URL
(f.eks. `https://familiehub-relay.fly.dev`). Tom verdi = kun lokal modus,
"Ut og leke" fungerer da uten vennefamilier.

TLS/kryptering håndteres automatisk av Fly.io/Render sin edge – ingen
ekstra oppsett trengs i selve relay-koden.
