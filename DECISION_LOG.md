# DECISION LOG — drygast.nu

Format: `## ÅÅÅÅ-MM-DD — [Beslut]`
Varje rad: **Beslut**, **Motiv**, **Förkastade alternativ**.

---

## 2026-06-11 — Repo initierat

**Beslut:** Repo initierat i befintlig katalog (val/) utan att byta namn på rotmappen.
**Motiv:** Katalogen tillhandahållen av ägaren; ingen namnändring krävdes.
**Förkastade alternativ:** Skapa ny katalog `drygast/` — onödig omstrukturering.

## 2026-06-11 — Designriktning: beslut delegerat till M1 (Fable)

**Beslut:** Valet av designriktning (A/B/C per §11) sker i M1 av Fable-instansen.
**Motiv:** Spec kräver att byggagenten beslutar och loggar designriktning; Fable hanterar M1.
**Förkastade alternativ:** Förvala riktning A i M0 — felaktigt, beslutsmandat tillhör M1-fasen.

