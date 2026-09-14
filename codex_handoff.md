# Codex Handoff

## Current task

Slutföra den fullständiga processförändringen för utlovat.se i `bambapappa/valflask`: faktakontroll av löften, kopplingar, grupper, dubbletter, beräkningar och aktörsnivåer samt ett automatiserat insamlings-, bedömnings- och publiceringsflöde där en människa godkänner före publicering.

## Completed

- Införde frysta, versionsbundna löftes- och kalkylförslag som binder föreläge, slutform, aktör, kostnad och historik.
- Införde separat sakprövning med tio moment som börjar som `oavgjorda` och kräver spårbara referenser.
- Kopplade kalkylflyttar i `review-verkstall` till fryst kalkylförslag, sakprövning och extern beslutshash.
- Ändrade bakåtfyllningen så att både nära och avvikande estimat sparas som granskningsförslag.
- Skyddade artefaktimporten från att skriva över publicerade löften, rättelselogg eller körlogg.
- Lade till checkpointing, deduplicering och kontroll av ändrat föreläge.
- Lade till och pushade `utrakningsforslag/1` för befintlig uträkningstext, med fryst före-/slutform och historik. `utrakningspaket/1` är inte med i den pushade revisionen.
- Lade till tester för normalfall, felaktiga underlag, manipulerade hashar, samtidiga gruppändringar, CLI-flöden och avsiktliga regressioner.
- Uppdaterade överlämningsplan och `haller-det`-skill med begränsningar och nästa steg.

## Current status

Senast dokumenterade kodrevision är `03518b3c` på utkast-PR 8702. Senast dokumenterade fulla pipelinekörning: 1 233 tester, 1 232 godkända, 0 fel och 1 befintligt överhoppat. Typkontroll och ordgrind passerade. Ändringarna är inte mergade eller aktiverade i produktion. Den lokala huvudgrenen stod vid revision `6041fcca` när denna fil skrevs; kontrollera alltid aktuell PR- och CI-status innan du fortsätter.

Kontrollerat mot GitHub 2026-09-14: PR 8702 är öppen och ett utkast, med full revision `03518b3cad84f06858cc2f22268ef74a472b2f59` på `arbete/sakprovningsgrind`. GitHubs main är `9bd99330a2a8154872c3edf311d809b64397c6f5`. Lokal main har därefter fått överlämningscommitten `401698f0`, men ligger efter GitHub och ska inte tvångspushas.

Efter den pushade revisionen implementerades lokalt `utrakningspaket.ts`, en ersättande `scripts/utrakning-byt.mts`, stöd för flera ändrade gruppmedlemmars slutläge i `sakprovning.ts` och `tests/utrakningspaket.test.ts`. Typkontroll och fyra riktade prov passerade enligt denna sessions verktygsutskrift. Full testsvit, avsiktligt felprov och commit/push slutfördes inte för dessa ändringar. Den temporära arbetskopian `/private/tmp/valflask-sakprovningsgrind` saknas nu; Git markerar den som `prunable`. Räkna därför inte denna senare kod som bevarad eller levererad. Återskapa den från sessionshistoriken och verifiera på nytt om ingen annan kopia kan återfinnas.

## Next task

Återställ först en arbetskopia från `arbete/sakprovningsgrind` vid den verifierade PR-revisionen. Kontrollera om den opushade paketimplementationen finns bevarad någon annanstans; annars återskapa den från denna sessions tidigare kod och prov. Migrera sedan `pipeline/scripts/utrakning-byt.mts` helt till `utrakningspaket/1`: privat förberedelse, separat sakprövning, extern hash för hela paketet och journalförd verkställning av exakt `promises.json`, `rattelser.json` och `changelog.json`. Ta bort den gamla direkta skrivvägen. Varje sakprövning måste se alla samtidigt ändrade gruppmedlemmars slutläge. Prova verklig CLI, oförändrade original vid fel, manipulerade loggar och omkörning; kör full pipeline, typecheck, ordgrind och avsiktligt felprov. Uppdatera PR 8702 och överlämningen och pusha revisionen.

## Known issues

- Den pushade `utrakning-byt`-skrivaren kan fortfarande skriva direkt; paketbiblioteket och dess CLI-ersättning finns inte i den verifierade Git-revisionen.
- Övriga skrivvägar för ankarsättning, nollning, sortering, grupper, citat, rubriker, indragningar och avvisningar är inte fullt migrerade till samma versionsbundna beslutspaket.
- Modellnamn och formatversion binder ännu inte exakt prompt- och estimatorversion.
- Artefaktimporten skyddar Actions-flödet men är inte en generell låsning för samtidiga lokala skrivare.
- Tester med syntetiska sakbedömningar visar kontrakt och felhantering, inte att källor eller politiska påståenden är sakligt sanna.
- Ingen mänsklig attest har skapats eller får påstås vara gjord. Produktionsflödet kräver fortfarande verklig mänsklig granskning före publicering.
- Den fullständiga genomgången av innehåll, insamlingskvalitet, bedömningskvalitet och automatiseringsgrad är inte färdig.

## Important decisions

- Närhet mellan ett nytt och ett gammalt belopp är aldrig ett godkännande; båda går till granskning.
- Ett förslag får inte ändra publicerade data utan separat sakprövning, extern beslutshash och exakt föreläge.
- Rättelse- och körlogg ska ingå i samma beslutspaket som den publicerade ändringen.
- Saknade eller oavgjorda belägg ska lämnas oavgjorda i stället för att fyllas i.
- Syntetiska testbedömningar är endast testdata och får aldrig användas som faktisk attest.
- Kod-PR får öppnas som utkast, men merge och produktionspublicering är fortfarande ett mänskligt beslut.
