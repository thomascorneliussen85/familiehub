# Lokalt https-sertifikat

Nettlesere krever en "sikker tilkobling" (https, eller `localhost`) for å
tillate talegjenkjenning (Web Speech API), som brukes av 🎤-knappen i
FamilieHub. Åpnes appen fra et nettbrett via en vanlig `http://`-adresse på
hjemmenettverket, blokkeres mikrofonen stille av nettleseren.

Denne mappa inneholder et selvsignert TLS-sertifikat for Vite sin
utviklingsserver, slik at FamilieHub kan åpnes over `https://` fra andre
enheter på nettverket.

## Generere/fornye sertifikatet

Sertifikatet må dekke maskinens IP-adresse på hjemmenettverket. Finn den med
`ipconfig` (se "IPv4-adresse" under Wi-Fi), og kjør deretter:

```bash
certs/generate.sh 10.0.0.3
```

(bytt ut `10.0.0.3` med din faktiske IP-adresse). Kjør denne på nytt hvis
IP-adressen endrer seg (f.eks. etter en ruter-omstart, med mindre du har satt
en fast/reservert IP for maskinen i ruteren – anbefales).

Restart `npm run dev` etterpå. Nettbrettet må da åpne FamilieHub via
`https://<samme IP>:5173` i stedet for `http://`.

## Stole på sertifikatet på nettbrettet

Siden sertifikatet er selvsignert (ikke utstedt av en kjent sertifiseringsinstans),
viser nettleseren en advarsel første gang. Dette er forventet og trygt å gå
forbi siden det er ditt eget hjemmenettverk:

**Chrome (Android/desktop):** Trykk **Avansert** → **Fortsett til `<IP>` (usikker)**.
Dette gjøres kun én gang per enhet – nettleseren husker valget.

## Ikke del disse filene

`cert.pem` og `key.pem` er maskinspesifikke og ligger i `.gitignore` – de skal
aldri committes til git.
