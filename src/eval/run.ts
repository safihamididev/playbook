import cases from "./cases.json" with { type: "json" };
import type { EvalCase } from "./types.js";
import { answer } from "../answer.js";
import { judgeAnswer } from "./judge.js";

const evalCases = cases as EvalCase[];

interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string; // only on failure — what was expected vs. seen
}

interface ToolCall {
  name: string;
  input: unknown;
}

const CITATION_RE = /\[([a-z0-9-]+#[a-z0-9-]+)\]/g;

function checkCase(
  test: EvalCase,
  text: string,
  retrievedIds: Set<string>,
  trace: ToolCall[]
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

  // 3. Tool-call assertions against the trace.
  //    Constraints, not scripts: tool use is non-deterministic across runs
  //    (same query may or may not add an optional lookup), so cases assert
  //    "must include" / "must not include", never exact sequences.
  const calledTools = new Set(trace.map((t) => t.name));
  const calledList = trace.length
    ? [...calledTools].join(", ")
    : "(no tools called)";

  if (test.mustCallTools) {
    const missing = test.mustCallTools.filter((t) => !calledTools.has(t));
    checks.push({
      name: `${test.id} / tools-called`,
      pass: missing.length === 0,
      ...(missing.length
        ? { detail: `missing required: ${missing.join(", ")} — actually called: ${calledList}` }
        : {}),
    });
  }

  if (test.mustNotCallTools) {
    const forbidden = test.mustNotCallTools.filter((t) => calledTools.has(t));
    checks.push({
      name: `${test.id} / tools-not-called`,
      pass: forbidden.length === 0,
      ...(forbidden.length
        ? { detail: `forbidden tools called: ${forbidden.join(", ")} — full trace: ${calledList}` }
        : {}),
    });
  }

  // 4. Citation checks: default for every answer-mode response, opt-out per
  //    case for answers expected to come purely from tools.
  if (test.expect === "answer" && !refused && !test.skipCitationChecks) {
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

    const checks = checkCase(test, res.text, retrievedIds, res.trace);

    // Judge tier: opinions with a model behind them. Only where code
    // can't reach, clearly labeled, reasoning surfaced on failure.
    if (test.judge) {
      const verdict = await judgeAnswer(test.query, res.text, test.judge);
      checks.push({
        name: `${test.id} / judge`,
        pass: verdict.pass,
        ...(verdict.pass ? {} : { detail: verdict.reason }),
      });
    }

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