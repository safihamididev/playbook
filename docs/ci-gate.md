# The CI Gate: Eval-Blocked Prompt Releases

Playbook's system prompt cannot change without passing the eval suite. This
document explains the gate, and shows it working — including a deliberate
sabotage test where CI blocked a prompt regression.

## Why gate prompts at all

Prompts are code: they carry load-bearing behavior, they get refactored, and
they degrade through copy-paste like any code — but nothing typechecks them.
This project learned that empirically: **the instruction that fixed our worst
observed hallucination (the wallet conflation, see
[prompt-evolution.md](prompt-evolution.md)) was accidentally dropped during a
routine refactor within days of being added.** Nothing caught it, because the
thing that would catch it was the eval harness being built at the time.

The conclusion, consistent with a recurring theme in this project's decision
log: conventions decay; guardrails must be machine-enforced.

## How the gate works

```
PR opened/updated ──► GitHub Actions runs `npm run eval`
                          │
                          ├─ Deterministic tier (facts, cheap, offline):
                          │    mode: refusal marker matches expectation
                          │    retrieval: required chunk ids in top-k
                          │    citations-present: ≥1 [chunk-id] per answer
                          │    citations-grounded: no fabricated citations
                          │
                          ├─ Judge tier (LLM-as-judge, Sonnet, narrow criteria):
                          │    conflation regression, refusal cleanliness
                          │
                          └─ exit code 0/1 ──► required status check on main
                                               (ruleset: no merge on red,
                                                no bypass, no force push)
```

Design properties that make this practical:

- **Offline retrieval:** `embeddings.json` and the query-embedding cache are
  committed, so the retrieval layer runs in CI with zero Voyage API calls.
- **Checkable outputs by contract:** refusals must start with `NOT_IN_DOCS:`;
  judge verdicts must start with `VERDICT: PASS|FAIL`. When a property is hard
  to check, we make the output more checkable rather than the checker smarter.
- **Two tiers, deliberately separate:** deterministic checks are facts and
  carry the structural load; the LLM judge (a different, stronger model than
  the answerer, to avoid self-preference bias) is used only where code can't
  reach, with narrow, specific criteria.
- **The gate is the exit code.** The runner exits non-zero on any failure;
  CI's entire integration is that contract.

## The sabotage test

To verify the gate end-to-end, we opened a PR that deliberately deleted the
system prompt's entire `<instructions>` block — a superset of the real
regression that motivated the harness.

Result: **4 of 14 checks failed, merge blocked.**

```
Running: retrieval-august-skew — "why did the wallet page break in August"
  ✓ retrieval-august-skew / mode
  ✓ retrieval-august-skew / retrieval
  ✗ retrieval-august-skew / citations-present
      no [chunk-id] citations found in answer
  ✓ retrieval-august-skew / citations-grounded
Running: refusal-sharding — "what's our policy on database sharding?"
  ✗ refusal-sharding / mode
      expected refusal, got answer
  ✓ refusal-sharding / judge
Running: conflation-wallet — "money stuck in wallet"
  ✓ conflation-wallet / mode
  ✗ conflation-wallet / citations-present
      no [chunk-id] citations found in answer
  ✓ conflation-wallet / citations-grounded
  ✓ conflation-wallet / judge
Running: tournament-synthesis — "how do we prepare for big tournaments"
  ✓ tournament-synthesis / mode
  ✓ tournament-synthesis / retrieval
  ✗ tournament-synthesis / citations-present
      no [chunk-id] citations found in answer
  ✓ citations-grounded
10/14 checks passed — 4 FAILED
```

<!-- TODO: add screenshots
![Blocked PR](./img/sabotage-pr-blocked.png)
![Red eval check](./img/sabotage-eval-red.png)
-->

### Reading the failure like a diagnosis

The report is a differential diagnosis of exactly what the deleted
instructions were carrying:

- **Citations died everywhere** (3× `citations-present`): the citation
  instruction was load-bearing; without it the model stops citing entirely.
- **Refusal broke** (`refusal-sharding / mode`): with the refusal rule and the
  `NOT_IN_DOCS:` marker gone, the model answers the uncovered question instead
  of refusing. Caught deterministically — no judge required.

### What the passes teach (the honest part)

Two green checks in that output are more instructive than the reds:

- **`citations-grounded` passed vacuously** — zero citations means zero
  fabricated citations. The two citation checks measure different failures by
  design ("stopped citing" vs. "invented a source"), but a vacuous pass
  shouldn't flatter the summary line. Improvement noted: mark grounded as
  skipped when no citations exist.
- **`refusal-sharding / judge` passed while the case failed** — the judge's
  criterion ("don't name documents absent from context") was narrowly
  satisfied by an answer that shouldn't exist at all. This is the architecture
  working as intended: the deterministic *mode* check owned that failure. It
  is also the demonstration of why judges get narrow criteria and never carry
  structural load alone.
- **The conflation judge passed without the ambiguity rule** — confirming the
  original conflation is a tendency, not a certainty. Single-run judge cases
  have variance; the hardening path is N-run sampling for judge-dependent
  cases, adopted if flakiness is ever observed in practice.

The sabotage PR was closed unmerged. The gate holds.

## Operating rules going forward

- Every change to `main` goes through a PR; the `eval` status check is
  required, with no bypass list and force-pushes blocked.
- Prompt changes bump the prompt version and add a changelog entry.
- Every observed production/manual failure becomes an eval case before (or
  alongside) its fix — the suite only grows.