import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, copyFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindPubliceringsartefakt, kontrolleraPubliceringsartefakt } from "../src/publiceringsartefakt.ts";

test("binder faktiska filbyte och stoppar utbytt fil, paket, revision och omkörning", async () => {
  const dir = await mkdtemp(join(tmpdir(), "publiceringsartefakt-"));
  const fil = join(dir, "underlag.json");
  try {
    await copyFile(new URL("../../data/promises.json", import.meta.url), fil);
    const id = { repo: "bambapappa/valflask", revision: "a".repeat(40), korning: "123",
      forsok: 1, artefaktId: "456", pakethash: "b".repeat(64) };
    const manifest = await bindPubliceringsartefakt(fil, id);
    assert.ok(manifest.byte > 0);
    await kontrolleraPubliceringsartefakt(fil, manifest, id);
    for (const andring of [{ forsok: 2 }, { korning: "124" }, { artefaktId: "457" },
      { revision: "c".repeat(40) }, { pakethash: "d".repeat(64) }, { repo: "annan/repo" }]) {
      await assert.rejects(kontrolleraPubliceringsartefakt(fil, manifest, { ...id, ...andring }), /skiljer/);
    }
    await assert.rejects(kontrolleraPubliceringsartefakt(fil, { ...manifest, byte: 1 }, id), /skiljer/);
    await writeFile(fil, "Ändrat publiceringsinnehåll");
    await assert.rejects(kontrolleraPubliceringsartefakt(fil, manifest, id), /skiljer/);
    await writeFile(fil, "");
    await assert.rejects(bindPubliceringsartefakt(fil, id), /icke-tom/);
    await assert.rejects(bindPubliceringsartefakt(fil, { ...id, forsok: 0 }), /identitet/);
    await symlink(fil, join(dir, "lank"));
    await assert.rejects(bindPubliceringsartefakt(join(dir, "lank"), id), /vanlig fil/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
