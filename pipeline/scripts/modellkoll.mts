/**
 * Vilka modeller tar emot `temperature: 0`?
 *
 * Primären avvisade anrop med "invalid temperature: only 1 is allowed for this
 * model" utan att säga vilken modell, och leverantörens dokumentation säger
 * ingenting om parameterbegränsningar. Det här skriptet frågar API:et i
 * stället för att gissa.
 *
 * Ett minimalt anrop per led och roll, först med `temperature: 0`. Avvisas det
 * med ett fel som nämner temperature görs ett andra anrop utan parametern, för
 * att skilja "modellen vill inte ha 0" från "modellen svarar inte alls".
 *
 * Läser bara. Skriver ingen data och committar ingenting. Svarens innehåll
 * kastas — det enda som redovisas är vad som togs emot.
 *
 * Nycklarna skrivs aldrig ut. Bara värdnamn och modellnamn.
 */
import { byggLed } from "../src/cli-run.ts";

const ROLLER = ["extract", "verify", "copy"] as const;

interface Utfall {
  led: string;
  vard: string;
  roll: string;
  modell: string;
  status: "temperature 0 OK" | "kräver eget default" | "svarar inte";
  detalj?: string;
}

async function prova(
  baseUrl: string,
  apiKey: string,
  modell: string,
  medTemperatur: boolean,
): Promise<{ ok: boolean; status: number; text: string }> {
  const body: Record<string, unknown> = {
    model: modell,
    messages: [{ role: "user", content: "Svara med ordet OK." }],
    max_tokens: 5,
  };
  if (medTemperatur) body.temperature = 0;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  return { ok: res.ok, status: res.status, text: res.ok ? "" : (await res.text()).slice(0, 300) };
}

function vardnamn(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "okänd";
  }
}

const roller = Object.fromEntries(
  ROLLER.map((r) => [r, process.env[`MODEL_${r.toUpperCase()}`] ?? ""]).filter(([, v]) => v),
) as Record<string, string>;

if (Object.keys(roller).length === 0) {
  console.error("Inga MODEL_*-variabler satta — inget att prova.");
  process.exit(1);
}

const led = byggLed(process.env, roller);
const utfall: Utfall[] = [];

for (const l of led) {
  for (const [roll, primarModell] of Object.entries(roller)) {
    const modell = l.modell?.[primarModell] ?? primarModell;
    const vard = vardnamn(l.baseUrl);
    let rad: Utfall = { led: l.namn, vard, roll, modell, status: "svarar inte" };

    const med = await prova(l.baseUrl, l.apiKey, modell, true);
    if (med.ok) {
      rad.status = "temperature 0 OK";
    } else if (/temperature/i.test(med.text)) {
      const utan = await prova(l.baseUrl, l.apiKey, modell, false);
      rad = utan.ok
        ? { ...rad, status: "kräver eget default" }
        : { ...rad, status: "svarar inte", detalj: `HTTP ${utan.status}: ${utan.text}` };
    } else {
      rad.detalj = `HTTP ${med.status}: ${med.text}`;
    }

    utfall.push(rad);
    console.log(
      `${rad.led.padEnd(9)} ${rad.vard.padEnd(16)} ${rad.roll.padEnd(8)} ` +
        `${rad.modell.padEnd(28)} ${rad.status}${rad.detalj ? `  — ${rad.detalj}` : ""}`,
    );
    await new Promise((r) => setTimeout(r, 1500)); // samma hänsyn som pipelinen
  }
}

const kraverDefault = utfall.filter((u) => u.status === "kräver eget default");
const tysta = utfall.filter((u) => u.status === "svarar inte");

console.log(`\n${utfall.length} kombinationer provade.`);
if (kraverDefault.length > 0) {
  console.log(`\nKräver sitt eget default-temperature (${kraverDefault.length}):`);
  for (const u of kraverDefault) console.log(`  ${u.led}/${u.roll}: ${u.modell} (${u.vard})`);
  const verify = kraverDefault.filter((u) => u.roll === "verify");
  if (verify.length > 0) {
    console.log(
      `\nOBS: ${verify.length} av dem är VERIFY-modeller. Verifieringen är den ` +
        `oberoende kontrollen av att ett citat återges ord för ord, och den ska ` +
        `vara reproducerbar — samma underlag ska ge samma utfall. Byt hellre ` +
        `modell för den rollen än att köra den på ett default vi inte styr.`,
    );
  }
}
if (tysta.length > 0) {
  console.log(`\nSvarar inte alls (${tysta.length}) — egen felkod ovan:`);
  for (const u of tysta) console.log(`  ${u.led}/${u.roll}: ${u.modell} (${u.vard})`);
}
