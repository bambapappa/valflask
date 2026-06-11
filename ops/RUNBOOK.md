# RUNBOOK — drygast.nu

**Mål:** Åter i drift < 15 minuter för S1–S3.
**Senast övad:** YYYY-MM-DD (uppdatera efter varje drill)

---

## S1 — Trasig deploy / visuellt fel

```
# Cloudflare Pages → Rollback (1 klick i dashboard), ELLER:
git revert HEAD && git push
```
**Stoppur:** _____ min

---

## S2 — Datafel eller poisoning

```bash
bash ops/rollback-data.sh <datum>   # t.ex. 2026-06-10
git push
# Skriv rättelsekommit:
git commit --allow-empty -m "correction: [beskriv felet]"
git push
```
**Stoppur:** _____ min

---

## S3 — Cloudflare Pages nere

I Cloudflare DNS: peka `www`/apex-CNAME mot Netlify-spegeln.
TTL: 300 → propagering på minuter.
**Stoppur:** _____ min

---

## S4 — Hela Cloudflare nere (DNS inkl.)

Hos registrarn: byt NS till reserv-DNS, ladda `ops/dns-zone-backup.txt`.
Propagering: timmar (accepterad risk, loggas i DECISION_LOG).

---

## S5 — GitHub nere

Publik sajt opåverkad (statisk). Pipeline pausar. Ingen åtgärd < 24h.

---

## S6 — Nyckelläcka

1. Rotera/revokera hos LLM-leverantör, Netlify, Cloudflare
2. `git log --all -- data/ | head -20` — granska mot data_hash-kedja i changelog.json

---

## S7 — Repo-kompromiss

1. Återställ från senaste signerad release-tagg till nytt repo
2. Koppla om Pages/speglar
3. Rotera allt enligt S6
