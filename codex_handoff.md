# Codex Handoff

## Current task

Slutföra hela tillits- och processförändringen för utlovat.se i
`bambapappa/valflask`. Uppdraget omfattar kontroll av publicerade löften,
kopplingar, grupper, dubbletter, beräkningar, partiernas egna siffror,
inriktningslöften och aktörsnivåer; förbättring av insamling och bedömning;
samt ett automatiserat flöde från insamling till publicering där en verklig
människa godkänner det exakta materialet före publicering.

Kodutkastet ligger i PR 8702 på `arbete/sakprovningsgrind`. Gemensam plan och
arbetsstatus ligger i `bambapappa/handoff`, PR 406, på
`arbete/maskinell-provningsomfattning`. Börja varje pass med att läsa
`bambapappa/handoff/AGENTS.md` från GitHub och följ sedan den angivna
läsordningen. Kod-PR:n får inte slås ihop utan mänskligt beslut.

## Completed

- Skrev tillitsutlåtandet och genomförandeplanen i handoff-repot. Den
  maskinella helhetskontrollen gav prioriterade innehållsfynd, bland annat
  periodfel, en säker LSS-dubblett, felaktigt prissatta utredningar och stora
  överlappningskandidater. Detta var inte en individuell sakattest av varje
  publicerad post.
- Skilde teknisk maskinkontroll från ej utförd mänsklig sakprövning i
  granskningsunderlag och export.
- Införde frysta, versionsbundna förslag och fullständiga beslutspaket för nya
  löften, kalkylflyttar, uträkningstext, löftestyp, ankarsättning, nollning och
  samlade avvisningar. Paketen binder föreläge, slutläge, berörda filer,
  sakunderlag och extern beslutshash.
- Införde journalförd filtransaktion med exklusivt lås, kontroll av förändrat
  föreläge och återställning vid fel. Blandade beslut förprövas i isolerad
  kopia före gemensam skrivning.
- Ändrade kalkylens bakåtfyllning så att även nära estimat blir
  granskningsförslag. Artefaktimporten får inte skriva över publicerade löften,
  rättelser eller körlogg.
- Migrerade `utrakning-byt`, `sortbyte`, `ankarsattning`, `nollning` och
  `avvisa-lista` till förbered, kontrollera och verkställ med fullständigt
  paket. Gamla direkta skrivvägar för de fyra första togs bort.
- Kräver tre uttryckliga nollor för inriktningslöfte. Nollning stoppar ett
  löfte som bär partiets egen siffra, utom den uttryckliga dubblettregel som
  behåller beloppet på ankaret.
- Stoppar saknade, tillbakadragna och självpekande ankare, ogiltiga
  kostnadsspann samt direkta och indirekta ankarkedjor.
- Gör kärnans direkta avvisning atomisk över `needs_review.json` och
  `avvisade.json`.
- Migrerade avslag via issue-kommentar till `avvisningspaket/1`. GitHubs
  `OWNER`-relation, aktör och händelselänk följer med beslutet.
- Migrerade avslag via etikett i kodrevision `6e527c11`. Skriptet läser hela
  den paginerade issue-historiken, kräver att den senaste beslutsetiketten
  sattes av repots ägare och binder samma aktör till beslutspaketet.
- Pushade projektstatusen till handoff-revision `9025e7a`.

## Current status

Kontrollerat mot GitHub 2026-09-15:

- PR 8702 är öppen som utkast på exakt revision
  `6e527c11d75532299ec6c0686c371945aa61d80e`.
- Lokal full pipelinesvit för revisionen: 1 263 tester, 1 262 godkända, 0 fel
  och 1 överhoppat. Typkontroll, ordgrind och `git diff --check` passerade.
- Avsiktligt felprov: när bindningen mellan bedömare och GitHub-aktör togs
  bort föll det riktade regressionsprovet; efter återställning passerade det.
- GitHubs `test-pipeline` och `test-handlingsvagen` är godkända för revisionen.
  `build-and-test` körde fortfarande vid den sista kontrollen och ska
  kontrolleras på nytt innan grenen bedöms som helt grön.
- PR 406 är öppen på exakt revision
  `9025e7a00b6623790a2c440e822fabecaa133557`; dess test är godkänt.
- Inga sakdata ändrades, inga verkliga granskningsbeslut skapades och inget av
  processutkastet är mergat eller aktiverat i produktion.

Lokala arbetskopior:

- Kod: `/tmp/valflask-recovery-0914`
- Handoff: `/tmp/handoff-recovery-0914`
- Den här filens gren: `/Users/bambapappa/Code/utlovat`,
  `arbete/codex-handoff-20260914`, PR 8703

## Next task

Stäng den sista äldre direkta avslagsvägen i `pipeline/src/review.ts`.

1. Registrera ett nytt anspråk under "Pågår just nu" i
   `projekt/utlovat/HANDOFF.md` och pusha det före kodändringen.
2. Ta bort eller spärra CLI-kommandona `review reject` och `review reject-id`
   så att de inte längre kan anropa `reject()` utan ett granskningspaket.
   Hänvisa användaren till `avvisa-lista forbered`, `kontroll` och `verkstall`.
3. Lägg ett regressionsprov som fäller om en körbar CLI- eller workflowväg
   åter kan avvisa utan `avvisningspaket/1`, verifierad beslutskälla och extern
   pakethash. Biblioteksfunktionen får finnas kvar för paketens isolerade
   beräkning, men ska inte vara en fristående beslutskälla.
4. Kör riktade prov, full pipeline, typkontroll, ordgrind och ett avsiktligt
   felprov. Pusha till PR 8702 och uppdatera PR 406.

När avvisningen är helt stängd är nästa sammanhållna etapp att inventera och
migrera återstående direkta skrivare för grupper, citat, rubriker och
indragningar. Därefter måste den faktiska innehållsrevisionen och de
representativa kvalitetsmätningarna genomföras; beslutspaketen gör processen
säkrare men bevisar inte att innehållet är sant.

## Known issues

- `review reject` och `review reject-id` kan fortfarande avvisa direkt utan
  fullständigt beslutspaket.
- Godkännande via `handle-review-comment` och `apply-labeled-decisions` går
  fortfarande genom den äldre `approve()`-vägen. Den måste granskas mot det
  nya obligatoriska beslutsunderlaget och får inte antas fungera korrekt bara
  för att avslagsvägen nu är paketerad.
- Direkta skrivare för grupper, citat, rubriker och indragningar är inte fullt
  migrerade till samma versionsbundna paketkontrakt.
- Modellnamn och formatversion binder ännu inte exakt prompt- och
  estimatorversion.
- Artefaktimportens skydd gäller Actions-flödet och är inte en generell
  transaktion för alla samtidiga lokala skrivare.
- Den fullständiga individuella sakgranskningen av publicerade löften,
  kopplingar, grupper, dubbletter, beräkningar, partital, inriktningslöften och
  aktörsnivåer är inte genomförd. Syntetiska tester bevisar kontrakt och
  felhantering, inte politiska sakuppgifters riktighet.
- Insamlingens täckning, falska negativa fynd, källprioritering och återhämtning
  efter artikelfel är inte mätta mot ett nytt oberoende stickprov. Den tidigare
  mätningen visade 120 artikelfel av 120 försök i en körning.
- Bedömningens precision och möjliga automationsgrad är inte mätta mot blind
  dubbel mänsklig bedömning med konfliktlösning.
- Den nya publiceringsprocessen är fortfarande ett utkast. Ingen verklig
  mänsklig attest har skapats, och ingen får påstå att en sådan finns före en
  kontrollerad skarp genomkörning.
- PR 8702:s titel och beskrivning speglar inte hela den nuvarande omfattningen
  och behöver skrivas om före granskning.
- PR 406 har lång och blandad historik. Kontrollera aktuell diff innan den
  eventuellt slås ihop.
- PR 8519 har en känd konflikt som ska tas vid ett senare tillfälle.
- GitHub rapporterade 42 beroendesårbarheter på standardgrenen vid push: 2
  kritiska, 35 höga och 5 måttliga. De är inte utredda inom detta arbete.

## Important decisions

- Ett maskinellt förslag eller en teknisk kontroll är inte en mänsklig
  sakattest.
- Ett förslag får inte ändra publicerade data utan separat sakprövning, extern
  beslutshash och exakt oförändrat föreläge.
- Publicerad data, offentlig rättelselogg och körlogg ska ingå i samma
  beslutspaket.
- Saknade, inaktuella eller oavgjorda belägg ska förbli oavgjorda.
- Närhet mellan ett nytt och ett gammalt belopp är inte ett godkännande; båda
  ska gå till granskning.
- Partiets egen siffra ska användas när den finns. Ett sådant löfte får inte
  nollas till inriktning.
- Ett inriktningslöfte ska bära rätt typ och uttryckliga nollor för låg, bas
  och hög.
- Partikopplingar, ledamotshandlingar och ledamotsmeriter ska prövas som skilda
  aktörsnivåer.
- En människa ska godkänna det hashbundna slutpaketet före publicering. Modeller
  och deterministiska kontroller får samla in, föreslå, kontrollera och
  prioritera, men inte tillverka den attest som påstås vara mänsklig.
- Kod-PR får vara utkast, men sammanslagning och produktionspublicering är ett
  mänskligt beslut.
