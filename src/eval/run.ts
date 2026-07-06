import cases from "./cases.json" with { type: "json" };
import type { EvalCase } from "./types.js";
import { answer } from "../answer.js";

const evalCases = cases as EvalCase[];

interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string; // only on failure — what was expected vs. seen
}

const CITATION_RE = /\[([a-z0-9-]+#[a-z0-9-]+)\]/g;

function checkCase(
  test: EvalCase,
  text: string,
  retrievedIds: Set<string>
): CheckResult[] {
  const checks: CheckResult[] = [];

  // 1. Mode: did refusal behavior match the expectation?
  const refused = text.trimStart().startsWith("NOT_IN_DOCS:");
  const modeOk = refused === (test.expect === "refusal");
  checks.push({
    name: `${test.id} / mode`,
    pass: modeOk,
    ...(modeOk
      ? {}
      : {
          detail:
            test.expect === "refusal"
              ? "expected refusal, got answer"
              : "expected answer, got refusal",
        }),
  });

  // 2. Retrieval expectation (only if the case declares one)
  if (test.mustRetrieve) {
    const missing = test.mustRetrieve.filter((id) => !retrievedIds.has(id));
    checks.push({
      name: `${test.id} / retrieval`,
      pass: missing.length === 0,
      ...(missing.length
        ? {
            detail: `missing: ${missing.join(", ")} — retrieved: ${[
              ...retrievedIds,
            ].join(", ")}`,
          }
        : {}),
    });
  }

  // 3. Citation checks: universal for every answer-mode response.
  //    Two SEPARATE checks — "stopped citing" and "invented a citation"
  //    are different bugs with different fixes.
  if (test.expect === "answer" && !refused) {
    const cited = [...text.matchAll(CITATION_RE)]
      .map((m) => m[1])
      .filter((id): id is string => id !== undefined);

    checks.push({
      name: `${test.id} / citations-present`,
      pass: cited.length > 0,
      ...(cited.length === 0
        ? { detail: "no [chunk-id] citations found in answer" }
        : {}),
    });

    const fabricated = [...new Set(cited)].filter(
      (id) => !retrievedIds.has(id)
    );
    checks.push({
      name: `${test.id} / citations-grounded`,
      pass: fabricated.length === 0,
      ...(fabricated.length
        ? { detail: `cited ids not in retrieved set: ${fabricated.join(", ")}` }
        : {}),
    });
  }

  return checks;
}

export async function run(): Promise<number> {
  const results: CheckResult[] = [];

  for (const test of evalCases) {
    console.log(`\nRunning: ${test.id} — "${test.query}"`);
    const res = await answer(test.query);
    const retrievedIds = new Set(res.results.map((r) => r.chunk.id));
    const checks = checkCase(test, res.text, retrievedIds);

    for (const c of checks) {
      console.log(`  ${c.pass ? "✓" : "✗"} ${c.name}`);
      if (!c.pass && c.detail) console.log(`      ${c.detail}`);
    }
    results.push(...checks);
  }

  const failures = results.filter((c) => !c.pass).length;
  console.log(
    `\n${results.length - failures}/${results.length} checks passed` +
      (failures ? ` — ${failures} FAILED` : "")
  );
  return failures;
}

run()
  .then((failures) => process.exit(failures > 0 ? 1 : 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });