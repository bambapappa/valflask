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


## 9. Modell per endpoint — KOD KLAR 2026-06-24 (väntar PR + variabelbyte)
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




