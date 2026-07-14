import cases from "./cases.json" with { type: "json" };
import type { EvalCase } from "./types.js";
import { answer } from "../answer.js";
import { judgeAnswer } from "./judge.js";
import { route, HAIKU, SONNET } from "../router.js";

const evalCases = cases as EvalCase[];

interface CheckResult {
  name: string;
  pass: boolean;
  soft?: boolean; // soft checks report (⚠) but never fail the run
  detail?: string; // only on failure — what was expected vs. seen
}

interface ToolCall {
  name: string;
  input: unknown;
}

const CITATION_RE = /\[([a-z0-9-]+#[a-z0-9-]+)\]/g;
const MODEL_ID = { haiku: HAIKU, sonnet: SONNET } as const;

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

    // Force the case's required model, if it declares one. This makes the
    // case the routing GROUND TRUTH — validated against the model it needs.
    // Save/restore so one case's forcing never leaks into the next.
    const prevModelEnv = process.env.PLAYBOOK_MODEL;
    if (test.expectModel) process.env.PLAYBOOK_MODEL = MODEL_ID[test.expectModel];

    const res = await answer(test.query);

    if (test.expectModel) {
      if (prevModelEnv === undefined) delete process.env.PLAYBOOK_MODEL;
      else process.env.PLAYBOOK_MODEL = prevModelEnv;
    }

    const retrievedIds = new Set(res.results.map((r) => r.chunk.id));
    const checks = checkCase(test, res.text, retrievedIds, res.trace);

    // Soft router-agreement check: does the cheap heuristic AGREE with the
    // case's ground-truth model? Reports (⚠) but never fails the merge — the
    // heuristic is allowed to be wrong, not allowed to be wrong silently.
    if (test.expectModel) {
      const wanted = MODEL_ID[test.expectModel];
      const routed = route(res.results).model;
      const agrees = routed === wanted;
      checks.push({
        name: `${test.id} / router-agreement`,
        pass: agrees,
        soft: true,
        ...(agrees ? {} : { detail: `router chose ${routed}, ground truth is ${wanted}` }),
      });
    }

    // Judge tier: opinions with a model behind them. Only where code
    // can't reach, clearly labeled, reasoning surfaced on failure.
    if (test.judge) {
      const verdict = await judgeAnswer(test.query, res.text, test.judge, res.runId);
      checks.push({
        name: `${test.id} / judge`,
        pass: verdict.pass,
        ...(verdict.pass ? {} : { detail: verdict.reason }),
      });
    }

    for (const c of checks) {
      const mark = c.pass ? "✓" : c.soft ? "⚠" : "✗";
      console.log(`  ${mark} ${c.name}`);
      if (!c.pass && c.detail) console.log(`      ${c.detail}`);
    }
    results.push(...checks);
  }

  // Only HARD failures gate the run. Soft checks are reported, not enforced.
  const hardFailures = results.filter((c) => !c.pass && !c.soft).length;
  const softWarnings = results.filter((c) => !c.pass && c.soft).length;
  const passed = results.filter((c) => c.pass).length;

  console.log(
    `\n${passed}/${results.length} checks passed` +
      (hardFailures ? ` — ${hardFailures} FAILED` : "") +
      (softWarnings ? ` — ${softWarnings} soft warning(s)` : "")
  );
  return hardFailures;
}

run()
  .then((hardFailures) => process.exit(hardFailures > 0 ? 1 : 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });