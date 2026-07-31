# DESIGN.md — Riktning A: "Diarienummer möter löpsedel"

**Beslutad 2026-06-12 i M1 (Fable). Bindande för all UI-implementation. Avvikelser kräver rad i `DECISION_LOG.md`.**
Detta dokument konkretiserar §11 i SPEC.md till verkställbara regler. Tokens och basregler är redan implementerade i `src/styles/tokens.css` och `src/styles/base.css` — bygg komponenter mot dem, hårdkoda aldrig värden.

---

## 1. Koncept

Sajten är **en myndighetsakt som tvingas registrera löpsedelssiffror**. Två röster, strikt åtskilda:

| Röst | Estetik | Får användas till | Får ALDRIG användas till |
|---|---|---|---|
| **Akten** (stommen) | Riksdagstryck: hårlinjer, smala tabellverk, marginalnoter, diarienummer, stämplar, serif-brödtext | Allt: struktur, tabeller, diagram, metadata, brödtext | — |
| **Löpet** (glasyren) | Kvällstidningslöpsedel: svart platta, gul jättesiffra, kondenserad versalrubrik | ENDAST nyckeltal (totaler, gap, "Veckans fläsk"-rubrik) och sajtens egen identitet i sidhuvud/OG | Brödtext, tabeller, diagramdata, partispecifikt innehåll utöver siffran |

Humorn uppstår i krocken — byråkratiskt allvar om absurda summor. Skämt bor enbart i avgränsade copyfält (quip, krönika) per §1.5. Siffror, tabeller och diagram är alltid torra.

**Lackmustest för varje ny vy:** Skulle den kunna vara en bilaga i ett riksdagstryck — där någon har stämplat dit en löpsedelssiffra? Om "nej" på första halvan: för mycket löp. Om "nej" på andra: för lite.

---

## 2. Typografi

Tre självhostade familjer (woff2 i `public/fonts/`, OFL-licenser bredvid filerna). Inga runtime-anrop till externa font-CDN.

| Roll | Font | Vikter | Användning |
|---|---|---|---|
| **Display** | Anton | 400 | Rubriker, kickers, sajtnamn. ALLTID versal (`text-transform: uppercase`), `letter-spacing: 0.01em`, `line-height: 1.04`. Aldrig för tal. |
| **Siffror & stämpel** | IBM Plex Mono | 400, 700 | **Alla tal utanför brödtext**: belopp, nyckeltal, tabellsiffror, datum, diarienummer, data_hash, taxametern, jättesiffror. Dessutom: etiketter, knappar, stämplar, navigation, källrader. Etiketter versala med `letter-spacing: 0.07em`. |
| **Brödtext** | Source Serif 4 (variabel) + italic | 400–700 | Löpande text, ingresser, citat (italic), krönikor, metodsidor. |

**Signaturkomposition** (hero, partitotal, OG-bild): kicker i Anton → jättesiffra i Plex Mono 700 → underrad i Plex Mono 400. Ordet skriker i Anton, siffran stämplas i mono. Blanda aldrig fonterna inom samma rad.

**Sifferregler — siffror är produkten:**
- `html { font-variant-numeric: tabular-nums lining-nums; }` gäller globalt (Source Serif 4 har tnum; mono är tabulär per konstruktion).
- Tal i löpande brödtext sätts i serifen (med tabular-nums); tal i alla andra sammanhang i Plex Mono via klassen `.num` eller komponentregler.
- Svensk formatering: tusentalsavgränsare U+00A0 (hård mellanslag), decimalkomma, enhet efter värde ("412 mdkr"). Belopp < 10 mdkr: en decimal; ≥ 10 mdkr: heltal. `basis = llm_estimat` typograferas alltid "≈ " före värdet (§8).
- Taxametern och alla animerade/uppdaterade tal MÅSTE vara mono (stabil bredd, ingen layoutshift).

**Skala** (rem, definierad i tokens): steg -1: 0.8125 · 0: 1.0625 · 1: 1.25 · 2: 1.5625 · 3: 2 · 4: 2.75 · 5: clamp(3.25, 8vw, 6) · 6: clamp(4.5, 12vw, 9). Brödtext radavstånd 1.6, maxbredd 66ch.

**Fallbackstackar:** `'Anton', sans-serif` · `'IBM Plex Mono', monospace` · `'Source Serif 4', serif`. (Generiska fallbacks är haverireserv, inte designval — Inter/Roboto/Arial/systemfonter/Space Grotesk är förbjudna som val per §11.)

**Förladdning:** preload Anton 400, Plex Mono 700 och Source Serif 4-variabeln i `<head>`; `font-display: swap`. Total fontbudget ≤ 170 kB woff2.

---

## 3. Färg

EN signalfärg. Partifärger finns inte i sajtens kostym.

| Token | Värde | Roll |
|---|---|---|
| `--papper` | `#F6F3EC` | Bakgrund (varmt myndighetspapper) |
| `--svarta` | `#111111` | Text, hårlinjer, plattor (tryckbläck) |
| `--gul` | `#FFD600` | Signalfärgen: löpsedelsgul |
| `--grafit` | `#3F3D38` | Sekundärtext (AA ≈ 9:1 på papper) |
| `--dis` | `#6E6A61` | Metadata/bildtext (AA ≈ 5,6:1 på papper) |
| `--linje-svag` | `#C9C3B6` | Underordnade hårlinjer |
| `--platta-text` | `#F6F3EC` | Text på svärta-plattor |

**Gul-reglerna (uttömmande — gul förekommer INTE i andra roller):**
1. Jättesiffror och nyckeltal på svärta-platta (gul text, endast tal/korta etiketter, aldrig brödtext).
2. Markeringsplatta bakom enstaka tal/ord på papper (svart text på gul, som överstrykning).
3. Markerat värde i diagram (den stapel/punkt sidan handlar om).
4. Fokusring på mörk bakgrund.
5. Gul markering av ".nu" i sajtnamnet.

**Partifärger:** endast inuti datavisualisering där partier jämförs, hämtade ur `parties.json` (med AA-justerad textvariant). Aldrig i ramverk, länkar, knappar, plattor eller OG-bilder.

**Ingen röd/grön semantik.** Gap, överskridanden och "tillbakadragen" uttrycks med svärta, gul markering och stämpeltext — inte med varningsfärger (neutralitet + en-färgsregeln). Ingen dark mode: papper är konceptet (`color-scheme: light`).

---

## 4. Form & layout

- **`border-radius: 0` överallt. Inga box-shadows, inga gradienter, inga emoji i UI.** Ytor skapas med hårlinjer och plattor, inte "kort".
- **Hårlinjegrammatik:** sektionsgräns `1px solid var(--svarta)` · underordnad avgränsning `1px solid var(--linje-svag)` · tabellverk: `2px` topplinje, `1px` under huvudrad, `1px` svag mellan rader, `2px` bottenlinje.
- **Grid:** prosa max 66ch; datavyer max 80rem. Vid ≥ 1100px: huvudspalt + marginalnotspalt 17rem (metodnoter, källnoter). Under 1100px renderas marginalnoter som numrerade noter efter stycket.
- **Länkar:** alltid understrukna (`text-decoration-thickness: 1px; text-underline-offset: 2px`), svärta. Externa källänkar får mono-suffix `↗` (tecken, ej ikonbibliotek).
- **Knappar ("blankettknapp"):** mono versal, `1px solid var(--svarta)`, rektangulär, padding 0.5rem 1rem. Hover/aktiv: inverterad (svärta bg, papper text). **Inga CSS-transitions någonstans** — tillståndsbyten är omedelbara (trycket är statiskt; enda rörelsen på sajten är taxametern, §8 nedan).
- **Fokus:** `outline: 3px solid var(--svarta); outline-offset: 2px` på ljus bakgrund; `outline-color: var(--gul)` på svärta. Skip-länk först i DOM.

---

## 5. Komponentmotiv (byggs i M1, namnen är bindande)

- **`SiteHeader`** — "DRYGAST" i Anton + ".NU" på gul markeringsplatta. Därunder mono-rad: `VÅGSTATION FÖR VALFLÄSK · UPPDATERAD {datum} · AKT {data_hash kort}`. Nav i mono versal med hårlinje under.
- **`Lopsedel`** — svärta-platta, full bredd: kicker (Anton, platta-text) → jättesiffra (gul, mono 700, steg 6, taxameter på `/`) → underrad (mono 400, platta-text): `för mandatperioden 2027–2030 · {N} löften · {datum}`. Direkt under plattan: svarsförst-stycket i serif (§12).
- **`ArendeHuvud`** — överst på varje löftessida, mono inom 1px-ram: `ÄRENDE {id} · REGISTRERAT {date_stated} · KÄLLA {domain} · STATUS {status versal}`. Id:t är sidans permanenta identitet — visa det stolt.
- **`Stampel`** — mono 700 versal, `2px solid`, padding 2px 10px, `transform: rotate(-2.5deg)`. Endast för statusord ur datamodellen: `UPPDATERAT`, `TILLBAKADRAGET`, `INFRIAT`, samt `FINANSIERING EJ ANGIVEN` när `financing_claimed.described = false`. Samma stämpelregler för alla partier.
- **`Tabellverk`** — radnummerkolumn (mono, --dis), beloppskolumner högerställda i mono, enheter i kolumnhuvudet (aldrig per cell), hårlinjer enligt §4. Ingen zebra.
- **`Citat`** — serif italic, steg 1, 2px svärta vänsterlinje, indrag; källrad i mono under: `— {person/parti}, {domain}, {datum} · [källa ↗] [arkiv ↗]`. Citatet är sajtens bevismaterial — ge det rum.
- **`Marginalanteckning`** (quip-fältet) — hårlinje ovan, mono-etikett `MARGINALANTECKNING`, därunder quipen i serif italic. Tydligt avgränsad per §1.5: humorn har en egen, märkt ruta.
- **`GapMatare`** — byggtids-SVG: horisontell svärta-stapel (Fläsket) mot hårlinjemarkerat reformutrymme × 4; överskjutande del gulmarkerad med mono-etikett `GAP ≈ {X} MDKR`.
- **`KallRad`** — obligatorisk under varje diagram och i varje OG-bild: mono steg -1, `Källa: {basis/källa} · Hämtad {datum} · drygast.nu`.
- **`MetodLank`** — varje sida med belopp bär `Uppskattningar — så här räknar vi → /metod` (§8) i mono.
- **`SiteFooter`** — hårlinje, mono: data_hash (länk till `/api/v1/integrity.json`), CC BY 4.0, länkar (metod, rättelser, press, api), disclaimern ur §17: "Uppskattningar enligt öppen metod — inte facit, inte rådgivning."

---

## 6. Diagram (byggtids-SVG)

- Svärta på papper. Staplar fyllda `--svarta`; det värde sidan handlar om markeras `--gul`. Partifärger endast när partier jämförs sida vid sida.
- Inga 3D-effekter, skuggor, gradienter eller gridlines — endast baslinje (1px svärta) och vid behov svaga referenslinjer (`--linje-svag`).
- Text i SVG: titel Anton-ekvivalent (versal, 20px), axel-/dataetiketter Plex Mono 12px. Fonter måste vara inbäddade eller säkras via sidans CSS (SVG:n renderas inline).
- Varje diagram bär titel, `KallRad` och "drygast.nu" — de kommer att skärmdumpas, designa för det. Fast `viewBox` (bredd 720), höjd efter innehåll.

---

## 7. OG-bilder (satori + resvg vid build)

1200 × 630, identisk kostym för alla partier och löften (ingen partifärg — neutral kostym):

1. Topprad (mono 28, `--dis` på svärta): `DRYGAST.NU · ÄRENDE {id} · {domain}`
2. Jättesiffra (Plex Mono 700, gul, ~176px, krymp till 128px om > 9 tecken): `≈ 412 MDKR`
3. Titel (Anton, vit, versal, max 2 rader, 56px)
4. Bottenrad ovanför 2px hårlinje (mono 24): `{KallRad-innehåll}` + `CC BY 4.0`

Partisidor: samma layout, titel = `VAD KOSTAR {PARTI}S VALLÖFTEN?`. Förstasidans OG = totalsiffran.

---

## 8. Motion

**En (1) orkestrerad effekt på hela sajten:** taxametern på `/`. Räknar 0 → total på 1100 ms, easeOutQuart, körs en gång vid load. Mono + tabular ⇒ ingen layoutshift. Vid `prefers-reduced-motion: reduce` (eller utan JS): slutvärdet renderas direkt — siffran finns alltid i HTML:en (SSG), JS:en animerar bara upp till den. Inga andra animationer eller transitions existerar.

---

## 9. Tillgänglighet & utskrift

- WCAG 2.1 AA. Kontrastpar som används: svärta/papper 17,4:1 · grafit/papper 9,3:1 · dis/papper 5,6:1 · svärta/gul 12,9:1 · gul/svärta 12,9:1 · papper/svärta 17,4:1. Partifärgstext i diagram använder den AA-justerade varianten ur `parties.json`.
- `lang="sv"`, en H1 per sida, semantisk HTML, skip-länk, synligt fokus (§4), `aria-hidden` på dekorativa stämplar/rotationer? Nej — stämplar bär data (status): riktig text, läsbar ordning, rotationen är ren CSS.
- **Print-CSS (sidorna ska duga som flygblad):** vit bakgrund, ren svärta, dölj nav/knappar/sök; svärta-plattor blir 2px-ramade rutor med svart text; efter varje extern länk i huvudinnehåll skrivs URL:en ut i mono inom parentes; sidfot med data_hash och URL på varje utskriven sida.

---

## 10. Prestandabudget (mäts i M1:s DoD)

- JS på `/`: endast taxametern (< 2 kB). Kombinatorn (`/jamfor`): vanilla-TS-ö ≤ 25 kB. Total JS-budget per sida ≤ 60 kB — vi ska ligga under en tiondel av den på alla sidor utom `/jamfor`.
- Fonter ≤ 170 kB woff2 totalt, preload av 3 kritiska filer, `font-display: swap`.
- LCP-elementet på `/` är löpsedelsplattans text (ingen hero-bild existerar). Mål LCP < 1,5 s mobil, Lighthouse ≥ 95/95/100/100.

---

## 11. Förbjudet (påminnelse ur §11 — gäller utan undantag)

Inter/Roboto/Arial/systemfonter/Space Grotesk · Google Fonts-anrop · emoji i UI · glassmorphism · lila gradienter · hero-blobbar · karuseller · AI-genererade illustrationer · stockfoton · rundade hörn · skuggor · partifärger utanför dataviz · humor i siffror, tabeller eller diagram.
