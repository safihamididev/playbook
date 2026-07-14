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

**Downstream payoff (noted during Phase 2):** because slugified ids have a closed alphabet (`[a-z0-9-]` + `#`), citations are extractable from answer text with a one-line regex. Checkability was a free consequence of deterministic ids.

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

---

## 012 — Prompt v3: machine-checkable refusal marker (and a live regression)

**Decision:** Refusals must begin with the exact marker `NOT_IN_DOCS:`. Refusal detection becomes `startsWith`, immune to phrasing drift.

**Principle:** when a property is hard to check, make the output more checkable rather than the checker smarter. Engineer contracts into the output. (Applied again for the eval judge: verdicts must begin `VERDICT: PASS|FAIL`.)

**Honest changelog entry:** during the v3 refactor, the ambiguity rule — the exact instruction that fixed the 011 conflation — was accidentally dropped, and nothing caught it, because the thing that would catch it was the eval harness being built at the time. Restored. This incident is the empirical argument for the CI gate: prompts are code, they regress through routine edits, and nothing typechecks them.

---

## 013 — Eval architecture: deterministic tier + narrow LLM judge

**Decision:** Two-tier harness. Deterministic checks (refusal mode via marker, required chunk ids retrieved, citations present, citations grounded in the retrieved set) carry the structural load. An LLM judge is used only where code can't reach — faithfulness criteria like the conflation test — with narrow, case-specific criteria written into `cases.json`.

**Judge model: Sonnet, while the answerer runs Haiku.** Two reasons: (1) self-preference bias — a model grading its own generations conflates "plausible to me" with "correct"; different weights break the link between generated-it and grades-it. (2) Cost asymmetry: the judge is O(eval-runs), the answerer is O(traffic) — spend up on the low-volume verdict, stay cheap on the hot path. Same rubric as 002.

**Checkable-output contract:** judge verdicts must begin `VERDICT: PASS` or `VERDICT: FAIL`; a malformed verdict throws — a checker that won't follow its contract must never silently pass or fail anyone (007's principle applied to the checking layer).

**Citation checks are two separate checks by design:** "stopped citing" (prompt compliance) and "invented a citation" (fabrication — the camouflage failure) are different bugs with different fixes and must be reported distinctly.

**Validated by sabotage (see docs/ci-gate.md):** a PR deleting the prompt's instructions block failed 4/14 checks and was blocked from merging. The sabotage also surfaced two honest limitations: `citations-grounded` passes vacuously when no citations exist (improvement: mark as skipped), and single-run judge cases have variance (hardening path: N-run sampling if flakiness observed).

---

## 014 — Query-embedding cache: fail-soft, model-keyed, committed

**Decision:** `search()` caches query embeddings in `.query-cache.json`, keyed `${model}::${query}`. Cache writes are fail-soft (warn and continue); cache reads tolerate a missing file.

**Why fail-soft here when ingest (007) is fail-fast:** the index is the source of truth — corruption there poisons everything downstream, so doubt halts the world. The cache is a derived optimization — losing it costs a re-embed worth a fraction of a cent, and it can never serve *wrong* data because the model in the key makes cross-model staleness structurally unreachable (009's provenance principle). **Fail fast on truth, fail soft on derived data.**

**Committed deliberately:** with `.query-cache.json` (and `embeddings.json`) in the repo, CI runs the retrieval layer with zero Voyage calls. The eval suite's cheapest failure mode is a slow run (cache miss → live embed), not a red build. Origin story: the free-tier 429 (3 RPM) killed eval runs; the write-through cache turned failed runs into progress — each retry ratchets forward.

---

## 015 — CI gate: evals as a required status check

**Decision:** GitHub Actions runs `npm run eval` on every PR and push to main; the runner's exit code is the entire integration. A ruleset on `main` requires the `eval` check, requires PRs (no direct pushes), blocks force pushes, and has an empty bypass list — a red check blocks everyone, including the repo owner.

**Why no bypass:** any guardrail that can be overridden will eventually be overridden under schedule pressure (a recurring theme in the corpus itself — see the wallet MFE version-skew postmortem). For a solo repo the lockout is cheap and the discipline is the point.

**Operating rule:** every observed failure becomes an eval case before (or alongside) its fix. The suite only grows.

---

## 016 — Retrieval stays hardwired; tools are for actions

**Decision (Phase 3 architecture fork):** RAG retrieval remains hardwired — every query embeds, searches, and injects top-k context. Action tools (`get_service_status`, `get_oncall`, `create_incident`) are added alongside it. Retrieval is NOT exposed as a `search_docs` tool the model may choose to call.

**The tradeoff, both sides argued:** retrieval-as-tool enables iterative search — reformulated queries, multi-hop questions ("matchmaking slow" → runbook → follow-up search for the festival capacity process it references). That is the genuinely more capable architecture. Hardwired retrieval wastes an embed call (~100ms, fraction of a cent) and ~3K tokens of ignored context on pure action requests ("page the payments on-call").

**Why hardwired wins here:** with retrieval optional, the model can decide not to search and answer a documentation question from general knowledge — converting the system's core invariant ("answers come from retrieved context"), on which all faithfulness machinery rests (citations, groundedness checks, the conflation test), into a probabilistic model behavior that would itself need evals. **Costs you pay; risks you architect away.** Milliseconds and fractions of a cent are a cost; a soft invariant is a risk.

**Revisit path:** if multi-hop documentation questions become a real need, introduce retrieval-as-tool behind the eval suite — the harness is how that change would be de-risked.

## 017 — Prompt caching: evaluated, instrumented, deferred

**Decision:** Not activated. The agent loop's cacheable prefix (tools + system + first user message) runs ~2.4K tokens — below Haiku 4.5's 4,096-token minimum. Below the minimum, `cache_control` silently no-ops: the request succeeds, nothing caches, and you pay full price while believing you've optimized — the plausible-but-wrong failure mode again (see 007, 009).

**Instrumented now:** per-turn logging of `cache_creation_input_tokens` / `cache_read_input_tokens` alongside input/output tokens. Cost: one line.

**Revisit trigger (observable, not remembered):** when the prefix grows past 4,096 (MCP wrapping, larger context, more tools), activation is one `cache_control: {type: "ephemeral"}` on the system block — and the logs
themselves confirm it worked (creation on turn 1, reads on turns 2+).

## 018 — MCP surface: two tiers, because invariants don't cross ownership boundaries
 
**Decision:** The MCP server exposes five tools in two tiers. Primitives —
`search_docs`, `get_service_status`, `get_oncall`, `create_incident` — hand
raw capability to the calling agent, which composes them freely and owns its
own correctness. The composed tool — `ask_playbook` — runs the entire
Playbook pipeline (hardwired retrieval, agent loop, per-claim citations,
refusal marker) behind one call, carrying Playbook's guarantees inside a
black box.
 
**Why 016 doesn't simply transfer:** 016 hardwired retrieval because we owned
the loop — the invariant "answers are grounded in retrieved context" was
enforced by construction. Over MCP, the deciding model runs under a prompt we
don't control; there is no loop to hardwire. The invariant's *reasoning*
survives; its *enforcement point* is gone. The two tiers are the answer:
where the caller owns the loop, offer parts; where the caller wants the
guarantees, offer the pipeline. (Standard platform-API shape: raw K/V store
vs. transactional layer.)
 
**Empirical boundary, observed in the first real-client session (see
docs/mcp-demo.md):** `search_docs`'s description asks callers to cite chunk
ids; Claude Desktop's agent used the tool well — paraphrase resolution,
cross-chunk synthesis — and did not cite. **Instructions travel, invariants
don't.** A description can request good behavior from an external agent; only
the composed tier can guarantee it. Also observed: the consuming agent
paraphrases even `ask_playbook`'s cited answers into its own voice — we
control the answer, not the presentation.
 
**Corollary noted for retrieval-as-tool:** the iterative multi-hop retrieval
016 traded away now exists legitimately — one layer up, in the consumer's
agent, where its faithfulness is the consumer's responsibility.
 
---
 
## 019 — MCP logging: stdout is the protocol; diagnostics are structured JSONL on stderr
 
**Decision:** In stdio transport, stdout carries MCP protocol frames — any
stray `console.log` corrupts the channel. All diagnostics moved to
`src/log.ts`: one function writing JSONL events
(`{ts, event, ...data}`) to **stderr**, which MCP hosts capture per-server
(Claude Desktop: `~/Library/Logs/Claude/mcp-server-playbook.log`).
 
**Why structured, not just redirected:** the token-usage lines
(`llm_call` events with model, input/output/cache token counts) are the
Phase 4 cost dashboard's data feed. One instrumentation point, two consumers:
human-readable diagnostics today, machine-ingestable cost records tomorrow —
adding a file sink is a two-line change inside `log()` when the dashboard
needs it.
 
**Aside for the interview shelf:** the stdout/stderr split — machine channel
vs. diagnostic channel — is 50-year-old Unix design suddenly load-bearing in
a 2024 protocol.

## 020 — Routing decided by experiment, not assumption; the eval is ground truth, the router approximates it
 
**The experiment:** Made the answerer model configurable (`PLAYBOOK_MODEL`) and ran the full eval suite twice — Haiku arm and Sonnet arm — including six *hard* cases written specifically to strain a small model (multi-document synthesis, argued judgment anchored to specific ADRs). Result: across six hard cases, Sonnet won exactly one, on a fine synthesis-precision distinction (naming the "machine-enforced expiry" theme explicitly). Every operational query matched on Haiku. Cost delta: **~3.6×** (Haiku $1/$5 per MTok vs. Sonnet $3/$15), plus 2–4× latency.
 
**Finding:** the premium model was a solution looking for a problem in this workload. Default to Haiku; escalate rarely. A near-null result is the strongest possible evidence *for* Haiku — and the self-preference bias in the judge (Sonnet grading a Sonnet-family answerer) tilts the deck slightly toward finding Sonnet better, which makes the null extra trustworthy.
 
**Architecture chosen (option c):** Haiku-default with a documented, rarely-firing escalation. The router (`src/router.ts`) is a **pure function of retrieval signals** already computed for free — no classifier LLM call, no added latency: escalate to Sonnet when chunks span ≥3 distinct docs at a strong top score. `reason` is logged and shown on the dashboard — routing you can read.
 
**The honest part — 12 points can't calibrate a threshold without overfitting.** So the eval suite *encodes* which queries need which model (`expectModel` on the two hard-synthesis cases), forcing that model at eval time — this is the routing GROUND TRUTH. The router is a cheap approximation of those labels. Where they disagree, a **soft `router-agreement` check** surfaces it (⚠, non-gating): the heuristic is allowed to be wrong, it is not allowed to be wrong *silently*. Current agreement: ~85% (2 of 13 cases disagree — both high-topScore 2-doc synthesis the doc-count heuristic misses).
 
**Principle:** distinctDocs is a *proxy* for synthesis complexity, not a truth. The router catches the common signature; the eval suite is the backstop that catches its misses; the disagreement is a monitored metric, not a tuned-away embarrassment. Costs you pay; risks you architect away; heuristics you measure.
 
---
 
## 021 — Cost records: one instrumentation, runId-keyed, priced from a single table
 
**Decision:** Every LLM call emits an `llm_call` event with `runId`, `model`, token counts (in/out/cache), `latency_ms`, and `cost_usd`. A `route` event per query carries the routing decision. One `runId` per `answer()` invocation threads every call — including the judge — so per-query cost aggregates correctly across a multi-turn agent loop.
 
**Pricing is a single source of truth** (`src/pricing.ts`): `costOf(model, usage)` is the only place cost is computed; the answerer, judge, and dashboard all call it. Unknown model → throws (a silently uncosted call corrupts every aggregate — 007 applied to money). Same provenance discipline as 009: consumers never recompute what the source can state.
 
**Field-name discipline learned the hard way:** an early `in: 0` bug (wrong field read, masked by `?? 0`) would have under-reported cost ~10× — input tokens dominate. `?? 0` belongs only on genuinely-nullable fields (cache tokens), never on fields that must exist. Fail-soft defaults hide real absences.
 
---
 
## 022 — Dashboard: pre-computed summary, client renders but never computes
 
**Decision:** A build-time aggregator (`dashboard/aggregate.ts`) reads `logs/events.jsonl`, groups by `runId`, joins each query's `route` + `llm_call` events, and emits a small `summary.json`. The Next.js page imports that JSON and renders — no parsing, no aggregation, no log access in the browser.
 
**Why not read the JSONL live from a route handler:** the client renders, it doesn't compute — same boundary discipline as the MCP server being a thin adapter (018) and the layered `search()` interface. Raw event processing is a server/build concern; shipping it to the browser couples presentation to storage format and re-does the work on every page load. For a static portfolio artifact the aggregator runs manually once; for a live system it's a cron every few hours. Either way the page is unchanged.
 
**Latest-run scoping:** `events.jsonl` accumulates across many eval runs; headline numbers must describe *current* behavior, not a mix of experiments. The aggregator summarizes only the final contiguous run (gap-based boundary), so "total cost" and "model split" mean one representative run.

---

## 023 — N-run majority voting for judge cases, after observed CI variance

**Observation:** A judge verdict flipped across identical CI runs — `hard-recurring-theme` went green → red → green with the same model (Sonnet, forced via `expectModel`), same answer shape, same criterion. The re-run that passed proved the failure was not the criterion being wrong and not the model being incapable: it was the judge itself being **non-deterministic**.

**Where it happens:** the flakiness clusters on criteria that assess *prominence* rather than *presence* — "must be clearly identified, not merely alluded to in passing." Presence is a near-deterministic check ("does the answer contain X?"); prominence is a judgment call ("does the answer emphasize X *enough*?"), and the judge lands on different sides of that line run to run. Deterministic checks (mode, retrieval, citations, tool constraints) never flaked; only the judge did, only on emphasis criteria.

**Decision:** Sample the judge `JUDGE_SAMPLES = 3` times per case and take the majority verdict. The returned `votes` field (e.g. "PASS 2/3") surfaces split decisions so a borderline case is visible rather than silently resolved. Calls are sequential to respect free-tier rate limits.

**Cost tradeoff, decided deliberately:** 3× cost and latency, but *only on judge-bearing cases* — the low-volume path. This is decision 013's asymmetry applied to the harness itself: spend up on the low-volume, high-stakes verdict; a few extra cents per eval run buys a gate that doesn't randomly block good PRs. A flaky gate is worse than a slightly more expensive one — teams learn to ignore gates that cry wolf.

**Alternatives considered:** (a) loosen the criterion to presence-only — rejected, because the criterion is corpus-accurate (both postmortems' Lessons sections state the machine-enforced-*expiry* theme explicitly) and weakening it to fix variance would trade a correct test for a flaky-but-lenient one; (b) temperature 0 on the judge — narrows variance but doesn't eliminate it (see the temperature discussion in the judge's history), and doesn't address the fundamental prominence-is-a-judgment-call issue. Majority voting addresses the variance directly.

**Meta-lesson (the real one):** writing evals repeatedly surfaced where criteria disagreed with the corpus (12-vs-18 minutes, TTL-vs-general-machine-enforcement) — each time, the corpus won and the criterion was corrected. This case was the inverse: the criterion was right, the corpus backed it, and the *judge* was the unreliable component. Distinguishing "criterion wrong" from "judge flaky" required a re-run to produce evidence rather than a guess to produce a patch. The eval suite doing its job means catching all three failure modes — corpus drift, over-strict criteria, and judge non-determinism — and treating them differently.