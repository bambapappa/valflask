import { test } from "node:test";
import assert from "node:assert/strict";
import { losUpp, somText, skrivnaBelopp, type KronikansUnderlag } from "../src/kronikans-tal.ts";

const UNDERLAG: KronikansUnderlag = {
  total_msek: 3_512_858,
  gap_msek: 3_192_858,
  antal_loften: 527,
  belopp: { "p-2026-0576": 2000, "p-2026-0021": 40_000 },
};

test("tusentalsavskiljaren är ett hårt blanksteg — ett tal får inte brytas vid radslut", () => {
  assert.equal(somText(3_512_858).includes("\u00a0"), true);
});

test("summor skrivs som en läsare läser dem", () => {
  assert.equal(somText(3_512_858), "3\u00a0513 miljarder kronor");
  assert.equal(somText(2000), "2 miljarder kronor");
  assert.equal(somText(500), "500 miljoner kronor");
});

test("talen slås upp mot dagens data, texten står still", () => {
  const body = "Löftena summerar till {total}, vilket ger ett gap på {gap} över {antal} löften.";
  const { text, olosta } = losUpp(body, UNDERLAG);
  assert.equal(
    text,
    "Löftena summerar till 3\u00a0513 miljarder kronor, vilket ger ett gap på 3\u00a0193 miljarder kronor över 527 löften.",
  );
  assert.deepEqual(olosta, []);
});

test("ett enskilt löftes belopp slås upp på id", () => {
  const { text } = losUpp("Skolboksgarantin kostar {belopp:p-2026-0576}.", UNDERLAG);
  assert.equal(text, "Skolboksgarantin kostar 2 miljarder kronor.");
});

test("samma krönika ger nya tal när datat ändrats — det är hela poängen", () => {
  const body = "Summan är {total}.";
  const efter = losUpp(body, { ...UNDERLAG, total_msek: 3_670_410 });
  assert.equal(efter.text, "Summan är 3\u00a0670 miljarder kronor.");
  assert.notEqual(efter.text, losUpp(body, UNDERLAG).text);
});

/**
 * Ett tal som tappats bort ska synas. Klammer har ingen betydelse i markdown, så
 * en olöst platshållare står kvar som skräptext i stället för att försvinna.
 */
test("en platshållare som inte går att slå upp lämnas kvar synlig och rapporteras", () => {
  const { text, olosta } = losUpp("Löftet kostar {belopp:p-2026-9999}.", UNDERLAG);
  assert.match(text, /\{belopp:p-2026-9999\}/u);
  assert.equal(olosta.length, 1);
  assert.match(olosta[0]!.skal, /finns inte bland de aktiva löftena/u);
});

test("ett tillbakadraget löftes belopp går inte att visa — meningen måste skrivas om", () => {
  const utanBelopp: KronikansUnderlag = { ...UNDERLAG, belopp: {} };
  const { olosta } = losUpp("Kostar {belopp:p-2026-0576}.", utanBelopp);
  assert.equal(olosta.length, 1);
  assert.match(olosta[0]!.skal, /skrivas om/u);
});

test("redogörelsen rörs inte — bara talen", () => {
  const body = "**Skola och skärmar**\nLiberalerna vill införa skärmfritt låg- och mellanstadium [p-2026-0559].";
  assert.equal(losUpp(body, UNDERLAG).text, body);
});

test("skrivna belopp i löptexten pekas ut åt den som granskar", () => {
  assert.deepEqual(
    skrivnaBelopp("Skolboksgarantin kostar 500 miljoner kronor per år, och totalt {total}."),
    ["500 miljoner kronor"],
  );
});

test("en platshållare räknas inte som ett skrivet belopp", () => {
  assert.deepEqual(skrivnaBelopp("Summan är {total} och gapet {gap}."), []);
});
