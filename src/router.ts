import type { SearchResult } from "./types.js";

export const HAIKU = "claude-haiku-4-5";
export const SONNET = "claude-sonnet-4-6";

// Escalate to Sonnet when retrieval shows the multi-document-synthesis
// signature — chunks drawn from several distinct documents, i.e. no single
// doc owns the answer. This is the ONE case type the Haiku-vs-Sonnet
// experiment found Sonnet meaningfully better on (hard-recurring-theme);
// every operational query in the suite matched on Haiku at ~3.6x less cost.
//
// distinctDocs is a cheap PROXY for synthesis complexity, not a truth: a
// simple query can weakly hit 4 docs, a hard synthesis can live in 2. The
// router catches the common signature; the eval suite is the backstop that
// catches its misses. Threshold calibrated against eval retrieval results.
const SYNTHESIS_DOC_THRESHOLD = 3;

export interface RouteDecision {
  model: string;
  reason: string; // logged + shown on the dashboard: routing you can read
  distinctDocs: number;
  topScore: number;
}

export function route(results: SearchResult[]): RouteDecision {
  const distinctDocs = new Set(results.map((r) => r.chunk.doc)).size;
  const topScore = results[0]?.score ?? 0;

  if (distinctDocs >= SYNTHESIS_DOC_THRESHOLD && topScore > 0.45) {
    return {
      model: SONNET,
      reason: `synthesis:${distinctDocs}docs`,
      distinctDocs,
      topScore,
    };
  }
  return { model: HAIKU, reason: "default", distinctDocs, topScore };
}