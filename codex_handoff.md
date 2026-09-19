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
- Lade till `utrakningsforslag/1` och `utrakningspaket/1` för ändringar av befintlig uträkningstext, inklusive exakt före-/efterläge, rättelsepost och körlogg.
- Lade till tester för normalfall, felaktiga underlag, manipulerade hashar, samtidiga gruppändringar, CLI-flöden och avsiktliga regressioner.
- Uppdaterade överlämningsplan och `haller-det`-skill med begränsningar och nästa steg.

## Current status

Senast dokumenterade kodrevision är `03518b3c` på utkast-PR 8702. Senast dokumenterade fulla pipelinekörning: 1 233 tester, 1 232 godkända, 0 fel och 1 befintligt överhoppat. Typkontroll och ordgrind passerade. Ändringarna är inte mergade eller aktiverade i produktion. Den lokala huvudgrenen stod vid revision `6041fcca` när denna fil skrevs; kontrollera alltid aktuell PR- och CI-status innan du fortsätter.

## Next task

Migrera `pipeline/scripts/utrakning-byt.mts` helt till `utrakningspaket/1`: privat förberedelse, separat sakprövningsfil, extern pakethash och journalförd verkställning av exakt de tre granskade filerna. Ta bort den gamla direkta skrivvägen. Lägg till ett verkligt CLI-test som visar oförändrat original vid varje fel, kör full pipeline, typecheck och ordgrind, uppdatera PR 8702 och överlämningen och pusha revisionen.

## Known issues

- Den äldre `utrakning-byt`-skrivaren kan fortfarande skriva direkt; det nya paketbiblioteket är ännu inte den enda skrivvägen.
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
