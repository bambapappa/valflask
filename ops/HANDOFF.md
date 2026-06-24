# HANDOFF — drygast.nu ("Fläskvågen")

Status per 2026-06-24. Komplement till `DECISION_LOG.md` (beslut), `ops/AGARSTEG.md` (kontosteg) och `ops/RUNBOOK.md` (drift/katastrof).

## 1. Vad det är
Autonom pipeline som hämtar svenska partiers/mediers RSS + riksdagens öppna data, extraherar vallöften med LLM, kör säkerhetsgrindar (§7), kostnadssätter och publicerar en statisk Astro-sajt. Människa granskar gränsfall. Primär hosting Cloudflare Pages; speglar GitHub Pages + Netlify.

## 2. Status nu
- **M0–M7 byggt och grönt.** Alla bilaga-D-konstanter källsatta (inga VERIFIERA kvar).
- **Pipelinen kör skarpt** via GitHub Actions (`pipeline.yml`, 3×/dygn + manuell). Entrypoint `pipeline/src/cli-run.ts`.
- **Modeller (GitHub Variables):** `MODEL_EXTRACT=deepseek-v4-pro`, `MODEL_VERIFY=kimi-k2.7` (annan familj, §20), `MODEL_COPY=glm-5.1`. Körs via OpenCode Go (OpenAI-endpoint) som fallback (`LLM_FALLBACK_BASE_URL=https://opencode.ai/zen/go/v1`) eftersom OpenRouter saknar kredit.
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
