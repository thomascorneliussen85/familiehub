# Personvern i FamilieHub Fleet

Dette dokumentet beskriver hva fleet-tjenesten har lov til å vite om en
utplassert hub, og – like viktig – hva den **aldri** har lov til å vite. Dette
er ikke bare en policy: begrensningene er bygget inn som tekniske sperrer i
koden, ikke noe som er opp til god vilje å overholde.

## Hva hubben ALDRI sender

Hub-klienten (`backend/src/services/fleetClient.js` i hoved-appen) har
**ingen kode** som kan lese eller sende noe av dette, og fleet-tjenesten har
**ingen endepunkt** som tar imot det:

- Kalenderavtaler, gjøremål, handlelister
- Bilder (fotoramme, kameraopptak, familiebilder)
- Sensorverdier (strømpris-forbruk, temperaturer, dørklokke-hendelser)
- Kamerastrømmer eller noe som helst fra kameraer
- GPS-/posisjonsdata
- Navn på familiemedlemmer, e-postadresser, telefonnumre
- Innhold i beskjeder, notater eller chat

## Hvordan dette håndheves teknisk

1. **Eksplisitt whitelist, håndhevet to steder.** `fleet/shared/telemetryWhitelist.js`
   er den ENESTE kilden til hvilke telemetrifelt som finnes:
   `app_versjon`, `oppetid_sekunder`, `fri_diskplass_mb`, `minnebruk_prosent`,
   `antall_tilkoblede_enheter`, `os_versjon`. Denne filen importeres BÅDE av
   hub-klienten (før noe sendes) OG av fleet-tjenesten (ved mottak) – to
   uavhengige filtre mot nøyaktig samme liste, ikke to lister som kan gli fra
   hverandre over tid.
2. **Ingen fritekst-telemetri.** Det finnes ikke noe "annet"-felt eller
   fritekst-payload i telemetri-endepunktet. Et felt som ikke står i
   whitelisten blir stille forkastet, ikke lagret "for sikkerhets skyld".
3. **Feilmeldinger strippes før sending.** `fleetClient.js` sin `stripPii()`
   fjerner alle kjente familiemedlem-navn og e-postadresser (samt et generelt
   e-postmønster) fra feilmeldingstekst og stacktraces FØR de forlater huben.
   Dette er beste innsats, ikke en garanti mot enhver tenkelig lekkasje i en
   fritekst-feilmelding – se "Kjente begrensninger" under.
4. **Ingen fjerntilgang.** Fleet-tjenesten har ingen mekanisme for å koble seg
   til en hub, be om en databaseeksport, strømme skjermen, eller på noen måte
   lese hub-ens lokale SQLite-database. Kommunikasjonen går kun én vei for
   telemetri (hub → fleet) og én vei for konfigurasjon (fleet → hub, kun de
   feltene som står i `hub_config`-tabellen: abonnementsstatus, hvilke
   moduler som er på/av, oppdateringskanal, ønsket versjon).
5. **Ingen avhengighet.** Hubben MÅ fungere fullt ut selv om fleet-tjenesten
   er nede, utilgjengelig, eller aldri har vært konfigurert. Konfigurasjon
   caches lokalt og brukes uendret hvis fleet-tjenesten ikke svarer.
6. **Helt deaktiverbart.** Er `FLEET_URL` tom i hub-ens `.env`, kjører
   fleet-klienten aldri i det hele tatt – ingen bakgrunnsjobb starter, ingen
   nettverkskall gjøres. Dette er standardvalget for en hub som ikke skal ha
   fjernadministrasjon.

## Hva fleet-tjenesten VET om en familie

Kun det som står i `hubs`-tabellen, og det er informasjon **dere selv** (den
som drifter hub-flåten) skriver inn ved oppsett – ikke noe hubben rapporterer
automatisk om familien: kundenavn, kontakt-e-post, et fritekst adressenotat,
og egne driftsnotater. Dette er kundeadministrasjon på samme nivå som en
faktura ville inneholdt, ikke overvåking av familiens bruk av hubben.

## Kjente begrensninger

- PII-strippingen i feilmeldinger er mønstergjenkjenning (kjente navn fra
  familien + generelt e-postmønster), ikke en garantert 100%-sperre. En
  utvikler som senere legger til en feilmelding som inneholder personopplysninger
  i en uventet form, kan i teorien la noe slippe gjennom. Gjennomgå
  feilmeldingstekster i koden med dette i bakhodet.
- `adresse_notat` og `notater`-feltene er fritekst dere selv fyller ut – dere
  har ansvar for hva dere skriver der.
