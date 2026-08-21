import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { taLaset, lasinnehav, kravFrittData, LASFIL } from "../src/datalas.ts";

function kat(): string {
  return mkdtempSync(join(tmpdir(), "datalas-"));
}

describe("datalås — sviten och ett skrivande verktyg får inte köra samtidigt", () => {
  it("ett taget lås syns, och släpps när innehavaren är klar", () => {
    const dir = kat();
    try {
      assert.equal(lasinnehav(dir), null, "fritt från början");
      const slapp = taLaset(dir, "sviten i site/");
      const innehav = lasinnehav(dir);
      assert.equal(innehav?.hallare, "sviten i site/");
      assert.equal(innehav?.pid, process.pid);
      assert.ok(existsSync(join(dir, LASFIL)));
      slapp();
      assert.equal(lasinnehav(dir), null, "släppt");
      assert.equal(existsSync(join(dir, LASFIL)), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("den andre får inte låset, och beskedet säger vem som håller det", () => {
    const dir = kat();
    try {
      const slapp = taLaset(dir, "sviten i site/");
      assert.throws(
        () => taLaset(dir, "lofte-dra-in"),
        (e: Error) => e.message.includes("sviten i site/") && e.message.includes("data/ är låst"),
        "ett taget lås måste kasta med ett läsbart skäl",
      );
      slapp();
      // Och när det släppts går det att ta.
      const slapp2 = taLaset(dir, "lofte-dra-in");
      assert.equal(lasinnehav(dir)?.hallare, "lofte-dra-in");
      slapp2();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Ett lås som ingen håller får inte blockera.
   *
   * En avbruten körning som lämnar låsfilen kvar skulle annars låsa katalogen
   * tills någon rensade för hand — och den som rensar för hand slutar snart
   * läsa vad låset säger. pid 2^22 + 1 ligger över Linux default-taket för
   * pid_max och kan inte tillhöra en levande process.
   */
  it("ett lås vars innehavare är död räknas som släppt och städas undan", () => {
    const dir = kat();
    try {
      const dod = 4_194_305;
      writeFileSync(
        join(dir, LASFIL),
        JSON.stringify({ hallare: "en körning som dog", pid: dod, sedan: "2026-08-21T00:00:00Z" }),
      );
      assert.equal(lasinnehav(dir), null, "död innehavare håller ingenting");
      assert.equal(existsSync(join(dir, LASFIL)), false, "spöket städas undan");
      const slapp = taLaset(dir, "lofte-dra-in");
      slapp();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("en oläslig låsfil är inte ett lås", () => {
    const dir = kat();
    try {
      writeFileSync(join(dir, LASFIL), "{trasig");
      assert.equal(lasinnehav(dir), null);
      assert.equal(existsSync(join(dir, LASFIL)), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("kravFrittData avslutar med ett skäl i stället för ett stacktrace", () => {
    const dir = kat();
    try {
      writeFileSync(
        join(dir, LASFIL),
        JSON.stringify({ hallare: "sviten i site/", pid: process.pid, sedan: "2026-08-21T00:00:00Z" }),
      );
      const r = spawnSync(
        process.execPath,
        ["--import", "tsx/esm", "-e",
         `import {kravFrittData} from ${JSON.stringify(join(import.meta.dirname, "../src/datalas.ts"))};` +
         `kravFrittData(${JSON.stringify(dir)});console.log("SKREV");`],
        { encoding: "utf8" },
      );
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /data\/ är låst av sviten i site\//u);
      assert.doesNotMatch(r.stdout, /SKREV/u, "ingenting fick köras vidare");
      assert.doesNotMatch(r.stderr, /at .*datalas\.ts/u, "inget stacktrace");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Kapplöpningen som faktiskt inträffade, i miniatyr.
   *
   * `p-2026-2115` drogs in medan sviten låg i bakgrunden. Sviten muterar
   * `promises.json`, lägger tillbaka den ur en kopia, och tar därmed bort allt
   * som skrivits emellan. Rättelsen skrevs efter återställningen och blev kvar —
   * en publicerad rättelse om en indragning som inte fanns.
   *
   * Provet spelar upp exakt den ordningen och visar att låset bryter den.
   */
  it("skrivningen kommer inte förbi medan sviten håller filerna", () => {
    const dir = kat();
    try {
      const fil = join(dir, "promises.json");
      writeFileSync(fil, JSON.stringify([{ id: "p-2026-2115", status: "aktiv" }]));
      const kopia = readFileSync(fil, "utf8");

      // Sviten tar låset och muterar.
      const slappSviten = taLaset(dir, "sviten i site/ (test-t3-stale)");
      writeFileSync(fil, JSON.stringify([{ id: "p-2026-2115", status: "åldrat testdata" }]));

      // Indragningen försöker skriva mitt i. Utan lås hade den lyckats — och
      // förlorat allt i återställningen.
      assert.throws(() => taLaset(dir, "lofte-dra-in"));

      // Sviten lägger tillbaka originalet och släpper.
      writeFileSync(fil, kopia);
      slappSviten();

      // Nu, och först nu, går skrivningen igenom — och den överlever.
      const slappDra = taLaset(dir, "lofte-dra-in");
      writeFileSync(fil, JSON.stringify([{ id: "p-2026-2115", status: "tillbakadragen" }]));
      slappDra();

      const slut = JSON.parse(readFileSync(fil, "utf8")) as Array<{ status: string }>;
      assert.equal(slut[0]!.status, "tillbakadragen",
        "indragningen står kvar — det var den som gick förlorad 2026-08-21");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
