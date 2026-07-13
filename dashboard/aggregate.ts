import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.resolve(here, "../logs/events.jsonl");
const OUT_PATH = path.resolve(here, "../dashboard/public/summary.json");

// ---- Event shapes (loosely typed; we validate the fields we read) ----

interface RouteEvent {
  ts: string;
  event: "route";
  runId: string;
  model: string;
  reason: string; // "default" | "synthesis:Ndocs" | "manual-override"
  distinctDocs: number;
  topScore: number;
}

interface LlmCallEvent {
  ts: string;
  event: "llm_call";
  runId: string;
  model: string;
  in: number;
  out: number;
  cache_write: number;
  cache_read: number;
  latency_ms: number;
  cost_usd: number;
}

type AnyEvent =
  | RouteEvent
  | LlmCallEvent
  | { ts: string; event: string; [k: string]: unknown };

// ---- Per-query rollup ----

interface QueryRollup {
  runId: string;
  model: string; // the model this query actually ran on
  reason: string; // why it routed there
  distinctDocs: number;
  topScore: number;
  turns: number; // number of answerer LLM calls
  costUsd: number; // summed across all its calls (incl. judge if same runId)
  latencyMsTotal: number;
  tokensIn: number;
  tokensOut: number;
}

interface Summary {
  generatedAt: string;
  runStartedAt: string;
  queryCount: number;
  totalCostUsd: number;
  avgCostPerQueryUsd: number;
  modelSplit: { model: string; queries: number; pct: number; costUsd: number }[];
  routing: {
    byReason: { reason: string; queries: number }[];
    // Router agreement is measured against manual-override queries: those are
    // the ground-truth-labeled cases. Agreement = router's own choice would
    // have matched the forced model. We recompute from distinctDocs since the
    // router is a pure function of retrieval signals.
    escalationRatePct: number; // % of queries that ran on the non-default model
  };
  latency: { p50Ms: number; p90Ms: number; maxMs: number };
  cache: { anyCacheHits: boolean; note: string };
  queries: QueryRollup[];
}

function parseEvents(raw: string): AnyEvent[] {
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as AnyEvent);
}

// A "run" is one invocation of the eval suite. Events from many runs are
// concatenated in the file; we summarize only the LATEST run so headline
// numbers describe current behavior, not a mix of experiments. Boundary:
// group consecutive events, cut a new run when we see a route event whose
// runId we've already closed out — simpler and robust here: take all events
// at-or-after the last "run boundary". We approximate the boundary as the
// timestamp of the FIRST route event in the final contiguous block, found by
// walking backward until runIds stop being novel in a tight time cluster.
//
// Pragmatic definition used: the latest run = every event whose ts is >= the
// ts of the route event that starts the final maximal streak of unique
// runIds with no more than GAP_MS between consecutive events.
const GAP_MS = 60_000;

function latestRunEvents(events: AnyEvent[]): AnyEvent[] {
  if (events.length === 0) return [];
  const withTime = events
    .map((e) => ({ e, t: Date.parse(e.ts) }))
    .sort((a, b) => a.t - b.t);

  // Find the last index where the gap to the previous event exceeds GAP_MS;
  // everything from there to the end is the latest run.
  let start = 0;
  for (let i = 1; i < withTime.length; i++) {
    if (withTime[i]!.t - withTime[i - 1]!.t > GAP_MS) start = i;
  }
  return withTime.slice(start).map((x) => x.e);
}

function isRoute(e: AnyEvent): e is RouteEvent {
  return e.event === "route";
}
function isLlm(e: AnyEvent): e is LlmCallEvent {
  return e.event === "llm_call";
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Number(((n / d) * 100).toFixed(1));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

async function main() {
  const raw = await readFile(LOG_PATH, "utf-8");
  const all = parseEvents(raw);
  const events = latestRunEvents(all);

  // Group by runId. Each query has exactly one route event and 1..n llm_call
  // events (answerer turns + possibly a judge call sharing the runId).
  const routes = new Map<string, RouteEvent>();
  const calls = new Map<string, LlmCallEvent[]>();

  for (const e of events) {
    if (isRoute(e)) routes.set(e.runId, e);
    else if (isLlm(e)) {
      const arr = calls.get(e.runId) ?? [];
      arr.push(e);
      calls.set(e.runId, arr);
    }
  }

  const queries: QueryRollup[] = [];
  for (const [runId, route] of routes) {
    const cs = calls.get(runId) ?? [];
    // Answerer turns = calls on the routed model. Judge calls (different model
    // than the route in the Haiku-answerer case) still count toward cost but
    // not toward "turns", which measures agent-loop length.
    const answererCalls = cs.filter((c) => c.model === route.model);
    queries.push({
      runId,
      model: route.model,
      reason: route.reason,
      distinctDocs: route.distinctDocs,
      topScore: route.topScore,
      turns: answererCalls.length,
      costUsd: Number(cs.reduce((s, c) => s + c.cost_usd, 0).toFixed(6)),
      latencyMsTotal: cs.reduce((s, c) => s + c.latency_ms, 0),
      tokensIn: cs.reduce((s, c) => s + c.in, 0),
      tokensOut: cs.reduce((s, c) => s + c.out, 0),
    });
  }

  const totalCost = Number(queries.reduce((s, q) => s + q.costUsd, 0).toFixed(6));

  // Model split by the routed (answerer) model.
  const models = [...new Set(queries.map((q) => q.model))];
  const modelSplit = models.map((model) => {
    const qs = queries.filter((q) => q.model === model);
    return {
      model,
      queries: qs.length,
      pct: pct(qs.length, queries.length),
      costUsd: Number(qs.reduce((s, q) => s + q.costUsd, 0).toFixed(6)),
    };
  });

  // Routing breakdown by reason.
  const reasons = [...new Set(queries.map((q) => q.reason))];
  const byReason = reasons.map((reason) => ({
    reason,
    queries: queries.filter((q) => q.reason === reason).length,
  }));

  const escalations = queries.filter((q) => q.model !== "claude-haiku-4-5").length;

  const latencies = queries.map((q) => q.latencyMsTotal).sort((a, b) => a - b);
  const anyCacheHits = [...calls.values()]
    .flat()
    .some((c) => c.cache_read > 0 || c.cache_write > 0);

  const runStartedAt =
    events.length > 0
      ? events.map((e) => e.ts).sort()[0]!
      : new Date().toISOString();

  const summary: Summary = {
    generatedAt: new Date().toISOString(),
    runStartedAt,
    queryCount: queries.length,
    totalCostUsd: totalCost,
    avgCostPerQueryUsd: Number((totalCost / (queries.length || 1)).toFixed(6)),
    modelSplit,
    routing: {
      byReason,
      escalationRatePct: pct(escalations, queries.length),
    },
    latency: {
      p50Ms: percentile(latencies, 50),
      p90Ms: percentile(latencies, 90),
      maxMs: latencies.at(-1) ?? 0,
    },
    cache: {
      anyCacheHits,
      note: anyCacheHits
        ? "Prompt caching active."
        : "Prompt caching not active — prefix below Haiku 4.5's 4,096-token minimum (decision 017).",
    },
    queries: queries.sort((a, b) => b.costUsd - a.costUsd),
  };

  await writeFile(OUT_PATH, JSON.stringify(summary, null, 2));
  console.log(
    `Wrote ${OUT_PATH}\n` +
      `  queries=${summary.queryCount} totalCost=$${summary.totalCostUsd} ` +
      `avg=$${summary.avgCostPerQueryUsd}\n` +
      `  split=${modelSplit.map((m) => `${m.model.replace("claude-", "")}:${m.queries}`).join(" ")} ` +
      `escalation=${summary.routing.escalationRatePct}%`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});