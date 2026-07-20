# Projektminne för drygast.nu / valflask

Regler som gäller allt arbete i det här repot — chat, issuekommentarer,
commit-texter, PR-texter, sajtcopy, prompter och dokumentation.

## Språkregler

- **Ordet "verbatim" är förbjudet.** Skriv "ordagrant", "exakt citat" eller
  "ord för ord" i stället. Det gäller överallt: chatt, issues, commits,
  PR-texter, sajtens texter, prompter, dokumentation.
  - Enda undantaget är det latinska citatet "verbatim et litteratim",
    återgivet som citat.
  - Befintliga kodidentifierare (t.ex. `normalizeForVerbatim`) får finnas
    kvar, men ny prosa och nya namn ska undvika ordet.
- Skriv språk som alla förstår. Ingen teknisk jargong i texter som riktar
  sig till läsare, partier eller journalister.

## Parallella sessioner

Flera Claude-sessioner kan arbeta i repot samtidigt. Bindande:
`main` är samlingspunkten och `HANDOFF.md` är anslagstavlan — läs
versionen på `origin/main` innan nytt arbete, gör anspråk under
"Pågår just nu" före start, skörda aldrig parallellt. Fullständiga
regler i HANDOFF.md §"Samarbete mellan parallella sessioner".

## Kärnprinciper (beslutade av ägaren)

- **Tomma celler är ärliga.** Hitta aldrig på svar för att fylla täckning.
  Ett parti utan rent, exakt citat genom grindarna lämnas tomt.
- **Citatgrindarna lossas aldrig.** Räcker inte citatet: leta bättre citat
  eller formulera om frågan — sänk aldrig kravet på exakt återgivning.
- **Tyst rättelse är förbjuden.** Fel rättas synligt: rättelsenot på
  berörd sida plus post i `data/rattelser.json`.
- **Krönikor är ögonblicksbilder.** Rättas en krönika ska beloppen räknas
  om från datat som gällde när den genererades — inte från dagens siffror.
- **Arkivlänkar måste bära citatet.** En arkivkopia accepteras bara om
  citatet står ordagrant i själva ögonblicksbilden.
