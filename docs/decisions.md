# Playbook — Decision Log

Short entries, newest last. Each records a decision, the alternative considered, and why.

---

## 001 — Embeddings-only retrieval, flat-file index

**Decision:** Semantic search via Voyage embeddings with cosine similarity computed in-process over a flat `embeddings.json`. No vector database, no BM25.

**Alternatives:** BM25 keyword search (no API dependency, but misses paraphrase — ops queries are wording-hostile: users type "money stuck", docs say "withdrawal latency degradation"); hybrid (best recall, unjustified complexity at this size); vector DB (pure overhead at 118 chunks — the entire index is 1.5 MB and loads in milliseconds).

**Scaling path:** hybrid BM25 + embeddings behind the same `search()` interface once the corpus outgrows in-memory search.

**Validated:** query "why did the wallet page break in August" retrieves the version-skew postmortem at ranks 1–3 despite zero vocabulary overlap (doc says "2025-08-07", "failed to mount").

---

## 002 — Embedding model: voyage-4-lite

**Decision:** Cheapest current-generation Voyage model. At 118 chunks the quality delta vs. larger models is not measurable, and the corpus embeds within free-tier limits.

**Note:** Same rubric (task complexity × cost) applied later to Haiku vs. Sonnet routing for generation.

---

## 003 — Chunking: one H2 section per chunk

**Decision:** Split on `## ` headings; each section becomes one chunk.

**Alternative:** Fixed-size token windows (the general-purpose default). Rejected *for this corpus*: fixed windows cut mid-procedure, producing chunks incomplete on both ends — orphaned triage steps whose pronouns refer to text in a different chunk. Incomplete context in → hallucination risk out.

**Honest caveat:** H2 chunking works because we control the corpus format. For messy real-world corpora, fixed-window-with-overlap survives as the default.

---

## 004 — Chunk text prefixed with doc title

**Decision:** Every chunk embeds as `{docTitle} > {heading}\n\n{body}`.

**Why:** An embedding represents only the text embedded. A bare "Mitigation" section carries weak topical signal, and five runbooks each have one — without the prefix they cluster as generic ops-speak. The prefix injects the document's topic into every chunk's vector so "CDN > Mitigation" and "Wallet > Mitigation" land in different neighborhoods.

---

## 005 — Merge rule: sections under 250 body-chars fold into the previous chunk

**Decision:** Tiny sections (short escalation lists, two-line notes) merge backward instead of becoming standalone chunks.

**Why body length, not text length:** the threshold measures information density; the title prefix is scaffolding, and counting it would make the merge decision depend on title verbosity.

**Known edge case (deliberate):** the first section of a doc never merges (nothing to merge into) — this preserves the metadata "intro" blocks as standalone chunks, which is desired: "who owns the CDN runbook" retrieves from them.

---

## 006 — Deterministic, human-readable chunk ids

**Decision:** `{filename minus .md}#{slugified-heading}`, e.g. `runbook-cdn-cache-degradation#mitigation`.

**Why:** Ids are the contract everything downstream hangs on — eval ground-truth labels, logged citations. Identity must be stable across runs and machines: same input → same id, forever. (First attempt used random ids; rejected because every re-ingest would invalidate all labels — and randomness doesn't even guarantee uniqueness.)

**Corollary:** `doc` (filename) is stored explicitly on each chunk, not parsed back out of the id. Derived data stored, not reconstructed from a string format that was never a contract.

---

## 007 — Fail fast at the ingestion boundary

**Decision:** Ingest throws (kills the run) on vector-count mismatch or any missing embedding, rather than warning and proceeding.

**Why:** Vector↔chunk correspondence is purely positional. One silently dropped element shifts the alignment of everything after it — dozens of chunks get their neighbor's vector, the file writes successfully, and the corruption surfaces weeks later as inexplicable retrieval quality, far from the cause. Corrupt-but-plausible data is worse than no data. The asymmetry decides it: re-running ingest costs seconds and a fraction of a cent; a poisoned index costs a debugging evening with no error trail.

**Principle:** validate where corruption *enters*, not where it *surfaces*.

---

## 008 — Token-aware batching for rate limits

**Decision:** Greedy packing of chunks into batches under a token budget (~8K), one batch per minute, after hitting the free-tier 429 (3 RPM / 10K TPM).

**Notes:** `chars/4` as the standard rough token heuristic. Batches preserve input order, so the downstream count assertion and positional zip are unchanged. Known limitation: a failure in batch N re-runs batches 1..N-1 on retry — acceptable at this scale; checkpointing is the fix at real scale.

---

## 009 — Index records its own embedding model

**Decision:** `embeddings.json` stores `model`; query-time embedding uses `index.model`, never the code constant.

**Failure prevented:** constant gets bumped for a future re-ingest that never happens → queries embed in a different vector space than the index → scores become plausible-looking noise. Silent corruption again, prevented the same way: data carries its own provenance, consumers trust the data over the code. Files outlive constants.

**Corollary:** queries embed with `inputType: "query"`, documents with `"document"` — Voyage embeds the two asymmetrically; mixing them silently degrades retrieval.

---

## 010 — Retrieval verified in isolation before generation

**Decision:** `ask.ts` prints raw top-k chunks with scores, no LLM call. Generation (`answer.ts`) added only after the paraphrase gauntlet passed.

**Why:** if the wrong chunks come back, no prompt downstream can fix it. Debugging retrieval and generation separately means a failure has one suspect, not two.

**Observation kept:** retrieval never refuses — it always returns top-k, however weak (the "database sharding" query surfaced BFF/caching chunks). The refusal burden sits entirely on the generation layer. Similarity thresholds are a possible mitigation, to be evaluated with data in the evals phase, not guessed.

---

## 011 — Prompt v1 → v2 (see docs/prompt-evolution.md for full outputs)

**Observed v1 failure:** on the ambiguous query "money stuck in wallet", retrieval correctly surfaced both wallet narratives (withdrawal-latency runbook + MFE version-skew postmortem); generation merged them, appending "this is a client-side rendering issue separate from actual money movement" — a fact true of the skew incident — to an answer about withdrawal latency, where it is false and actively misleads triage. Retrieval was correct; generation blended two truths into a falsehood. With no citations required, the error was unverifiable.

**v2 changes:** (1) proper role framing (Playbook, ops copilot, answers only from `<context>`); (2) mandatory per-claim citations with a literal format example `[chunk-id]`; (3) sharpened refusal — state the documentation doesn't cover it, no general-knowledge fallback; (4) ambiguity rule — multiple distinct matching issues are presented separately with sources, never merged; (5) partial-coverage rule — answer what's covered, state what isn't.

**Result (4-query grid, v1 vs v2):** citations 0/4 → 4/4 with claim-level granularity; the conflation repaired into explicit disambiguation ("a separate 2025 incident…") plus a clarifying question back to the user; refusal stayed clean and became informative; no regressions on the two already-correct answers.

**Meta-decision:** prompts are versioned artifacts with changelogs from v2 onward. This grid becomes the seed of the automated eval suite; the wallet conflation becomes a permanent regression test.