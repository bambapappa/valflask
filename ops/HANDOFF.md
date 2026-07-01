# HANDOFF — drygast.nu ("Fläskvågen")

Status per 2026-06-24. Komplement till `DECISION_LOG.md` (beslut), `ops/AGARSTEG.md` (kontosteg) och `ops/RUNBOOK.md` (drift/katastrof).

## 1. Vad det är
Autonom pipeline som hämtar svenska partiers/mediers RSS + riksdagens öppna data, extraherar vallöften med LLM, kör säkerhetsgrindar (§7), kostnadssätter och publicerar en statisk Astro-sajt. Människa granskar gränsfall. Primär hosting Cloudflare Pages; speglar GitHub Pages + Netlify.

## 2. Status nu
- **M0–M7 byggt och grönt.** Alla bilaga-D-konstanter källsatta (inga VERIFIERA kvar).
- **Pipelinen kör skarpt** via GitHub Actions (`pipeline.yml`, 3×/dygn + manuell). Entrypoint `pipeline/src/cli-run.ts`.
- **Modeller (GitHub Variables) — NY uppsättning per 2026-06-24 (modell per endpoint):** Primären (OpenRouter) och fallbacken (OpenCode Go) har olika namnscheman, så de tar nu olika modell-ID:n via en map i klienten. Sätt sex variabler — de tre `*_FALLBACK` är dagens Zen-namn oförändrade:
  | Variable | Primär (OpenRouter) | `*_FALLBACK` (Go/Zen) |
  |---|---|---|
  | MODEL_EXTRACT | `deepseek/deepseek-v4-pro` | `deepseek-v4-pro` |
  | MODEL_VERIFY | `moonshotai/kimi-k2.7-code` | `kimi-k2.7` |
  | MODEL_COPY | `z-ai/glm-5.2` | `glm-5.1` |

  Fallback-endpoint kvar: `LLM_FALLBACK_BASE_URL=https://opencode.ai/zen/go/v1`. Med kredit på OpenRouter kör primären pay-per-use (högt tak); Go är äkta reserv. Koden är klar (väntar PR + variabelbyte, se §9).
- **Senast mergat:** kostnadsestimat + dubletthantering + manuell inrapportering (PR #21), CI-push-race-fix (rebase+retry).
- **Kvar innan "skarp lansering":** godkänn första riktiga batchen, töm `data/promises.json` → `[]` (släcker EXEMPELDATA-bannern), växla `PIPELINE_MODE` → `auto` efter en stabil vecka.

## 3. Drift — review-flödet
Efter en körning, lokalt i `pipeline/`:
- `pnpm review list` — visar poster i `data/needs_review.json` med kostnad och ev. dubblett-flagg.
- `pnpm review approve <i>` — godkänn (bär med kostnaden). `approve <i> <low> <base> <high>` — sätt egen kostnad (msek). `approve <i> --group p-XXXX` — länka dublett (delad group_id → räknas en gång via R3, båda källor syns).
- `pnpm review reject <i> <orsak>`.
- `pnpm review add <fil.json>` — manuell inrapportering av löfte modellen missat (t.ex. TV). Kräver **https-källa** + giltiga partikoder/kategori. Mall:
  `{"title":"…","parties":["sd"],"quote":"…","category":"skatter","source":"https://www.svtplay.se/…"}`

Kostnad: löften med belopp i text → härlett (conf 0,7, kan publiceras). Utan belopp → LLM-estimat (≈), går **alltid** till review, redigerbart. Dubletter: heuristik (parti+kategori+titellikhet) flaggar; du länkar eller avvisar.

## 4. "Run pipeline" blev rött ibland — FIXAT (i arbetsträdet, väntar på commit)
**Orsak:** rate-limit/timeout-storm. Två buggar, nu rättade:
1. **`index.ts`** markerade ALLA bearbetade artiklar som sedda, även failade → de provades aldrig om (dataförlust). Nu: seen markeras bara för artiklar som inte finns i `errors`; `errorRate>=0.5`-kortslutningen (som slängde hela batchen) borttagen → partiella lyckade resultat behålls.
2. **`cli-run.ts`** avslutade med kod 1 på transienta fel → röd CI. Nu: kod 0 vid transient/partiellt (loggar varning); kod 1 endast vid konfigfel. Ihållande avbrott syns via §15 (stale-banner/UptimeRobot).

Verifierat i /tmp: typecheck rent, 113 tester, check-t7 OK. Ligger ocommittat i arbetsträdet tillsammans med CI-push-race-fixen (`pipeline.yml`) — committa i en PR (se sektion 7).

## 5. Modell/limit — beslut: ingen flash, betala för högre limit
**Uppdaterat 2026-06-24:** roten var att OpenRouter (primär) aldrig anropades — samma model-sträng gick till båda endpoints och Zen-namnen gav 4xx på OpenRouter → allt föll till Go. Fixat med modell per endpoint (§9). Med kredit på OpenRouter blir "Fund OpenRouter som primär" nedan nu det faktiska beteendet.

Kvaliteten på extract är viktigast (ordagranna citat, hitta löften). Behåll en stark modell. Felen är **rate limit/timeout**, inte modellval. Två vägar utan kvalitetstapp:
- **OpenCode Zen "Use balance":** fyll på Zen-saldo och slå på "Use balance" i konsolen → `deepseek-v4-pro` fortsätter köra förbi Go-planens gräns (betalar overflow).
- **Fund OpenRouter som primär:** lägg kredit på OpenRouter och kör en stark modell där (primär-endpointen finns redan). Pay-per-use, höga gränser.
Vår throttle (2,5 s) + retry + batch 20 + (efter fix 4) retry-av-failade gör att låg, jämn volym sällan slår i taket — overflow-betalning täcker resten.

## 6. Återstående ägarsteg
Se `ops/AGARSTEG.md`. Kvar: Cloudflare custom domain `drygast.nu`+`www`, zonfilsbackup; Netlify-secrets (`NETLIFY_SITE_ID` ska vara **Secret**, inte Variable); UptimeRobot; E1 affiliate; ev. GPG-signering av release-taggar.

## 7. Arbetsflöde & konventioner
- **PR-krav:** rulesetet kräver PR till `main` för människor; GitHub App-boten (`BOT_APP_ID/KEY`) är bypassad och pushar pipelinedata direkt.
- **Git (mot mangling-paste & lås):** `git stash --include-untracked` → `git checkout main && git pull` → ny gren → `git stash pop` → commit (**inga backticks i meddelandet** — zsh tolkar dem) → push → `gh pr create … && gh pr merge …`.
- **Test:** kör i /tmp-klon (mounten kan inte radera/testa rent): rsync repo → `pnpm install` → `pnpm test` + `pnpm exec tsc --noEmit` + `pnpm check-t7`. Sajt: `pnpm build` + `pnpm test:t1/t3/t9`.
- **Varje beslut loggas i `DECISION_LOG.md`.** SHA-pinna actions (men `pnpm/action-setup@v4` är en tagg efter att en felaktig SHA orsakade fail — får repinnas till verifierad SHA).

## 8. Arkitektur i korthet
`pipeline/src/`: `cli-run.ts` (entrypoint, env→ctx), `index.ts` (`runPipeline`), `fetch.ts` (`LiveSource`, hämtar alla feeds; kapning på nya artiklar sker i runPipeline), `extract.ts` (A1 + staket-rensning + normalisering), `gates.ts` (G1–G5), `verify.ts` (A2), `cost.ts` (A5 + härlett/LLM-estimat), `copy.ts` (A3/A4 quip), `publish.ts`, `review.ts` (CLI), `similarity.ts` (dubletter), `llm.ts` (OpenRouterClient: timeout+retry+backoff+throttle, primär→fallback). Prompts i `pipeline/prompts/`. Sajt i `site/` (Astro SSG; comparison-motor i `site/src/lib/aggregates.ts`, R3-dedup på group_id).


## 9. Modell per endpoint — KLART & DEPLOYAT 2026-06-25 (PR #24 mergad, 6 variabler satta)
**Status:** PR #24 (`f0eed34`/`f0b3f39`) i main. Alla 6 GitHub Variables satta (verifierat `gh variable list`). Bekräftat i drift att extraktionen fungerar utmärkt på OpenRouter-primären (`Klart: 28 publicerade, 22 till review, 0 fel`, 1–5 kandidater/artikel). Modellbytet var ALDRIG problemet — se §10.

**Bakgrund (förra sessionen, slut på tokens mitt i):** ägaren misstänkte att OpenRouter (primär) aldrig kördes. Bekräftat: samma model-sträng skickades till båda endpoints; Zen-namnen (`deepseek-v4-pro` m.fl.) ger 4xx på OpenRouter → allt föll till Go → Go-taket slog i. Ägaren ville behålla **både** primär och fallback ("ändra i koden och öka på antalet variabler").

**Gjort i denna session (i arbetsträdet, ocommittat):**
- `pipeline/src/llm.ts`: ny valfri `fallbackModelMap` på `OpenRouterClient`. Modell sätts **per endpoint** — primären får model-strängen oförändrad, fallbacken översätter via mappen (saknas nyckel → primär-strängen, bakåtkompatibelt).
- `pipeline/src/cli-run.ts`: läser `MODEL_EXTRACT_FALLBACK`/`MODEL_VERIFY_FALLBACK`/`MODEL_COPY_FALLBACK` (all-or-none-validering), bygger primär→fallback-mappen och skickar den till klienten.
- `pipeline/tests/{llm,cli-run}.test.ts`: 4 nya tester (fallback använder mappat ID; identitet utan mappning; all-or-none kastar; full config bygger).
- Verifierat i /tmp-klon: typecheck rent, **117 tester gröna**, check-t7 OK. (Tester kördes via `tsc`-emit + `node --test` eftersom sandlådan saknar pnpm och esbuild-binären var fel plattform — irrelevant för CI.)

**Kvar — ägarsteg (i denna ordning):**
1. **Sätt GitHub Variables** (se tabell §2). De tre `*_FALLBACK` = dagens värden oförändrade; de tre primära byts till de prefixade OpenRouter-slugarna. (`gh variable set MODEL_EXTRACT --body 'deepseek/deepseek-v4-pro'` osv.) Verifiera slugarna live på openrouter.ai/models — de bekräftades 2026-06-24 men Kimi/GLM-versioner rör sig.
2. **Säkerställ OpenRouter-kredit** (annars 402 på primär → faller ändå till Go).
3. **Öppna PR enligt §7** (stash → ny gren → commit utan backticks → `gh pr create && gh pr merge`). Ändrade filer: `pipeline/src/llm.ts`, `pipeline/src/cli-run.ts`, `pipeline/tests/llm.test.ts`, `pipeline/tests/cli-run.test.ts`, `DECISION_LOG.md`, `ops/HANDOFF.md`.
4. **Kör om pipeline** → trafiken går nu via OpenRouter; Go är äkta reserv.

Arkitekturnot: §20 (oberoende verify, annan familj) hålls av valda modeller (deepseek vs moonshot); `cli-run` kräver i kod bara `extract ≠ verify` som sträng. Om primär `MODEL_COPY` skulle sättas lika med `MODEL_EXTRACT` kolliderar map-nyckeln (copy-fallback skrivs över) — undvik genom att hålla copy som egen modell (glm).

## 10. Review-kön wipades varje körning — FIXAT 2026-06-25 (i arbetsträdet, väntar PR)
**Detta var den verkliga orsaken till "grön körning, 0 review".** `publish()` skrev `needs_review.json` enbart från aktuell körnings poster (replace). Nästa körning med 0 nya artiklar (allt sett) skrev `[]` och raderade väntande granskningsposter. Git-historiken visar mönstret: 16→0→4→9→0→3→**22→0**. Den lyckade körningen (run `28131406485`, commit `5a03184`) hade 22 poster; nästa schemalagda körning (`5130d36`) wipade dem.

**Fix:** `publish.ts` slår nu ihop nya review-poster med befintlig kö (dedup på `articleUrl::title`) i stället för att skriva över. Kön töms ENBART av review-CLI:t. `pipeline/tests/publish.test.ts` (ny). /tmp-klon: typecheck rent, **119 tester gröna**.

**Ändrade filer (denna PR):** `pipeline/src/publish.ts`, `pipeline/tests/publish.test.ts`, `DECISION_LOG.md`, `ops/HANDOFF.md`. Öppna PR enligt §7.

### Ren omläsning ("rensa allt läst, läs in på nytt") — REKOMMENDERAD ordning EFTER att fixen mergats
Syfte: börja om från en stabil, tom kö och re-extrahera allt feedsen serverar just nu. Gör i denna ordning:
1. **Merge §10-fixen först** — annars wipas den nya kön igen vid nästa tomma körning.
2. `data/promises.json` → `[]` — rensar EXEMPELDATA (28 st) + släcker EXEMPELDATA-bannern och undviker att dubblettkollen jämför mot påhittade löften.
3. `data/needs_review.json` → `[]` — börja kön rent (de gamla posterna återskapas av omläsningen).
4. `data/seen.json` → `{}` — gör att ALLA feed-artiklar räknas som nya → re-extraheras.
5. (Valfritt) höj tillfälligt `max_articles_per_run` i `data/sources.yaml` så backloggen dräneras på färre körningar; annars tar 3×/dygn-schemat ett par dygn.
6. Kör pipeline manuellt; granska med `pnpm review list`.

**Förbehåll:** (a) Feeds serverar bara SENASTE posterna (RSS ~10–50, riksdagen paginerat) → "allt" = det som finns i feed-fönstret nu, inte all historik. (b) Re-extraktion = nya LLM-anrop för varje artikel → verklig OpenRouter-kostnad (måttlig). (c) Gör detta som ett medvetet "skarp lansering"-steg.

Färdigt kommandoblock (kör EFTER att §10-fixen mergats; main är PR-skyddad så reset går via egen PR):
```
cd ~/Dev/projects/val
git checkout main && git pull
git checkout -b chore-clean-reread
printf '[]\n'  > data/promises.json
printf '[]\n'  > data/needs_review.json
printf '{}\n'  > data/seen.json
git add data/promises.json data/needs_review.json data/seen.json
git commit -m "chore(data): ren omlasning - toma promises/needs_review/seen for full re-extraktion"
git push -u origin chore-clean-reread
gh pr create --base main --head chore-clean-reread --fill && gh pr merge chore-clean-reread --merge --delete-branch
git checkout main && git pull
gh workflow run pipeline.yml   # trigga; granska sedan med: cd pipeline && pnpm review list
```
Vill man behålla de 22 verbatim i stället för att återskapa dem: `git show 5a03184:data/needs_review.json > data/needs_review.json` (övriga två töms som ovan).

## 11. Seed-import från vallen-2026 — BYGGD & KÖRD LOKALT 2026-06-29 (väntar PR + vault-commit)

**Vad:** Hela databasen seedades från det privata granskningsarkivet `github.com/bambapappa/vallen-2026` via en ny importer som kör vallen-posterna genom valflasks grindkedja (ej direktskrivning). Se DECISION_LOG 2026-06-29 för besluten. Resultat i arbetsträdet: **promises.json = 312 löften** (S59 M80 SD37 C45 V32 KD22 L20 MP17 — alla 8 partier), needs_review +75, Fläsket ≈ 13 059 mdkr (80 %-band 10 748–15 371, ρ=0,3).

**Tre metodändringar (i drift framåt):**
1. LLM/parti-estimat **auto-publiceras med intervall** [low,base,high]; ingen review-spärr på `confidence`. Totalen = `aggregates.totalFlasketInterval` (triangelvarians + ρ=0,3), inte naiv summa.
2. **transkript-källtyp**: youtube-källor verifieras med uppmjukad (skiftläges-okänslig) verbatim mot sparat transkript i `vallen-2026/transcripts/`. Webbkällor = strikt G3 som förut.
3. Bevisvalvsuppdelning: full HTML/transkript bara i privata vallen-2026; valflask får bara citat+metadata.

**Köra om importen** (från `pipeline/`, med en checkout av vallen-2026):
```
pnpm import:vallen <sökväg-till-vallen-2026> --dry-run   # statistik + totalband, skriver inget
pnpm import:vallen <sökväg-till-vallen-2026>             # skarpt: skriver data/promises.json + needs_review + changelog
```
Importen är idempotent-vänlig: kör mot redan publicerade → `findPossibleDuplicate` skickar troliga dubletter till review i stället för att dubblera. Stabila `p-2026-NNNN` bevaras.

**Kvar (ägarsteg, EJ gjort — push hålls):**
1. **Commit av 9 transkript** (`vallen-2026/transcripts/*.txt` + `MANIFEST.json`) till det PRIVATA vallen-2026-repot (bevisvalv). Hämtade med `yt-dlp --write-auto-subs --sub-langs sv`.
2. **PR med kod + data** till valflask enligt §7 (ändrade filer listade i DECISION_LOG 2026-06-29).
3. De 16 gamla RSS-review-posterna ligger kvar i kön (merge, ej raderade) — granska/avvisa vid behov med `pnpm review`.
4. /metod-text om totalformeln (ρ-band) + transkript-uppmjukningen innan drygast.nu pekas live.
5. Justera ρ om bandet ska vara bredare/smalare (`totalFlasketInterval(promises, rho)`).

## 12. Driftläge (deploy, HTTPS, headers) — AKTUELLT per 2026-07-01

**drygast.nu är LIVE och härdad.** Arkitekturen bytte från Cloudflare Pages till **GitHub Pages bakom Cloudflare-proxy** efter att CF Pages eget bygge visade sig ohjälpligt (se nedan).

**Så ser kedjan ut nu:**
- **Origin/primär: GitHub Pages.** `build.yml`-jobbet `deploy-pages` bygger `site/dist` och deployar vid varje push till main. GitHub Pages custom domain = `drygast.nu` (satt via `gh api PUT repos/bambapappa/valflask/pages cname=drygast.nu`).
- **DNS (Cloudflare):** apex `drygast.nu` → fyra A-poster `185.199.108–111.153`; `www` → CNAME `bambapappa.github.io`. **Proxyade (orange moln)**, SSL/TLS-läge = **Full**. Cloudflare-edge → GitHub Pages-origin.
- **HTTPS:** GitHub Pages-cert utfärdat (state `approved`, giltigt t.o.m. 2026-09-28, täcker apex+www); Cloudflare Universal SSL vid edge; `https_enforced=true`; http→https 301.
- **Säkerhetsheaders:** GitHub Pages struntar i `_headers`, så de sätts via en **Cloudflare Transform Rule** ("Säkerhetsheaders", Modify Response Header, All incoming requests): CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy, Access-Control-Allow-Origin `*`. Värden speglar `site/public/_headers`. Verifierat att alla sex slår igenom.
- **⚠️ Rocket Loader måste vara AV** (Cloudflare Speed) — den injicerar JS som strikt CSP (`script-src 'self'`) blockerar → skulle bryta sökrutan.
- **Verifiera drift:** `curl -sI https://drygast.nu/` (→ `HTTP/2 200`, `server: cloudflare`, `via: varnish`, headersen); `curl -s https://drygast.nu/api/v1/summary.json` (aktuell `data_hash`).

**HSTS — MEDVETET UPPSKJUTEN (ej glömd).** Enda §14/T2-punkten som saknas. Motiv: publik statisk läs-sajt utan cookies/inloggning/känslig data → låg nytta; deployen har varit skör → undvik HTTPS-utelåsning. Slå på senare när HTTPS rullat stabilt: SSL/TLS → Edge Certificates → HSTS, börja **6 mån + includeSubDomains, ingen preload**; höj sedan till 2 år + preload (som `_headers` siktar på).

**Övergivet/icke-blockerande:**
- **Cloudflare Pages** (ursprunglig primär): skrotad — dess git-bygge failar (`No preset version installed for command pnpm`; saknar även Python-`fonttools` för OG). wrangler-Direct-Upload-steget finns kvar i `build.yml` men dess token saknar Pages-scope; steget är `continue-on-error` (varnar bara). Kan tas bort.
- **Netlify-spegel:** token ger 403 (ogiltig/utgången). `mirror.yml`-steget gjort icke-blockerande (varnar, fäller ej). **Rekommendation (option B):** släpp Netlify — redundansen ligger nu i Cloudflare-proxyns cache framför GitHub Pages (+ git = klon, DNS ompekbar på minuter). Återställ annars genom att förnya `NETLIFY_AUTH_TOKEN` + verifiera `NETLIFY_SITE_ID`.

**Konto:** drygast.nu ligger på Martin.kronvall@outlook.com's Cloudflare-konto. Presskontakt `hej@drygast.nu`.

## 13. Månadsdrill (§16/T10) — FIXAD & GRÖN 2026-07-01

Drillen hade aldrig gått grön (tre latenta buggar sedan M6): (1) fel klon-URL `bambapappa/val` → `valflask`; (2) `drill.yml` satte inte upp node/pnpm → `pnpm install` exit 127; (3) `drill.sh` jämförde `sha256sum` av råa promises.json mot den KANONISKA `data_hash` — matchar aldrig; jämför nu byggd `integrity.json` mot changeloggens sista `data_hash`. Manuell körning nu **grön på 23s** (< 15-minutersgränsen). PR #39/#41/#43.




