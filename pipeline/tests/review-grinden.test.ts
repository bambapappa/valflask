/**
 * Ett kommando till review-kön får aldrig avvisas tyst.
 *
 * `review.yml` exekverar bara ägarens kommandon. Fram till 2026-09-01 var
 * den grinden ensam, och när den fällde något hände ingenting alls: ingen
 * körning, ingen kommentar, inget spår. Kommentaren låg kvar på issuet och
 * såg besvarad ut.
 *
 * Det mättes den dagen. Fyrtio `/avvisa` postades av `claude[bot]`, som har
 * `author_association: NONE` och alltså inte är ägaren. Alla fyrtio
 * hoppades över, kön var oförändrad, och det upptäcktes bara för att någon
 * läste körningarnas slutstatus i efterhand. Hade ingen gjort det vore
 * fyrtio beslut rapporterade som fattade utan att ett enda var det —
 * fyrtio löften kvar i kön under tron att de var avgjorda.
 *
 * Rättelsen är jobbet `ej_behorig`, som svarar när `handle` inte gör det.
 * Skyddet håller bara så länge de två villkoren är varandras spegelbild:
 * samma krav på etikett och inledande snedstreck, motsatt jämförelse på
 * behörighet. Ändrar någon det ena utan det andra öppnar hålet igen — och
 * ett hål som inget mäter är precis det som kostade oss fyrtio beslut.
 *
 * FÄLLS AV: att ta bort jobbet `ej_behorig`, att byta ut `!=` mot `==` i
 * dess villkor, eller att lägga till ett krav i det ena jobbet men inte i
 * det andra.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const WORKFLOW = join(import.meta.dirname, "..", "..", ".github", "workflows", "review.yml");

interface Jobb {
  if?: string;
  permissions?: Record<string, string>;
  steps?: Array<{ run?: string }>;
}

function jobben(): Record<string, Jobb> {
  return (parse(readFileSync(WORKFLOW, "utf8")) as { jobs: Record<string, Jobb> }).jobs;
}

/** Villkoret som en mängd normaliserade led — radbrytningar i YAML ska inte räknas som skillnad. */
function led(villkor: string): string[] {
  return villkor
    .split("&&")
    .map((d) => d.replace(/\s+/gu, " ").trim())
    .filter((d) => d !== "");
}

describe("review-grinden avvisar aldrig ett kommando tyst", () => {
  it("båda jobben finns", () => {
    const j = jobben();
    assert.ok(j["handle"], "jobbet som exekverar beslutet");
    assert.ok(j["ej_behorig"], "jobbet som svarar när beslutet INTE exekveras");
  });

  it("villkoren är varandras spegelbild — bara behörighetsledet skiljer", () => {
    const j = jobben();
    const a = led(j["handle"]!.if!);
    const b = led(j["ej_behorig"]!.if!);
    assert.equal(a.length, b.length, "lika många led — annars kan ett kommando falla mellan jobben");

    const behorighet = (l: string[]) => l.filter((d) => d.includes("author_association"));
    const ovrigt = (l: string[]) => l.filter((d) => !d.includes("author_association")).sort();

    assert.deepEqual(
      ovrigt(a),
      ovrigt(b),
      "alla led utom behörigheten måste vara identiska, annars finns ett hål",
    );
    assert.deepEqual(behorighet(a), ["github.event.comment.author_association == 'OWNER'"]);
    assert.deepEqual(behorighet(b), ["github.event.comment.author_association != 'OWNER'"]);
  });

  it("svarsjobbet kan bara skriva en kommentar, aldrig röra data", () => {
    const j = jobben()["ej_behorig"]!;
    assert.deepEqual(
      j.permissions,
      { issues: "write" },
      "ingen `contents: write` — jobbet ska inte kunna committa något",
    );
    const kommandon = (j.steps ?? []).map((s) => s.run ?? "").join("\n");
    assert.match(kommandon, /gh issue comment/u, "jobbet ska faktiskt säga ifrån");
    assert.doesNotMatch(kommandon, /\bgit\s+(push|commit)\b/u, "svaret ändrar ingen data");
  });

  it("svarssteget körs även när beslutet föll — annars blir issuet tyst", () => {
    // Den andra vägen in i samma tystnad. `handle` svarar med grön körning och
    // förklarande kommentar när kommandot är fel skrivet, men kvalitetsfiltret
    // inne i `approve()` avslutar processen med kod 1. Utan `if: always()`
    // hoppas svarssteget då över: rött jobb, tyst issue, kommando som ser
    // besvarat ut. Fyra godkännanden gick den vägen 2026-09-01.
    //
    // FÄLLS AV: att ta bort `if: always()` från svarssteget, eller att ta bort
    // grenen som svarar när `result` är tom.
    const steg = (jobben()["handle"]!.steps ?? []) as Array<{ name?: string; if?: string; run?: string }>;
    const svar = steg.find((s) => /gh issue comment/u.test(s.run ?? ""));
    assert.ok(svar, "hittade inget steg som svarar på issuet");
    assert.equal(svar!.if, "always()", "svaret måste köras även när beslutssteget föll");
    assert.match(
      svar!.run ?? "",
      /^\s*""\)/mu,
      "det ska finnas en gren för tomt resultat — då bröt körningen och issuet ska få veta det",
    );
  });

  it("svaret kan inte utlösa sig självt", () => {
    const j = jobben()["ej_behorig"]!;
    const kropp = (j.steps ?? []).map((s) => s.run ?? "").join("\n");
    const body = kropp.match(/--body\s*\\?\s*\n?\s*"([\s\S]*?)"\s*$/mu)?.[1] ?? "";
    assert.notEqual(body, "", "hittade ingen svarstext att pröva");
    assert.equal(
      body.trimStart().startsWith("/"),
      false,
      "svaret får inte börja med snedstreck — då skulle det utlösa sig självt i en loop",
    );
  });
});
