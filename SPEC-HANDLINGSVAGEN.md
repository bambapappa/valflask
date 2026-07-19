# SPEC — Handlingsvågen (arbetsnamn)

**Status: skiss. Privat tills lanseringsgrinden (HV5) passerats. Ägaren beslutar.**

## 1. Idén i en mening

Ord är gratis — handlingar räknas. Handlingsvågen väger vad partier och
ledamöter faktiskt **gör** i riksdagen mot vad de **lovat**, neutralt,
regelstyrt och spårbart hela vägen ner till voterings- och dokument-id.

drygast.nu har redan två vågar: Fläskvågen (vad löftena kostar) och
Frågevågen (var partierna står). Detta är den tredje: **gör man under
mandatperioden det man lovade innan?**

### Ursprunget

En bloggare ställde frågan rakt till ett statsråd som på Facebook kallade
en fråga hjärtefråga: *"Kan du ge några konkreta exempel på vad du faktiskt
har gjort?"* — och fick inget svar. Inga motioner, inga interpellationer,
inga debattartiklar gick att hitta. Slutsatsen: *"Ord är gratis.
Handlingar räknas."* Det är exakt den kontrollen Handlingsvågen gör
möjlig för vem som helst — utan att vi själva fäller omdömen.

## 2. Två lägen

**Läge A — Meritlistan (lanseras närmare valet 2026).**
För varje löfte och ståndpunkt i drygast.nu: vad har partiet — och de
enskilda ledamöterna — gjort i samma sakfråga under mandatperioden
2022–2026? Motioner, voteringar, interpellationer, skriftliga frågor.
Det är "fem i val"-testet: hur viktig var frågan innan röstfisket började?

**Läge B — Uppföljningen (efter valet 2026).**
Löpande under 2026–2030: gör partierna det de lovade? Regeringspartier
mäts på propositioner och budgetbeslut, opposition på motioner,
reservationer och röstbeteende. Uppdateras i takt med riksdagsåret.

Samma datamodell bär båda lägena — bara datumfönstret och
förväntansreglerna skiljer.

## 3. Datakällor

Allt hämtas ur **riksdagens öppna data** (data.riksdagen.se) — offentlig,
avgiftsfri, med stabila id:n. Inget skrapande av partisajter behövs här.

| Källa | Endpoint | Ger |
|---|---|---|
| Voteringar | `/voteringlista/` | varje ledamots röst (Ja/Nej/Avstår/Frånvarande) per votering, kopplad till betänkande och punkt |
| Dokument | `/dokumentlista/` (doktyp `mot`, `prop`, `bet`, `ip`, `fr`) | motioner, propositioner, betänkanden, interpellationer, skriftliga frågor med fulltext |
| Ledamöter | `/personlista/` | ledamotsregister med id, parti, valkrets, uppdrag |

Varje handling arkiveras med samma kedja som idag (Wayback →
archive.today) och en arkivkopia accepteras bara om det bärande citatet
står ordagrant i ögonblicksbilden.

## 4. Datamodell (git som databas, samma mönster som valflask)

- **`data/handlingar.json`** — normaliserade riksdagshändelser.
  `{ id: "h-2026-0001", kind: "votering" | "motion" | "proposition" |
  "interpellation" | "skriftlig_fraga", dok_id, votering_id?, punkt?,
  datum, parties, persons, titel, url, archive_url, utfall?,
  rostfordelning?: { per parti: {ja, nej, avstar, franvarande} } }`
- **`data/kopplingar.json`** — kanterna löfte/ståndpunkt ↔ handling.
  `{ id: "k-2026-0001", promise_id? | stance_id?, handling_id,
  riktning: "stodjer" | "motverkar", bevis: { citat, sida? },
  motionstyp?: "parti" | "kommitte" | "enskild", method_note,
  confidence, extraction, status }`
  Citatet är ett exakt utdrag ur riksdagsdokumentet som visar att
  handlingen rör samma sakfråga som löftet.
- **`data/domar.json`** — **räknas fram av ett skript, aldrig skrivet för
  hand och aldrig av en språkmodell.** Per (löfte, parti) och per
  (löfte, ledamot): status + lista på de kopplingar som ligger till
  grund. Genereras om vid varje dataändring; en incheckad dom utan
  motsvarande kopplingar är ett testfel.
- **`data/beslutslogg.json`** — varje metodval loggat med datum, beslut,
  motiv och förkastade alternativ. Publiceras i sin helhet vid lansering.
- **`schemas/`** — JSON Schema för samtliga filer, med invariant-tester.

## 5. Grindarna (H-serien — samma stränghet som G-serien)

Ingen koppling publiceras om inte samtliga passeras:

- **H1 — Källan finns.** Handlingen ska finnas i riksdagens öppna data
  med dokument- eller voterings-id, och länken ska gå att öppna.
- **H2 — Ordagrant bevis.** Kopplingen kräver ett exakt citat ur
  riksdagsdokumentet; citatet verifieras tecken för tecken mot källtexten
  med samma normalisering som dagens citatgrind.
- **H3 — Rätt aktör.** Parti (och person där det är relevant) i
  handlingen ska stämma med löftets parti/person.
- **H4 — Rätt fönster.** Handlingens datum ska ligga i lägets
  datumfönster (Läge A: mandatperioden före valet; Läge B: efter
  regeringsbildningen).
- **H5 — Riktningen står i texten.** "Stödjer" eller "motverkar" ska
  följa av dokumentets egen text, inte av tolkning. Vid tvekan: ingen
  koppling. Tomma celler är ärliga.
- **H6 — Ägarbeslut.** Ingen koppling publiceras utan mänsklig
  granskning via samma issue-flöde som dagens granskningskö
  (egen etikett, samma kommandon).

Språkmodellens roll är strikt avgränsad: den får **föreslå** kopplingar
med citat. Grindarna och ägaren avgör. Domarna räknas sedan fram
deterministiskt ur de godkända kopplingarna.

## 6. Domsregler (deterministiska och symmetriska)

Statusar per (löfte, parti):

- **AGERAT I LINJE** — minst en godkänd koppling med riktning "stödjer"
  och ingen med "motverkar".
- **AGERAT EMOT** — minst en godkänd koppling med riktning "motverkar"
  och ingen med "stödjer".
- **BÅDE OCH** — kopplingar åt båda hållen; båda visas, läsaren dömer.
- **INGEN HANDLING ÄNNU** — löftet är kopplingsbart men inga handlingar
  funna. Detta är default och en neutral upplysning, inte en anklagelse.
- **EJ PRÖVAT I RIKSDAGEN** — sakfrågan har inte varit uppe i någon
  form som går att koppla (ingen votering, inget dokument).

Rättviseregler (fastställs i beslutsloggen innan någon dom publiceras):

1. **Olika verktyg, samma stränghet.** Regeringspartier mäts främst på
   propositioner och budget; opposition på motioner, reservationer och
   röster. Opposition krävs aldrig på stiftad lag.
2. **Frånvaro räknas aldrig.** Riksdagens kvittningssystem gör frånvaro
   planerad; bara Ja/Nej/Avstår är ställningstaganden. Avstår redovisas
   som avstår — varken i linje eller emot.
3. **Motionstyp etiketteras.** Partimotion och kommittémotion uttrycker
   partilinje; en enskild motion binder inte partiet och redovisas som
   enskild ledamots handling.
4. **Ledamotsnivå.** En ledamots röster i kopplade voteringar redovisas
   per ledamot och aggregeras till parti. Avvikare från partilinjen
   syns — det är öppna data, inte vår åsikt.
5. **Sajtspråket är neutralt.** Vi visar registret; läsaren dömer.
   Inga betyg, ingen färgskala godkänt/underkänt, inga rubriker av
   typen "sveket". Statusorden ovan är hela vokabulären.

## 7. Neutralitetskontraktet

Se `NEUTRALITET.md` — sammanfattat: samma regler för alla åtta partier,
publicerade före lansering; domar räknas av skript ur öppna data; varje
dom klickbar hela vägen till riksdagsdokument och arkivkopia; beslutslogg
från dag ett; symmetritest redovisat före lansering; tyst rättelse
förbjuden; tomma celler ärliga.

## 8. Milstolpar

- **HV0 — Spec och scheman.** Denna skiss fastställd av ägaren,
  JSON-scheman, beslutslogg igång. *(Detta dokument.)*
- **HV1 — Skördaren.** Deterministisk hämtare mot riksdagens öppna data
  (voteringar, dokument, ledamöter) → `handlingar.json`. Testbar utan
  språkmodell.
- **HV2 — Kopplingar.** Förslagssteg (språkmodell) + grindarna H1–H5 +
  granskningskö med egen etikett i valflask-flödet.
- **HV3 — Domsmotorn.** Deterministiskt skript + invariant-tester +
  symmetritest: metoden körs mot testfall från båda blocken och utfallet
  redovisas i beslutsloggen.
- **HV4 — Sajten.** Sektion byggd mot riktiga data i det privata repot:
  per löfte, per parti, per ledamot. API-utkast. Metodsida skriven i
  språk alla förstår.
- **HV5 — Lanseringsgrinden.** Checklista som alla måste bockas:
  metodsidan publicerad, beslutsloggen publicerad, symmetritestet
  redovisat, rättelseväg på plats, arkivkopior verifierade, ägarens
  uttryckliga go. Först därefter flyttas/speglas koden och datat till
  valflask och går live på drygast.nu.

## 9. Öppna frågor till ägaren

1. **Namnet.** "Handlingsvågen" är arbetsnamn. Alternativ:
   "Hållerkollen", "Ord & handling", "Meritlistan".
2. **Ledamotsnivåns synlighet.** Visa enskilda ledamöter från start,
   eller börja på partinivå och släppa ledamotsnivån senare?
3. **Läge A:s omfång.** Alla 400+ löften, eller börja med de 10
   frågorna i Frågevågen (som redan är formulerade för jämförelse)?
4. **Interpellationer/skriftliga frågor** — ta med från start eller
   bara motioner+voteringar i första versionen?
