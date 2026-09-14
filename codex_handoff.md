# Codex Handoff

## Current task

Slutföra den fullständiga tillits- och processförändringen för utlovat.se i
`bambapappa/valflask`. Uppdraget omfattar saklig kontroll av löften,
kopplingar, grupper, dubbletter, beräkningar och aktörsnivåer samt ett flöde
från insamling via kvalitetssäkring till publicering med så liten manuell
insats som möjligt. En verklig människa ska fortfarande granska och godkänna
det exakta material som publiceras.

Kodspåret ligger i utkast-PR 8702 på grenen `arbete/sakprovningsgrind`.
Projektets gemensamma plan och arbetsläge ligger i `bambapappa/handoff`, PR
406, på grenen `arbete/maskinell-provningsomfattning`.

## Completed

- Införde frysta, versionsbundna löftes-, kalkyl-, uträknings- och
  löftestypsförslag som binder föreläge, avsett slutläge och innehållshash.
- Införde separat sakprövning med tio moment. Momenten börjar som oavgjorda
  och kräver spårbara referenser.
- Införde fullständiga beslutspaket som binder `promises.json`,
  `rattelser.json` och `changelog.json` till samma externa beslutshash.
- Migrerade `utrakning-byt` och `sortbyte` från direkt skrivning till flödet
  förbered, kontrollera och verkställ. Deras gamla direkta skrivvägar är
  borttagna.
- Säkerställde att samtidiga gruppändringar prövas mot gruppens gemensamma
  slutläge.
- Krävde uttryckliga numeriska nollor för låg-, bas- och högvärde innan ett
  löfte får klassas som inriktningslöfte.
- Ändrade bakåtfyllningen så att både närliggande och avvikande kalkyler
  sparas som granskningsförslag i stället för att godkännas automatiskt.
- Skyddade artefaktimporten från att skriva över publicerade löften,
  rättelselogg eller körlogg. Importen fyller endast granskningskön.
- Lade till kontroller för ändrat föreläge, paketmanipulation, omkörning,
  låsning och bevarade original vid fel.
- Uppdaterade genomförandeplanen och arbetsinstruktionen för sakprövning med
  de nya kontrakten och kvarvarande begränsningar.

Den senaste bevarade kodrevisionen är
`9f0b876b8e048242a5bf30e77905605860181f83`. För den revisionen passerade den
lokala fulla pipelinesviten med 1 245 tester: 1 244 godkända, 0 fel och 1
befintligt överhoppat. Typkontroll och ordgrind passerade. Ett avsiktligt fel,
där en extern hashreferens togs bort, fällde två av tre riktade tester; efter
återställning passerade testerna igen.

Den senaste bevarade revisionen i handoff-repot är
`9e4f541151e0e634635f4e5147456932bdc8181b`.

## Current status

Kontrollerat mot GitHub 2026-09-14:

- PR 8702 är öppen som utkast och pekar på exakt kodrevision `9f0b876b`.
- `test-handlingsvagen` är godkänd för revisionen. `test-pipeline` körde
  fortfarande vid kontrollen och får därför inte beskrivas som godkänd ännu.
- PR 406 i handoff-repot är öppen och pekar på exakt revision `9e4f541`.
- PR 8703 innehåller denna fil. Kontrollerna var godkända före denna
  uppdatering och körs på nytt efter push.

Inget i PR 8702 är mergat eller aktiverat i produktion. Ingen faktisk
sakgranskning eller mänsklig attest har genomförts genom det nya flödet.

## Next task

Implementera ankarsättning som nästa sammanhållna enhet i PR 8702.

1. Registrera arbetet under "Pågår just nu" i handoff-repots
   `projekt/utlovat/HANDOFF.md` och pusha anspråket före kodändringen.
2. Inför ett fryst `ankarforslag` som binder hela löftesbeståndet,
   målpostens exakta föreläge, ankarets exakta föreläge och målpostens exakta
   slutläge.
3. Stoppa indirekta ankarkedjor som återkommer till målposten, inte bara den
   direkta tvåpostscykel som den nuvarande koden upptäcker.
4. Kräv att målposten har ett uttryckligt nollspann och att ankarets låg-,
   bas- och högvärde är ändliga, ordnade och har positiv bas.
5. Bind ankarets sakunderlag, rättelsepost och körlogg till ett fullständigt
   beslutspaket med extern beslutshash.
6. Migrera `pipeline/scripts/ankarsattning.mts` till förbered, kontrollera och
   verkställ under lås. Ta bort den direkta skrivvägen.
7. Prova verklig CLI i isolerad kopia, manipulerat paket, ändrat föreläge,
   indirekt cykel, omkörning och oförändrade original vid fel. Kör därefter
   full pipelinesvit, typkontroll, ordgrind och ett avsiktligt felprov.
8. Pusha kodrevisionen, uppdatera PR 8702 och dokumentera verifieringsutfallet
   i PR 406.

Efter ankarsättningen är den rekommenderade ordningen: paketera nollning,
paketera avvisning och återstående direkta skrivare, införa gemensamma
paketbyggare där kontrakten är kända, och därefter köra den faktiska
innehållsrevisionen samt mäta insamlingens täckning och bedömningens
felutfall.

## Known issues

- Ankarsättningens nuvarande skript kontrollerar materialet före låsning och
  skriver flera filer i följd. Det kan därför verkställa ett gammalt
  föreläge eller lämna en delvis genomförd ändring.
- Ankarsättningen upptäcker bara en direkt tvåpostscykel. Längre cykler är
  ännu inte uttryckligen stoppade i skrivvägen.
- Skrivvägar för nollning, avvisning, grupper, citat, rubriker och
  indragningar är inte fullt migrerade till versionsbundna beslutspaket.
- Modellnamn och formatversion binder ännu inte exakt prompt- och
  estimatorversion.
- Artefaktimportens skydd gäller Actions-flödet och är inte en generell
  transaktion för alla samtidiga lokala skrivare.
- Den fullständiga sakliga genomgången av löften, kopplingar, grupper,
  dubbletter, beräkningar, partital, inriktningslöften och aktörsnivåer är
  inte utförd. Proven visar kontrakt och felhantering, inte att källorna eller
  de politiska påståendena är sanna.
- Insamlingsprocessens täckning, falska negativa fynd och källprioritering är
  ännu inte mätta mot ett oberoende stickprov.
- Bedömningsprocessens träffsäkerhet och graden av möjlig säker automation är
  ännu inte mätta mot dubbel mänsklig bedömning.
- Ingen faktisk mänsklig attest har skapats. Produktionsflödet måste verifiera
  identiteten bakom beslutet och det exakta beslutspaketet före publicering.
- PR 8519 har en känd konflikt som ska hanteras vid ett senare tillfälle.
- PR 8702:s beskrivning behöver uppdateras med de senaste uträknings- och
  löftestypspaketen samt aktuella provtal.
- PR 406 är fortfarande öppen. Kontrollera dess blandade historik och
  aktuella diff före eventuell sammanslagning.

## Important decisions

- Närhet mellan ett nytt och ett gammalt belopp är aldrig ett godkännande;
  båda ska bli granskningsförslag.
- Ett förslag får inte ändra publicerade data utan separat sakprövning,
  extern beslutshash och exakt överensstämmande föreläge.
- Publicerad data, offentlig rättelselogg och körlogg ska ingå i samma
  beslutspaket.
- Saknade eller oavgjorda belägg ska förbli oavgjorda.
- Partiets egen siffra ska användas när den finns. Ett löfte med egen siffra
  får inte nollas som inriktningslöfte.
- Ett inriktningslöfte ska bära rätt typ och ett uttryckligt nollspann.
- Partikopplingar och ledamotskopplingar ska prövas som skilda
  aktörshandlingar.
- Syntetiska testbedömningar visar endast systemets kontrakt och får aldrig
  användas som faktisk attest.
- En människa ska godkänna det hashbundna slutpaketet före publicering; en
  modell eller automatisk kontroll får förbereda underlaget men inte utge sig
  för att vara den människan.
- Kod-PR får öppnas som utkast, men merge och produktionspublicering är ett
  mänskligt beslut.
