import test from "node:test";
import assert from "node:assert/strict";
import { byggPubliceringspaket } from "../src/publiceringspaket.ts";
import { packaPubliceringspaket, packaUppPubliceringspaket } from "../src/publiceringslagring.ts";

function fixture() {
  const fore = [
    { slag: "lofte" as const, id: "a", innehall: { title: "A", quote: "<script>källa</script>" }, beroenden: ["lofte:b"] },
    { slag: "lofte" as const, id: "b", innehall: { title: "B", amount: 100 }, beroenden: [] },
  ];
  const efter = structuredClone(fore);
  efter[1]!.innehall.amount = 200;
  return byggPubliceringspaket("a".repeat(40), "b".repeat(40), fore, efter,
    { sokvagar: ["data/promises.json"], patch: "hela filjämförelsen" });
}

test("delade postversioner återställs exakt med ordning, beroenden och oförändrad hash", () => {
  const paket = fixture();
  const packed = packaPubliceringspaket(paket);
  const refs = packed.paket.andringar.flatMap((a) => [a.fore, a.efter])
    .reduce((n, s) => n + (s?.poster.length ?? 0), 0);
  assert.ok(packed.poster.length < refs);
  assert.deepEqual(packaUppPubliceringspaket(JSON.parse(JSON.stringify(packed))), paket);
  assert.deepEqual(packaUppPubliceringspaket(paket), paket);
  const restored = packaUppPubliceringspaket(packed);
  restored.andringar[0]!.fore!.poster[0]!.innehall.title = "ändrat lokalt";
  assert.deepEqual(packaUppPubliceringspaket(packed), paket);
});

test("utbytta poster, ogiltiga referenser och okänt transportformat stoppas", () => {
  for (const ref of [-1, 0.5, 999, "0", null]) {
    const packed: any = packaPubliceringspaket(fixture());
    packed.paket.andringar[0].fore.poster[0] = ref;
    assert.throws(() => packaUppPubliceringspaket(packed), /posthänvisning/);
  }
  const changed = packaPubliceringspaket(fixture());
  changed.poster[0]!.innehall.title = "utbytt belägg";
  assert.throws(() => packaUppPubliceringspaket(changed), /hash/);
  const packed = packaPubliceringspaket(fixture());
  assert.throws(() => packaUppPubliceringspaket({ ...packed, format: "okänd" }));
  assert.throws(() => packaUppPubliceringspaket({ ...packed, extra: true }));
});

test("upprepade hänvisningar får inte expandera förbi befintlig storleksgräns", () => {
  const packed = packaPubliceringspaket(fixture());
  packed.poster[0]!.innehall.title = "x".repeat(1024 * 1024);
  packed.paket.andringar[0]!.fore!.poster = Array(65).fill(0);
  assert.throws(() => packaUppPubliceringspaket(packed), /För stort/);
});
