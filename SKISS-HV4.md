# Skiss — HV4: visualisering, sökning, filtrering

**Status: UTKAST 2026-07-19 — inget här är beslutat. Ägaren väljer;
valen beslutsloggas innan sajtkod skrivs.**

Ramen är neutralitetskontraktet: vi visar registret, läsaren dömer.
Statusorden är hela vokabulären. Inga betyg, ingen färgskala
godkänt/underkänt, inga rubriker av typen "sveket". Varje cell klickbar
hela vägen till riksdagsdokument och arkivkopia. Tomma celler är ärliga
och ska SYNAS, inte gömmas.

## 1. Tre ingångar (samma data, tre skärningar)

### Vy 1 — Rutnätet (per löfte)

Sajtens hjärta, samma grepp som Fläskvågens tabell: en rad per löfte,
status per parti ur `domar.json`.

```
Löfte                        S       M       SD      V     …
Höjt tak i a-kassan       I LINJE   EMOT    —     I LINJE
Fler poliser              INGEN HANDLING ÄNNU …
```

- Cellinnehåll är STATUSORDET, aldrig en symbol ensam. "BÅDE OCH" visar
  båda listorna vid klick.
- Klick på cell → detaljpanel: kopplingarna bakom domen, varje med
  exakt citat, riksdagslänk, arkivlänk, riktning, metodnot, motionstyp
  och grinddatum. Domen är en summa av klickbara bevis — inget annat.
- **Öppen fråga till ägaren (F1):** visar rutnätet alla åtta partier
  per löfte, eller bara löftespartiet med "jämför"-knapp? Alla åtta
  ger "fem i val"-testet direkt men blir en gles matris (ärligt tomrum
  eller brus? — smaksak som ägaren avgör).

### Vy 2 — Partisidan

Per parti: partiets löften med status, plus listan över handlingar som
gett utslag (nyast först). Andelen "ingen handling ännu" redovisas som
tal — ärligt tomrum är ett resultat, inte ett misslyckande att dölja.

### Vy 3 — Ledamotssidan (b-0008: synlig från dag ett)

Per ledamot (425 st): meritlistan ur `domar.json` +
röstraden ur `data/roster/`:

- Röster i kopplade voteringar: i linje / emot / avstod / frånvarande —
  frånvaro VISAS men fäller aldrig något (b-0004; en not om
  kvittningssystemet på varje sida).
- Egna motioner, interpellationer, skriftliga frågor per löfte
  (b-0009: ledamotsmerit, aldrig partidom).
- Avvikelser från partilinjen i kopplade voteringar markeras
  typografiskt (spec §6.4: öppna data, inte vår åsikt).
- Partibyten visas som de är (avvikelselistan i roster-formatet).

## 2. Neutral formgivning av status

Statusarna är INTE bra/dåligt — "agerat emot" ett löfte kan vara precis
vad en väljare hoppas på. Därför:

- **Ingen grön/röd-skala.** Två likvärdiga, icke-värderande kulörer ur
  sajtens befintliga palett för I LINJE/EMOT, grå för AVSTOD/INGEN
  HANDLING/EJ PRÖVAT, och alltid ordet utskrivet — färg är bara stöd,
  aldrig budskap (tillgänglighet: skilj aldrig på enbart färg).
- Samma visuella vikt för alla partier och alla statusar.
- **Öppen fråga (F2):** exakta kulörval — tas med theme-arbetet i
  valflask så vågarna känns som en familj.

## 3. Sökning och filtrering (statiskt, ingen backend)

### Byggtidsskivning (samma mönster som valflasks api/v1)

Sajten skeppar ALDRIG 17 MB. Astro-bygget skivar:

- `api/hv/summary.json` — rutnätets celler (löfte × parti × status),
  < 100 KB.
- `api/hv/lofte/<p-id>.json` — kopplingar + bevis för ett löfte.
- `api/hv/parti/<kod>.json` — partisidans data.
- `api/hv/ledamot/<intressent_id>.json` — meritlista + röstrad,
  425 små filer.
- `api/hv/votering/<votering_id>.json` — röstmatrisen för EN votering,
  laddas först vid klick.

### Sök

Förbyggt index (löftestitlar, ledamotsnamn, betänkandetitlar,
kategorier) i en JSON på ~200–400 KB, laddad först när sökrutan
fokuseras. Eget inverterat index eller MiniSearch — men BUNTAT i
bygget: CSP:n är `script-src 'self'`, inga CDN-skript (drygast.nu-
läxan: Rocket Loader måste vara AV).
**Öppen fråga (F3):** eget index (noll beroenden, vi äger allt) eller
MiniSearch (färdig relevansrankning, +8 KB gzippat)? Rekommendation:
eget — sökbehovet är exakt matchning + prefix, inte fritext-relevans.

### Filter

Alla vyer filtrerbara på: parti, kategori (Fläskvågens kategorier),
status, dokumenttyp, riksmöte, motionstyp (b-0007). Filtren är
**URL-parametrar** (`?parti=s&status=i-linje&rm=2023/24`) så att varje
filtrerat läge är länkbart, delbart och arkiverbart — journalister ska
kunna länka exakt det urval de skriver om.

### Budget

Startsida < 100 KB före bilder; ingen vy laddar > 500 KB JSON;
röstmatriser alltid vid klick. Allt mäts i bygget (test i stil med
valflasks T-serie) så budgeten är en grind, inte en förhoppning.

## 4. Metodsidan

Skrivs i språk alla förstår (CLAUDE.md): hur en koppling blir till
(förslag → grindarna → ägarbeslut), varför frånvaro aldrig räknas,
varför enskilda motioner inte binder partiet, vad tomma celler betyder,
och hur man rättar oss (rättelsevägen). Publiceras med beslutsloggen
vid HV5.

## 5. Öppna frågor — samlade för ägarbeslut

- **F1:** Rutnätet — alla åtta partier per löfte, eller löftespartiet
  med jämförknapp?
- **F2:** Kulörer för statusarna (icke-värderande par) — tas med
  theme-arbetet.
- **F3:** Sökindex — eget eller MiniSearch (rekommendation: eget).
- **F4:** Ska Frågevågens ståndpunkter in i rutnätet från start
  (spec §9 säger ja — bekräfta att HV4 bygger båda källorna direkt)?
- **F5:** Ledamotssidor för ledamöter som lämnat riksdagen (123
  motioner har sådana undertecknare) — egen sida eller notis?
