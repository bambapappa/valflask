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
