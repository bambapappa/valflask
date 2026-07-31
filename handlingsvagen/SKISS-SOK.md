# Skiss: söket på en sammanslagen sajt

Handlingsvågen har en annan sök än Fläskvågen, och det är inte en olyckshändelse
— det är två fastställda beslut. Den här skissen utgår från att båda hade rätt,
och frågar i stället hur de ska mötas för läsaren.

Underlag till `SAMMANSLAGNING.md`. Ingenting här är fastställt; öppna frågor
längst ner kräver mänskligt beslut.

## Läget: tre sökytor, inte två

| yta | vad den söker i | teknik | var |
|---|---|---|---|
| **A. Prosasök** | sajtens renderade sidor — metod, om, press, krönikor, rättelser | Pagefind (indexerar `dist/`) | valflask `/sok` |
| **B. Entitetssök** | 496 namngivna ting (uppmätt) | eget litet index, exakt + prefix, noll beroenden | HV, sidhuvudet på alla sidor |
| **C. Korpussök** | **23 629 riksdagshandlingar** som inte har egna sidor | eget inverterat index, skärvat, svensk ordstamsreducering | HV `/amnen` |

B:s innehåll idag, uppmätt ur `dist/api/hv/sok-index.json`:

    425 ledamöter · 54 löften · 9 kategorier · 8 partier  =  496

**Notera de 54.** HV indexerar bara de löften som har en vägd handling — och
det är riktigt för HV, där ett löfte utan handling inte har något att visa. Men
Fläskvågen har en sida för **varje** aktivt löfte, med citat, belopp och
uträkning. På en sammanslagen sajt måste därför alla 417 finnas i indexet:
söker läsaren ett löfte som ännu inte mötts av någon riksdagshandling ska det
hittas ändå, och landa på sin löftessida med ett ärligt "ingen ren koppling
ännu". Att bara bära de 54 vidare skulle göra 363 löften osökbara.

Entitetsantalet på en sammanslagen sajt blir alltså:

    417 löften · 425 ledamöter · 22 delfrågor · 9 kategorier · 8 partier · 5 krönikor  =  886

Litet nog att ligga i ett enda index — några tiotal KB.

## Varför C inte kan bli Pagefind

Det här är kärnan, och skälet är strukturellt snarare än en smaksak:

**Pagefind indexerar renderade sidor. Korpusen har inga sidor.** HV-sajten
bygger ~437 sidor, men korpusen är 23 629 handlingar. Motionerna, frågorna och
voteringspunkterna finns bara som data, skivad vid byggtid — och deras
**fulltexter lagras aldrig** (`b-0014`: hämtas vid indexbygge, sparas inte).
Det finns alltså per konstruktion ingenting för Pagefind att indexera. Skulle
man rendera en sida per handling vore det 23 629 sidor för att kunna söka i dem
— och då skulle fulltexterna behöva lagras, vilket beslutet uttryckligen
avvisade.

Dessutom gör C mer än att söka: den räknar **ordtrender som övervikt** mot de
övriga partierna (`b-0022`) och bär partifasetter som bitmask så att ett filter
gäller hela träffmängden och inte bara de sextio som visas (`b-0023`). Det är
ett analytiskt inverterat index, inte en sidsökning.

`b-0018` F3 avvisade Pagefind även för B, med motiveringen noll beroenden och
exakt matchning + prefix. För B är det ett rimligt val men inte det enda; för C
är Pagefind inte ett alternativ alls.

## Varför A inte kan bli B eller C

Prosasidorna — metodsidan, krönikorna, rättelseloggen — är löpande text som
läsaren vill söka fritt i. Ett entitetsindex hittar dem bara på titeln, och
korpusindexet indexerar inte dem. Att bygga om A till ett eget inverterat index
vore att skriva Pagefind själv, utan vinst.

**Slutsats: tre index är rätt svar, inte teknisk skuld.** Det som ska bli ett är
inte indexen — det är **ytan läsaren möter**.

## Den viktigaste regeln: blanda aldrig till en rangordning

`b-0023` har redan avgjort principen, för röstsammanställningen:

> Att ett ord står i en text betyder att ämnet är berört; en röst är något ett
> parti faktiskt gjorde. De två är olika slags kunskap och redovisas därför var
> för sig, aldrig som ett tal.

Samma regel måste styra söket. En sammanslagen träfflista där
"Moderaterna lovade sänkt matmoms" (ett löfte, med citat och prislapp) rankas
sida vid sida med "ordet *matmoms* står i 41 motioner" (att ämnet är berört)
och "M röstade ja till utskottets förslag i den punkten" (en handling) skulle
tysta likställa tre helt olika slags påståenden. Det är precis den
sammanblandning sajten är byggd för att vägra.

**Därför: en sökruta, men aldrig en enda blandad lista.** Grupperna hålls
åtskilda, namngivna i vanligt språk, och varje grupp säger vad dess träffar
faktiskt är.

## Föreslagen yta

### Sidhuvudets ruta (alla sidor) — snabb navigering

Söker i **B**. Svarar direkt medan man skriver, som idag. Grupperat resultat
med rubriker som säger vad saken är:

    kärnkraft
    ─────────────────────────────
    LÖFTEN            3 träffar
      Bygg ny kärnkraft med statliga kreditgarantier   (m)
      …
    SAKFRÅGOR         1
      Kärnkraft — var partierna står
    ─────────────────────────────
    Sök i riksdagens handlingar efter "kärnkraft" →
    Sök i sajtens texter efter "kärnkraft" →

De två sista raderna är utgångarna till C och A. Rutan **lovar aldrig** att den
sökt i korpusen — den erbjuder att göra det. Det håller den snabb och ärlig.

### `/sok` — hela söket, tre avdelningar

En sida, tre tydligt skilda avsnitt i den här ordningen (mest konkret först):

1. **Löften och ståndpunkter** (ur B, med belopp och status ur löftesdatat).
   Det läsaren nästan alltid är ute efter.
2. **Riksdagens handlingar** (ur C) — med fasetterna som redan finns: parti,
   dokumenttyp, motionstyp, riksmöte. Med den utskrivna upplysningen att en
   träff betyder att ämnet är berört, inte att någon lovat eller gjort något.
   Länk vidare till `/amnen` för ordtrender.
3. **Sajtens egna texter** (ur A) — metod, krönikor, rättelser.

Varje avsnitt bär sitt eget antal. Tomt avsnitt skrivs ut som tomt — aldrig
gömt, aldrig utfyllt. Kärnprincipen om tomma celler gäller söket lika mycket
som rutnätet.

### `/amnen` — behålls som eget verktyg

Ämnessöket är ett undersökningsverktyg (ordtrender, övervikt, jämförelser över
tid), inte en uppslagning. Det förtjänar en egen sida och ska inte pressas in i
en träfflista.

## Laddning och budget

Tre index med mycket olika vikt kräver att de laddas i tur och ordning, inte
tillsammans:

1. **B** (~877 poster, några tiotal KB) — vid fokus, som idag.
2. **A** (Pagefind) — laddas först när avsnittet öppnas eller frågan skickas.
   Pagefinds egna skärvor hämtas ändå bara vid behov.
3. **C** — bara den ordstam frågan faktiskt träffar. Skärvorna är stora
   (`data/nyckelord/` är 37 MB som källa) och taket per skärva är satt till
   500 KB med marginal efter `b-0023`. **Ett sammanslaget bygge får aldrig
   hämta mer än en skärva per sökord** — det är den befintliga budgetgrinden
   och den ska följa med oförändrad.

Sökrutan får alltså aldrig göra C-anrop medan man skriver. Bara på uttrycklig
sökning.

## Två saker som måste lösas vid sammanslagningen

**1. `parti/` och `ledamot/` finns i båda sajterna.** Rutterna kolliderar:
valflask har en partisida (löften, kostnader, svängningar), HV har en annan
(handlingar, röster, meritlista). För läsaren finns det **ett** parti. De två
sidorna måste bli en, med vågorna som avsnitt — och entitetsindexet måste peka
på den sammanslagna sidan, inte på två. Samma för de 425 ledamöterna.

Det är en större uppgift än söket i sig, och den bör göras **före** steg 3 i
`SAMMANSLAGNING.md`, eftersom söket inte kan peka rätt förrän målen finns.

**2. Ordstamsreduceringen bör gälla allt.** HV har en verifierad svensk
ordstammare (`stam.ts`, 0 avvikelser mot Snowball på 16 017 ord). Fläskvågens
Pagefind stammar med sin egen svenska modul. Att söka "skolan" och "skola" ger
alltså inte nödvändigtvis samma träffar i avsnitt 1–2 som i avsnitt 3 — en
inkonsekvens läsaren märker. Minst: skriv ut det. Bäst: kör B:s frågor genom
`stam.ts` så att avsnitt 1 och 2 beter sig som avsnitt 3.

## Öppna frågor — kräver mänskligt beslut

- **S1. Ska sidhuvudets ruta söka i C på uttryckligt kommando, eller bara
  länka vidare?** Skissen föreslår länk (snabbt och ärligt). Alternativet är en
  "sök överallt"-knapp som gör alla tre — dyrare, men färre klick.
- **S2. Behålls Pagefind alls?** Prosasidorna är få (metod, om, press,
  rättelser, 5 krönikor). De skulle kunna läggas in i B som titel + kort
  utdrag, och då försvinner ett beroende helt — i linje med `b-0018` F3:s
  noll-beroenden-linje. Priset: ingen fritextsökning inuti krönikornas löptext.
  Växer krönikorna till många är Pagefind rätt; är de få är det överkill.
- **S3. Ordningen mellan avsnitten.** Skissen sätter löften först. Ett
  försvarbart alternativ är att låta träffmängden avgöra — men då blir
  ordningen olika för olika sökningar, vilket gör sidan svårare att lita på.
- **S4. Gemensam stamreducering enligt punkt 2 ovan** — göra eller bara skriva
  ut skillnaden.
- **S5. Ska kategorierna ligga kvar i entitetsindexet?** HV bär 9 kategorier
  som sökbara poster. På en sammanslagen sajt konkurrerar de med Fläskvågens
  egna ämnesingångar, och en träff på "välfärd" som är ett *filter* ser för
  läsaren ut som en träff som är ett *ting*. Antingen märks de tydligt som
  ingångar, eller lyfts de ur indexet och blir enbart filter.
