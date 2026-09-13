/**
 * Låset över `data/` — ett skrivande verktyg och sviten får inte köra samtidigt.
 *
 * `site/scripts/test-t3-stale.mts` muterar de RIKTIGA datafilerna och lägger
 * tillbaka dem från en säkerhetskopia när den är klar. Skriver något annat till
 * `data/` under tiden går den skrivningen förlorad i återställningen — utan ett
 * ord, för bägge sidor gjorde exakt vad de skulle.
 *
 * Det hände 2026-08-21: `p-2026-2115` drogs in medan sviten låg i bakgrunden.
 * Statusändringen och changelog-posten skrevs över av återställningen, men
 * rättelsen i `rattelser.json` skrevs efteråt och blev kvar. Kvar stod alltså en
 * publicerad rättelse som påstod en indragning som inte fanns. Den upptäcktes
 * bara för att statusen råkade kontrolleras efteråt. Samma kapplöpning tog
 * arkivbackfillen tidigare samma vecka.
 *
 * Låset är ömsesidigt: sviten tar det medan den muterar, och varje skrivande
 * verktyg tar det medan det skriver. Den som möter ett taget lås skriver
 * ingenting och säger varför.
 *
 * **Ett dött lås blockerar inget.** Innehavarens pid kontrolleras, och en
 * process som inte längre finns räknas som släppt — annars hade en avbruten
 * körning låst katalogen tills någon rensade för hand, och den som rensar för
 * hand slutar snart läsa vad låset säger.
 *
 * Låsbytet serialiseras av katalogen `.datalas-byte`. Ett avbrott inne i
 * låsbytet lämnar den kvar och stoppar nya skrivare. Kontrollera då att inga
 * processer använder katalogen innan spärren återställs; den tas aldrig bort
 * enbart för att tid har gått. Oläslig processidentitet kräver också kontroll.
 */
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const LASFIL = ".datalas";

export interface Lasinnehav {
  /** Vad som håller låset, i klartext: «sviten i site/», «review approve». */
  hallare: string;
  pid: number;
  /** ISO-tid när låset togs. */
  sedan: string;
}

function lasvag(dataDir: string): string {
  return join(dataDir, LASFIL);
}

/** Lever processen som tog låset? En död innehavare håller ingenting. */
function lever(pid: number): boolean {
  try {
    // Signal 0 skickar ingenting — den frågar bara om processen finns.
    process.kill(pid, 0);
    return true;
  } catch (fel) {
    // EPERM betyder att processen finns men ägs av någon annan. Den lever.
    return (fel as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Vem som håller låset just nu, eller null om det är fritt.
 *
 * Ett lås vars innehavare är död städas undan här, så att nästa läsare möter en
 * fri katalog i stället för ett spöke.
 */
function lasinnehavLast(dataDir: string): Lasinnehav | null {
  const vag = lasvag(dataDir);
  if (!existsSync(vag)) return null;
  let innehav: Lasinnehav;
  try {
    innehav = JSON.parse(readFileSync(vag, "utf8")) as Lasinnehav;
  } catch {
    throw new Error("data/ har en oläslig låsfil; kontrollera innehavaren innan låset återställs");
  }
  if (!Number.isInteger(innehav.pid) || innehav.pid <= 0) {
    throw new Error("data/ har en låsfil utan giltig processidentitet");
  }
  if (!lever(innehav.pid)) {
    rmSync(vag, { force: true });
    return null;
  }
  return innehav;
}

/** Serialiserar läsning, städning av döda lås och ny låstagning. */
function medLasbyte<T>(dataDir: string, arbete: () => T): T {
  const vakt = join(dataDir, ".datalas-byte");
  try { mkdirSync(vakt); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("data/ har ett pågående eller avbrutet låsbyte; försök igen och kontrollera processerna om spärren kvarstår");
    }
    throw error;
  }
  try { return arbete(); }
  finally { rmSync(vakt, { recursive: true }); }
}

export function lasinnehav(dataDir: string): Lasinnehav | null {
  return medLasbyte(dataDir, () => lasinnehavLast(dataDir));
}

/** Låset i klartext, för ett felmeddelande någon ska kunna handla på. */
export function lastext(innehav: Lasinnehav): string {
  return (
    `data/ är låst av ${innehav.hallare} (pid ${innehav.pid}, sedan ${innehav.sedan}).\n` +
    "Den körningen skriver eller återställer filerna, och en skrivning nu skulle\n" +
    "gå förlorad utan ett ord. Vänta tills den är klar och kör om.\n\n" +
    `Är körningen död städas låset av sig självt — ta bort data/${LASFIL} bara om\n` +
    "du vet att ingen kör."
  );
}

/**
 * Ta låset. Kastar om någon annan håller det.
 *
 * Returnerar en funktion som släpper. Den registreras också på `exit`, så att
 * ett `process.exit()` mitt i en grind inte lämnar katalogen låst.
 */
export function taLaset(dataDir: string, hallare: string): () => void {
  const vag = lasvag(dataDir);
  medLasbyte(dataDir, () => {
    const innehav = lasinnehavLast(dataDir);
    if (innehav) throw new Error(lastext(innehav));
    writeFileSync(
    vag,
    JSON.stringify({ hallare, pid: process.pid, sedan: new Date().toISOString() }, null, 2) + "\n",
    { flag: "wx" },
    );
  });

  let slappt = false;
  const slapp = () => {
    if (slappt) return;
    slappt = true;
    process.removeListener("exit", slapp);
    // Släpp bara VÅRT lås: har någon annan hunnit ta det är det inte vårt att ta bort.
    try {
      const nu = JSON.parse(readFileSync(vag, "utf8")) as Lasinnehav;
      if (nu.pid === process.pid) rmSync(vag, { force: true });
    } catch {
      /* redan borta */
    }
  };
  process.on("exit", slapp);
  return slapp;
}

/**
 * Kräv att `data/` är fritt, annars avsluta med ett läsbart skäl.
 *
 * För verktyg som hellre stannar än kastar — CLI:er där ett stacktrace bara
 * skymmer beskedet.
 */
export function kravFrittData(dataDir: string): void {
  try {
    const innehav = lasinnehav(dataDir);
    if (!innehav) return;
    console.error(lastext(innehav));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
}
