# ÄGARSTEG — exakt var varje steg görs

**Status 2026-06-12:** Allt agentbyggbart i M0–M7 är klart och committat. Stegen nedan kräver dina konton/uppgifter. Ordningen är vald så att varje steg låser upp nästa. Beslut (§21) är redan fattade och loggade i `DECISION_LOG.md` — det här är bara handgrepp.

---

## 1. GitHub — repo, skydd, hemligheter (låser upp CI + första skarpa körningen)

| Vad | Var exakt |
|---|---|
| Skapa publikt repo | github.com → New repository (publikt per SPEC §2.1; namn t.ex. `drygast`) |
| Pusha koden | Terminal i `/Users/bambapappa/Dev/projects/val`: `git remote add origin git@github.com:<konto>/<repo>.git && git push -u origin main` |
| Branch protection | Repo → Settings → Branches → Add rule för `main`: blockera force-push, kräv PR för människor (boten committar direkt) — SPEC §14 |
| 2FA med hårdvarunyckel | github.com → Settings → Password and authentication — SPEC §14 |
| **Secrets** | Repo → Settings → Secrets and variables → Actions → **Secrets**: `OPENROUTER_API_KEY` (skapas på openrouter.ai → Keys; sätt hård kreditgräns ~15 USD/mån där, SPEC §15). Valfritt: `LLM_FALLBACK_BASE_URL` + `LLM_FALLBACK_API_KEY` (t.ex. z.ai). Senare (steg 3): `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` |
| **Variables** | Samma sida → **Variables**: `PIPELINE_MODE` = `review` (växlas till `auto` efter första veckan, beslutat §21) · `ALERT_EMAIL` = din larmadress · `MODEL_EXTRACT`/`MODEL_VERIFY`/`MODEL_COPY` = lämna tomma tills vidare — jag föreslår aktuella modeller vid första skarpa körningen och loggar valet i `DECISION_LOG.md` (krav: VERIFY annan modellfamilj än EXTRACT, §20) |
| GitHub Pages-spegeln | Repo → Settings → Pages → Source: **GitHub Actions** (`.github/workflows/build.yml` deployar redan) |

Workflowsen som konsumerar detta: `.github/workflows/pipeline.yml` (rad 42–49) och `mirror.yml` (rad 29–37, hoppar snällt över Netlify tills secrets finns).

**Verifiering:** Actions-fliken → `build` körs grönt på push; `test-pipeline`-jobbet visar 71 tester + typecheck.

## 2. Cloudflare — domän, DNS, Pages (primärhosting)

| Vad | Var exakt |
|---|---|
| Konto + 2FA hårdvarunyckel | dash.cloudflare.com |
| Domänen drygast.nu | Registrera hos valfri .nu-registrar och peka NS mot Cloudflare, eller direkt via Cloudflare Registrar om .nu stöds. Spara registrar-inloggning **offline** (RUNBOOK kräver fysisk plats, S4) |
| Pages-projekt | Dash → Workers & Pages → Create → Pages → Connect to Git → välj repot. Bygginställningar: **Root directory** `site` · **Build command** `pnpm build` · **Output** `dist` · Environment: `NODE_VERSION=22` |
| Custom domain | Pages-projektet → Custom domains → `drygast.nu` + `www` |
| Zonfilsbackup | Efter DNS-uppsättning: Dash → DNS → Records → Export → klistra in i `ops/dns-zone-backup.txt` (mallen ligger där), committa |

**Verifiering:** `https://drygast.nu` svarar; `curl -sI https://drygast.nu` visar CSP/HSTS-headers ur `site/public/_headers` (T2).

## 3. Netlify — varm spegel

| Vad | Var exakt |
|---|---|
| Konto + tom site | app.netlify.com → Add new site → Deploy manually (tom — deployen sker från CI) |
| Token | User settings → Applications → Personal access tokens → New → in som GitHub-secret `NETLIFY_AUTH_TOKEN` |
| Site ID | Site → Site configuration → General → Site details → **Site ID** → in som GitHub-secret `NETLIFY_SITE_ID` |

**Verifiering:** nästa push → Actions → `mirror` deployar (i stället för "SKIP"-loggen).

## 4. UptimeRobot — övervakning

uptimerobot.com → två monitorer enligt `ops/RUNBOOK.md` (sektionen "UptimeRobot-konfigurering", rad ~138): `https://drygast.nu/` samt `https://drygast.nu/api/v1/summary.json` med **keyword-match på `generated_at`**; larm till samma adress som `ALERT_EMAIL`.

## 5. Kvarvarande konstanter — `data/constants.json`

8 poster står ärligt kvar som `"VERIFIERA"` (agentförsök loggade i fältet `source_url` + `DECISION_LOG.md`). Fyll i `value` (**rätt enhet per `unit`-fältet**), `source_url` (exakt sida), `source_date` och `fetched_date`. Schemat kräver källfälten så fort `value` är ett tal — T3 vägrar bygga annars (medvetet).

| id | Enhet | Var du hittar värdet |
|---|---|---|
| `ssk_arskostnad` | kr | SCB lönestrukturstatistik (AM0110, interaktivt uttag i Statistikdatabasen) eller SKR:s personalkostnadsstatistik — arbetskraftskostnad/år, inte månadslön |
| `larare_arskostnad` | kr | Samma som ovan, grundskollärare |
| `vardplats_ar` | kr | SKR — kostnad per vårdplats och år (ekonomirapport/nyckeltal) |
| `skolmaltid_elev_ar` | kr | Livsmedelsverket — skolmåltidskostnad per elev och år |
| `enkrona_tjocklek_m` | m | Riksbanken — myntspecifikation 1 krona (agenterna fick 404 på specsidan; ~0,00179 m väntas) |
| `avstand_mars_min_m` | m | NASA Mars facts — "closest approach" (~5,46×10¹⁰ m väntas) |
| `jas39e_styck` | kr | FMV/Försvarsmakten — styckpris JAS 39E (kan kräva försvarsbeslut/budgetunderlag) |
| `reformutrymme_msek_per_ar` | msek | Konjunkturinstitutet (Konjunkturläget) eller ESV:s prognos — **låser upp gap-mätarens fulla läge** |

**Verifiering:** `cd site && pnpm test` (T3 validerar schema; T9/T8 bekräftar att jämförelser + GapMatare renderar).

## 6. Intäkter E1 + E2

| Vad | Var exakt |
|---|---|
| E2 Swish-QR + Buy Me a Coffee | Lägg QR-bild i `site/public/` och ersätt kommer-snart-platshållaren i `site/src/pages/om.astro` (sektionen "Stöd vägningen") med bild + BMC-länk |
| E1 Affiliate | Ansök hos Adtraction eller Awin (program: Adlibris/Bokus). När godkänd: lägg länkarna i `site/src/components/LasVidare.astro` och slå på flaggan i `site/src/config.ts` → `E1_AFFILIATE: true` ("Annonslänk"-märkningen är förberedd) |
| E3 AdSense | Ingen åtgärd — AV per beslut §21, omprövas augusti 2026 |

## 7. Första skarpa körningen (efter steg 1)

1. Säg till mig — jag föreslår + sätter `MODEL_*`-variablerna (loggas i DECISION_LOG), kör pipelinen i review-läge och rapporterar.
2. Granska batchen: `cd pipeline && pnpm review list` → `pnpm review approve <id>` (eller `reject <id> <orsak>`).
3. **Töm exempeldatan i samma veva som första godkända batchen:** sätt `data/promises.json` till `[]` innan godkännandena flyttas in (EXEMPELDATA-bannern släcks automatiskt när inga `fixture-`-poster finns).
4. Efter en stabil vecka: ändra GitHub-variabeln `PIPELINE_MODE` till `auto` (beslutat §21). T7-checken körs i CI (`pipeline/scripts/check-t7.mts`).

## 8. Övrigt ur RUNBOOK (när det passar)

- **GPG-nyckel** för signerade release-taggar → `ops/RUNBOOK.md` sektionen "Veckovis release-taggning" (taggas osignerat tills dess, loggat).
- **Reserv-DNS-leverantör** förberedd för S4 + **repo-spegel** till sekundär git-host (sektionen "Repo-spegling") .
- **Kalenderpåminnelse** kvartalsvis nyckelrotation (sektionen "Nyckelrotation").
- Öva S3/S6 en gång när kontona finns — stoppursfälten i RUNBOOK väntar.
