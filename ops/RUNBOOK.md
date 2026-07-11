# RUNBOOK — drygast.nu

**Mål:** Åter i drift < 15 minuter för S1–S3.
**Senast övad:** 2026-06-12 (drill M6)

---

## Förebyggande & återkommande rutiner

### Nyckelrotation (kvartalsvis)
- [ ] Rotera GitHub Actions-secrets (OPENROUTER_API_KEY, LLM_FALLBACK_API_KEY, NETLIFY_AUTH_TOKEN)
- [ ] Rotera Cloudflare API-nyckel (om används)
- [ ] Kontrollera LLM-leverantörs kreditgräns
- [ ] Kontrollera Netlify-site-ID och token giltighet
- [ ] Uppdatera registrar-lösenord (om policy kräver)
- [ ] Säkerhetskopiera GPG-nyckel till offline-medium (YubiKey/HSM)
- [ ] Dokumentera rotationsdatum nedan

**Nästa rotation: 2026-09-01**

### Veckovis release-taggning (automatiskt, måndagar)
Workflow `.github/workflows/release.yml` skapar tagg `release/vYYYY-MM-DD` + GitHub Release.

**Ägarsteg:** GPG-signering av taggar — kräver att ägaren:
1. Genererar GPG-nyckel (`gpg --full-generate-key`)
2. Lägger till i GitHub-kontot (Settings → SSH and GPG keys)
3. Sätter `GPG_PRIVATE_KEY` och `GPG_PASSPHRASE` som GitHub Secrets
4. Uppdaterar workflow till `git tag -s` (signerad)

Tills dess: osignerade taggar, loggat i DECISION_LOG.

### Repo-spegling (ägarsteg)
Automatisk spegling till sekundär git-host (t.ex. GitLab) dokumenteras här.
**Ägarsteg:**
1. Skapa repo på sekundär host
2. Lägg till remote: `git remote add secondary git@gitlab.com:<user>/drygast.git`
3. Workflow `release.yml` pushar automatiskt till `secondary` efter taggning

### Lokal `git bundle`-rutin
```bash
# Kör manuellt efter varje månadsdrill
BUNDLE_NAME="drygast-backup-$(date +%Y-%m-%d).bundle"
git bundle create "$BUNDLE_NAME" --all
# Flytta till säker offline-lagring (ej i repo)
```

### Beroende- och kodändringar i live-fasen

Ju närmare mjukstart och valdag (2026-09-13), desto högre tröskel för allt som
inte är säkerhet eller en trasig sida. Prioordning: **uppe · korrekt · neutral · källspårad**.

**Riskklasser — vad tas, vad skjuts upp**

| Klass | Exempel | I live-fasen |
|---|---|---|
| Ta direkt | Säkerhetsfix (Dependabot security / `npm audit`), trasig sida, datafel | Fixa nu, full verifiering |
| Ta med verifiering | Patch/minor utan säkerhetsskäl | Batchas veckovis av Dependabot (en grupp-PR per ekosystem), kör verifieringstrappan |
| Skjut upp | Major-bump (ramverk, build-actions), refaktor, "nice-to-have" | Vänta till lugnt fönster. **Undantag:** en major som *är* säkerhetsfixen (Astro 6 var det) tas, men med full trappa |
| Frys | Allt icke-kritiskt under frysfönster | Se nedan |

Dependabot är konfigurerad (`.github/dependabot.yml`) att hålla tillbaka
semver-major på alla ekosystem och gruppera minor/patch — säkerhetsuppdateringar
släpps ändå alltid igenom.

**Frysfönster:** ±48 h runt mjukstart till journalister, samt sista ~5 dygnen före
valdagen + valdagen. Endast säkerhet och trasig-sida-hotfix. Inga major-bumpar, inga
refaktorer.

**Verifieringstrappa (måste passera före merge till `main`):**
1. Alltid: PR-CI grön — pipeline-tester (175) + typecheck + sajtbygge + T1 + T3.
2. Rör bygge/rendering/deploy: hela lokala sviten (T1/T3/T9/T3-stale/interval/drylinje)
   + generera OG + titta på `dist` via Cloudflare branch-preview (`*.pages.dev` per PR).
3. Ramverks-/build-action-major: bygg i isolerad `git worktree`, byte-diffa ett urval
   renderade sidor (start/parti/löfte/sitemap/api) gammalt-vs-nytt, och bekräfta att
   `deploy-pages`-jobbet lyckas på `main` (deploy-jobb går inte att testa i PR).
4. Neutralitetsgrind: `test-drylinje` + aggregat-dedup gröna → ingen partisk skillnad.

**Rollback av kod (skild från datarollback):** snabbast först.
1. Cloudflare Pages → Rollback (1 klick, se S1) — sub-minut.
2. `git revert <sha>` på `main` → push → CI bygger om känt-gott träd (~5 min). Ren,
   spårbar väg. **Rita aldrig om publicerad historik** (force-push bryter revisionsspåret).
3. Beroendebump: reverta merge-commiten, pinna gamla versionen, låt Dependabot försöka igen.
4. Data: separat spår — `ops/rollback-data.sh <datum>` + rättelselogg (se S2). Blanda aldrig ihop.

Grundtrygghet: en misslyckad deploy = **ingen uppdatering, inte nedtid** — både Pages
och GitHub Pages behåller förra bygget. Stale-bannern varnar om datan fryser.

**Gör inte:** ingen major/refaktor i frysfönster (utom säkerhet) · ingen force-push på
publicerade commits · handredigera aldrig lockfilen blint (regenerera + testa) · merga
inget som inte kan verifieras lokalt utan färdig watch-&-rollback-plan · låt inte en
beroendebump röra neutralitetslogik utan att neutralitetstesterna passerar.

---

## S1 — Trasig deploy / visuellt fel

```
# Cloudflare Pages → Rollback (1 klick i dashboard), ELLER:
git revert HEAD && git push
```
**Stoppur:** senast övad: 2026-06-12, tid: 1 min (rollback via revert)

---

## S2 — Datafel eller poisoning

```bash
bash ops/rollback-data.sh <datum>   # t.ex. 2026-06-10
git push
# Skriv rättelsekommit:
git commit --allow-empty -m "correction: [beskriv felet och åtgärden]"
git push
```
**Stoppur:** senast övad: 2026-06-12, tid: 0 min (dry-run testad)

---

## Drill (T10)

```bash
bash ops/drill.sh
```
**Stoppur:** senast övad: 2026-06-12, tid: 36 sekunder
**Mål:** < 15 min — UPPFYLLT

---

## S3 — Cloudflare Pages nere

I Cloudflare DNS: peka `www`/apex-CNAME mot Netlify-spegeln.
TTL: 300 → propagering på minuter.
**Stoppur:** senast övad: 2026-06-12, tid: — (ägarsteg — kräver Cloudflare-konto)

---

## S4 — Hela Cloudflare nere (DNS inkl.)

Hos registrarn: byt NS till reserv-DNS, ladda `ops/dns-zone-backup.txt`.
Propagering: timmar (accepterad risk, loggas i DECISION_LOG).
**Stoppur:** senast övad: 2026-06-12, tid: — (ägarsteg — kräver registrar-konto + reserv-DNS)

---

## S5 — GitHub nere

Publik sajt opåverkad (statisk). Pipeline pausar. Ingen åtgärd < 24h.
**Stoppur:** senast övad: 2026-06-12, tid: — (ingen åtgärd krävs)

---

## S6 — Nyckelläcka

1. Rotera/revokera hos LLM-leverantör, Netlify, Cloudflare
2. `git log --all -- data/ | head -20` — granska mot data_hash-kedja i changelog.json

**Stoppur:** senast övad: 2026-06-12, tid: — (ägarsteg — kräver kontoinloggning)

---

## S7 — Repo-kompromiss

1. Återställ från senaste signerad release-tagg till nytt repo
2. Koppla om Pages/speglar
3. Rotera allt enligt S6

**Stoppur:** senast övad: 2026-06-12, tid: — (ägarsteg — kräver GPG-nyckel + nya konton)

---

## Ägarsteg — konton & hemligheter (implementeras när ägaren tillhandahåller)

| Tjänst | Vad behövs | Var sätter det |
|--------|-----------|---------------|
| Cloudflare Pages | Konto + GitHub-integrering | Cloudflare dashboard |
| Cloudflare DNS | Konto + zon för drygast.nu | Cloudflare dashboard |
| Netlify | Site-ID + Auth Token | GitHub Secrets (NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN) |
| UptimeRobot | Konto + monitor på / och /api/v1/summary.json med keyword `generated_at` | UptimeRobot dashboard |
| Registrar | Konto + 2FA + reserv-DNS NS | Offline-dokumentation |
| GPG | Nyckel för signerade taggar | GitHub GPG keys + Secrets |
| Sekundär git-host | Konto + SSH-nyckel | GitHub Secrets |

---

*UptimeRobot-konfigurering (ägarsteg):*
- Monitor 1: URL `https://drygast.nu/`, keyword `DRYGAST`
- Monitor 2: URL `https://drygast.nu/api/v1/summary.json`, keyword `generated_at`
- Intervall: 5 min
- Alert-kanaler: e-post + valfritt ntfy.sh

*2FA-krav:*
- GitHub: hårdvarunyckel (YubiKey/Passkey)
- Cloudflare: hårdvarunyckel
- Registrar: hårdvarunyckel
- Alla TOTP-backuper offline, aldrig i repo

*Reserv-DNS:*
- Förberedd NS-uppsättning (t.ex. Hurricane Electric/NS1) i `ops/dns-zone-backup.txt`
- Registrar-inloggning dokumenterad offline (fysisk plats: ägarsteg)

---

*RUNBOOK v1.0 — 2026-06-12*
