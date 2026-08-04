
---

## 2026-08-04 — `Bevis:` byter citat i ett kopplingsbeslut

**Beslut (mänskligt beslut 2026-08-04):** Kopplingskommandot får en fjärde
form. En rad som börjar `Bevis:` under `/godkänn` byter ut förslagets citat mot
ett annat ur samma dokument. Det nya citatet hämtas mot källan och prövas
**ordagrant** med samma kanon och samma golv som H2 använder när förslaget
skapas. Håller det inte sker ingen ändring alls — varken i kön eller i
kopplingarna.

**Motiv:** Genomgången 2026-08-02 lade 28 förslag i högen "citatet bär inte,
men dokumentet bär sannolikt ett bättre". Den högen var **oåtkomlig**:
kommandot kunde godkänna, sätta motionstyp och avvisa, ingenting annat. Beviset
bor i `kopplingsforslag.json`, och att ändra där för hand hade gjort issuetexten
osann — den som beslutar hade läst ett citat medan datat bar ett annat.

Kontrollen av det nya citatet ligger i handlerskriptet, inte i den rena
logiken: `granskning.ts` når aldrig nätet, och källtexten måste hämtas som
dokumentet ser ut NU. `provaNyttBevis` är därför en ren funktion som tar både
citatet och källtexten, och anroparen ansvarar för hämtningen.

**Ett nätfel är inte ett underkänt citat.** Går hämtningen inte fram svarar
körningen att källan inte kunde läsas och att inget beslut är fattat. Att svara
"citatet håller inte" när vi inte kunnat läsa källan vore att påstå något vi
inte vet.

**Förkastade alternativ:** `--bevis "…"` på kommandoraden (citat bär
skiljetecken och citattecken; en märkt rad tål allt utom radbrytning och
speglar granskningsköns `Uträkning:`); att låta vilken fritext som helst under
kommandot bli bevis (då hade en kommentar kunnat hamna i ett publicerat citat);
att ändra i `kopplingsforslag.json` för hand och synka om issuena (fler steg,
och mellanläget bär ett citat ingen läst); att lita på förslagsstegets
kontroll och hoppa över omprövningen (citatet är nytt — det har aldrig prövats).

**Påverkan:** `pipeline/src/granskning.ts` (`provaNyttBevis`, `bevis` i
kommandot och i `godkannForslag`, issuemallens beslutstabell),
`pipeline/scripts/koppling-kommentar.mts` (hämtar källtexten och prövar före
beslut). Fyra nya grindar, 154 tester gröna, typecheck rent.

**Spåret syns i datat:** ett utbytt bevis skriver in
"(beviset utbytt av granskaren mot ett annat citat ur samma dokument)" i
kopplingens motivering, och svaret i issuet återger det nya citatet i sin helhet.
