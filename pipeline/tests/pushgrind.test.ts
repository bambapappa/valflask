/**
 * Grind: en körning som mintar en pushtoken måste också använda den.
 *
 * Mönstret i repot är genomtänkt och står utskrivet i workflowarna: checkouten
 * kör med `persist-credentials: false`, för annars skriver den in sin egen
 * token i git-configen, och den token är död när ett timslångt jobb ska pusha.
 * I stället mintas en färsk token strax före pushen.
 *
 * Men mellan de två stegen ligger ett led som är lätt att glömma: **origin
 * måste peka om till den färska token.** Utan det bär origin inga uppgifter
 * alls, och git svarar `could not read Username for 'https://github.com'` på
 * varje försök. Det ser inte ut som ett behörighetsfel — det ser ut som att
 * git vill fråga efter ett lösenord.
 *
 * Kostnaden är mätt. `arkiv.yml` och `skord.yml` mintade båda sin token och
 * använde den aldrig. Båda är schemalagda till måndagar, båda har kört två
 * gånger, och båda föll båda gångerna — 3 och 10 augusti 2026. Arbetet var
 * gjort: skörden hade 563 nya rader, arkivkörningen 604. Allt committades
 * lokalt och kastades, fem försök i rad, varje gång. Larmet gick, ärendet
 * öppnades, och ingen läste loggen förrän 15 augusti.
 *
 * Grinden mäter INTE att de två filerna är lagade — den mäter regeln som är
 * sann om alla workflowar, också de som inte är skrivna än. Ett prov som pekar
 * på förekomsten hade varit grönt de fem dagar felet levde i en tredje fil.
 */
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const WORKFLOWS = resolve(import.meta.dirname, "../../.github/workflows");
const filer = readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml"));

/**
 * Läser filen som text, inte som tolkad YAML.
 *
 * Det som ska mätas står i `run:`-blockens skalkod, och den är en sträng för
 * en YAML-tolkare. Att tolka dokumentet först och gräva ut skalkoden ur det
 * ger samma text via en omväg.
 */
function las(fil: string): string {
  return readFileSync(join(WORKFLOWS, fil), "utf8");
}

/** Pushar körningen till en fjärrgren med `git push`? */
function pushar(kod: string): boolean {
  return /^\s*(if\s+)?git push\s/mu.test(kod);
}

/** Slår checkouten bort de uppgifter git annars skulle ärvt? */
function utanSparadeUppgifter(kod: string): boolean {
  return /persist-credentials:\s*false/u.test(kod);
}

/** Använder någon rad faktiskt token, i stället för att bara sätta den? */
function anvanderToken(kod: string): boolean {
  return /x-access-token:\$\{/u.test(kod);
}

test("en körning som pushar utan sparade uppgifter måste peka om origin till sin token", () => {
  const brister: string[] = [];
  for (const fil of filer) {
    const kod = las(fil);
    if (!pushar(kod) || !utanSparadeUppgifter(kod)) continue;
    if (!anvanderToken(kod)) {
      brister.push(
        `${fil}: checkouten kör med persist-credentials: false och körningen pushar, ` +
          "men ingen rad lägger token i fjärradressen. Pushen faller på " +
          '"could not read Username for \'https://github.com\'". ' +
          'Lägg till: git remote set-url origin "https://x-access-token:${PUSH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"',
      );
    }
  }
  assert.deepEqual(brister, [], brister.join("\n"));
});

test("en token som mintas ska också användas", () => {
  // Den omvända riktningen: en workflow som sätter PUSH_TOKEN i miljön men
  // aldrig läser den har ett led som inte gör något. Det var precis den
  // formen felet hade — variabeln fanns, kommentaren beskrev vad den var
  // till för, och ingen rad rörde den.
  const brister: string[] = [];
  for (const fil of filer) {
    const kod = las(fil);
    if (!/PUSH_TOKEN:\s*\$\{\{/u.test(kod)) continue;
    if (!anvanderToken(kod)) {
      brister.push(`${fil}: sätter PUSH_TOKEN i miljön men ingen rad använder den.`);
    }
  }
  assert.deepEqual(brister, [], brister.join("\n"));
});

test("grinden känner igen felet den finns för", () => {
  // Ett prov som aldrig setts falla är en gissning. Den här återinför felet i
  // en kopia av texten och kräver att båda kontrollerna fäller den.
  const lagad = las("arkiv.yml");
  assert.ok(pushar(lagad) && utanSparadeUppgifter(lagad), "arkiv.yml ska vara den form grinden gäller");
  assert.ok(anvanderToken(lagad), "arkiv.yml ska vara lagad");

  const trasig = lagad.replace(
    /\s*git remote set-url origin \\\n\s*"https:\/\/x-access-token:\$\{PUSH_TOKEN\}@github\.com\/\$\{GITHUB_REPOSITORY\}\.git"/u,
    "",
  );
  assert.notEqual(trasig, lagad, "återinförandet ska faktiskt ha tagit bort raden");
  assert.ok(pushar(trasig) && utanSparadeUppgifter(trasig), "den trasiga formen pushar fortfarande");
  assert.ok(!anvanderToken(trasig), "utan raden ska grinden inte hitta någon användning av token");
});
