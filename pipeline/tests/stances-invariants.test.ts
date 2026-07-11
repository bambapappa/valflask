/**
 * Frågevågen V0 — invarianterna RS1–RS5 (SPEC-FRAGEVAGEN.md §4.3, del av T14)
 * samt mekanisk ändringsklassning (RS5) och skelettgenerering mot den
 * skarpa frågelistan i data/issues.json.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  PARTY_CODES,
  buildSkeleton,
  classifyChange,
  emptyCell,
  validateStanceInvariants,
  type IssuesFile,
  type StanceCell,
  type Statement,
} from "../src/stances.ts";

const ROOT = resolve(import.meta.dirname, "../../");
const realIssues = JSON.parse(
  readFileSync(join(ROOT, "data", "issues.json"), "utf8"),
) as IssuesFile;

/* ───────────────────────────────────────────────────────────── fixtures ── */

const miniIssues: IssuesFile = {
  criteria_note: "testfixtur — tröghetsregeln",
  formulation_note: "testfixtur",
  issues: [
    {
      id: "i-test",
      title: "Testfrågan",
      slug: "testfragan",
      category: "övrigt",
      status: "aktiv",
      selection_sources: [],
      subquestions: [
        {
          id: "sq-test-a",
          text: "Ska testet gå igenom?",
          formulation_status: "utkast",
          fairness_note: "testfixtur",
        },
      ],
    },
  ],
};

function makeStatement(overrides: Partial<Statement> & { id: string }): Statement {
  return {
    position: "ja",
    condition_note: null,
    quote: "Vi säger ja till testet och står för det.",
    person: null,
    date_stated: "2026-07-01",
    source: {
      url: "https://svt.se/test",
      domain: "svt.se",
      archive_url: "https://web.archive.org/web/2026/https://svt.se/test",
      fetched_at: "2026-07-01T10:00:00Z",
    },
    source_status: "ok",
    source_checked_at: null,
    related_promise_ids: [],
    extraction: { model: "test-a", verified_by: "test-b", run_id: "t" },
    ...overrides,
  };
}

/** Cell med ett riktningsbyte (ja → nej) — ändringsfallet ur V0:s DoD. */
function cellWithDirectionChange(): StanceCell {
  const first = makeStatement({ id: "st-2026-0001", position: "ja", date_stated: "2026-06-01" });
  const second = makeStatement({ id: "st-2026-0002", position: "nej", date_stated: "2026-07-01" });
  return {
    subquestion_id: "sq-test-a",
    party: "s",
    current: { position: "nej", statement_id: "st-2026-0002" },
    statements: [first, second],
    changes: [
      {
        date: "2026-07-01",
        from_statement: "st-2026-0001",
        to_statement: "st-2026-0002",
        kind: "riktningsbyte",
        commit: null,
      },
    ],
    last_searched: "2026-07-01",
  };
}

function skeletonWith(cell: StanceCell): StanceCell[] {
  return buildSkeleton(miniIssues, [cell]);
}

/** Indexåtkomst utan undefined-union (noUncheckedIndexedAccess) — fixtures har kända längder. */
function stmt(cell: StanceCell, i: number): Statement {
  const s = cell.statements[i];
  assert.ok(s, `fixturen saknar statement ${i}`);
  return s;
}
function firstChange(cell: StanceCell) {
  const c = cell.changes[0];
  assert.ok(c, "fixturen saknar ändringspost");
  return c;
}

/* ─────────────────────────────────────────────── RS5: classifyChange ── */

test("RS5: ja↔nej är riktningsbyte, oavsett riktning", () => {
  assert.equal(classifyChange("ja", "nej"), "riktningsbyte");
  assert.equal(classifyChange("nej", "ja"), "riktningsbyte");
});

test("RS5: villkorat inblandat är villkorsandring, aldrig riktningsbyte", () => {
  assert.equal(classifyChange("ja", "villkorat"), "villkorsandring");
  assert.equal(classifyChange("villkorat", "nej"), "villkorsandring");
  assert.equal(classifyChange("villkorat", "ja"), "villkorsandring");
  assert.equal(classifyChange("nej", "villkorat"), "villkorsandring");
});

/* ──────────────────────────────────────────────────── skelett + RS1 ── */

test("RS1: skelettet mot skarpa issues.json ger delfrågor × 8 partier, grönt", () => {
  const subquestionCount = realIssues.issues.reduce((n, i) => n + i.subquestions.length, 0);
  const cells = buildSkeleton(realIssues, []);
  assert.equal(cells.length, subquestionCount * PARTY_CODES.length);
  assert.deepEqual(validateStanceInvariants(realIssues, cells), []);
});

test("RS1: saknad cell och dubblettcell upptäcks", () => {
  const full = buildSkeleton(miniIssues, []);
  const missing = validateStanceInvariants(miniIssues, full.slice(1));
  assert.ok(missing.some((e) => e.startsWith("RS1: cell saknas")));

  const dup = validateStanceInvariants(miniIssues, [...full, emptyCell("sq-test-a", "s")]);
  assert.ok(dup.some((e) => e.startsWith("RS1: dubblettcell")));
});

test("RS1: cell mot okänd delfråga upptäcks", () => {
  const cells = [...buildSkeleton(miniIssues, []), emptyCell("sq-finns-inte", "s")];
  const errors = validateStanceInvariants(miniIssues, cells);
  assert.ok(errors.some((e) => e.includes("okänd delfråga")));
});

test("skelettet är icke-destruktivt och deterministiskt", () => {
  const cell = cellWithDirectionChange();
  const cells = skeletonWith(cell);
  const found = cells.find((c) => c.subquestion_id === "sq-test-a" && c.party === "s");
  assert.equal(found, cell); // samma objekt — aldrig omskrivet
  assert.deepEqual(skeletonWith(cell), cells); // samma indata ⇒ samma utdata
});

/* ─────────────────────────────────────────────── RS2/RS3/RS4/RS5 valid ── */

test("ändringsfallet (ja→nej med riktningsbyte) passerar alla invarianter", () => {
  assert.deepEqual(validateStanceInvariants(miniIssues, skeletonWith(cellWithDirectionChange())), []);
});

test("RS2: dubblerat statement-id och bruten kronologi upptäcks", () => {
  const cell = cellWithDirectionChange();
  cell.statements[1] = { ...stmt(cell, 1), id: "st-2026-0001" };
  cell.current = { position: "nej", statement_id: "st-2026-0001" };
  cell.changes = [];
  const dupErrors = validateStanceInvariants(miniIssues, skeletonWith(cell));
  assert.ok(dupErrors.some((e) => e.startsWith("RS2:") && e.includes("mer än en gång")));

  const cell2 = cellWithDirectionChange();
  cell2.statements[1] = { ...stmt(cell2, 1), date_stated: "2026-05-01" };
  const chronoErrors = validateStanceInvariants(miniIssues, skeletonWith(cell2));
  assert.ok(chronoErrors.some((e) => e.startsWith("RS2:") && e.includes("kronologiska")));
});

test("RS3: current måste spegla sista statementet; tom cell måste vara tom", () => {
  const cell = cellWithDirectionChange();
  cell.current = { position: "ja", statement_id: "st-2026-0001" }; // pekar på fel statement
  const errors = validateStanceInvariants(miniIssues, skeletonWith(cell));
  assert.ok(errors.some((e) => e.startsWith("RS3:") && e.includes("sista statementet")));

  const empty = emptyCell("sq-test-a", "s");
  empty.current = { position: "ja", statement_id: null }; // besked utan statement
  const emptyErrors = validateStanceInvariants(miniIssues, skeletonWith(empty));
  assert.ok(emptyErrors.some((e) => e.startsWith("RS3:") && e.includes("inget_tydligt_besked")));
});

test("RS3: ändring som refererar statement utanför cellen upptäcks", () => {
  const cell = cellWithDirectionChange();
  cell.changes = [{ ...firstChange(cell), from_statement: "st-2026-9999" }];
  const errors = validateStanceInvariants(miniIssues, skeletonWith(cell));
  assert.ok(errors.some((e) => e.startsWith("RS3:") && e.includes("utanför cellen")));
});

test("RS4: villkorat kräver condition_note — och bara villkorat får ha den", () => {
  const cell = cellWithDirectionChange();
  cell.statements[1] = { ...stmt(cell, 1), position: "villkorat", condition_note: null };
  cell.current = { position: "villkorat", statement_id: "st-2026-0002" };
  cell.changes = [{ ...firstChange(cell), kind: "villkorsandring" }];
  const errors = validateStanceInvariants(miniIssues, skeletonWith(cell));
  assert.ok(errors.some((e) => e.startsWith("RS4:") && e.includes("utan condition_note")));

  const cell2 = cellWithDirectionChange();
  cell2.statements[0] = { ...stmt(cell2, 0), condition_note: "villkor som inte hör hemma här" };
  const errors2 = validateStanceInvariants(miniIssues, skeletonWith(cell2));
  assert.ok(errors2.some((e) => e.startsWith("RS4:") && e.includes("trots position")));
});

test("RS5: ja→nej felmärkt som precisering upptäcks, liksom ändring utan positionsskillnad", () => {
  const cell = cellWithDirectionChange();
  cell.changes = [{ ...firstChange(cell), kind: "precisering" }];
  const errors = validateStanceInvariants(miniIssues, skeletonWith(cell));
  assert.ok(errors.some((e) => e.startsWith("RS5:") && e.includes("ska vara riktningsbyte")));

  const cell2 = cellWithDirectionChange();
  cell2.statements[1] = { ...stmt(cell2, 1), position: "ja" };
  cell2.current = { position: "ja", statement_id: "st-2026-0002" };
  const errors2 = validateStanceInvariants(miniIssues, skeletonWith(cell2));
  assert.ok(errors2.some((e) => e.startsWith("RS5:") && e.includes("identiska positioner")));
});

/* ─────────────────────────────── skarp frågelista: strukturregler i V0 ── */

test("frågelistan v1: 10 frågor, 1–4 delfrågor per fråga, unika id:n, frågetecken", () => {
  assert.equal(realIssues.issues.length, 10);
  const ids = new Set<string>();
  for (const issue of realIssues.issues) {
    assert.ok(issue.subquestions.length >= 1 && issue.subquestions.length <= 4, issue.id);
    assert.ok(issue.selection_sources.length >= 2, `${issue.id}: minst två institut`);
    for (const sq of issue.subquestions) {
      assert.ok(!ids.has(sq.id), `dubblett: ${sq.id}`);
      ids.add(sq.id);
      assert.ok(sq.text.endsWith("?"), sq.id);
      assert.ok(sq.fairness_note.length >= 10, `${sq.id}: rättvisetest saknas`);
    }
  }
});
