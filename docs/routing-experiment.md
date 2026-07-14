# The Routing Experiment: Deciding Model Selection with Data

Phase 4 asks an EM-shaped question: **is the frontier model worth its price for
this workload, and can I prove it?** Rather than assume "harder queries need
the bigger model," Playbook ran the experiment.

## Setup

The answerer model was made configurable (`PLAYBOOK_MODEL`), so the entire eval
suite could run twice — once fully on Haiku, once fully on Sonnet — over
identical cases. Six **hard** cases were added specifically to strain a smaller
model: multi-document synthesis and argued judgment anchored to specific ADRs
and postmortems (e.g. "what recurring lesson connects the wallet-skew outage
and the BFF cascade?", "should we add a third PSP — argue from our own ADRs?").
Each hard case's judge criterion names the specific corpus fact a complete
answer must contain, so the judge grades against ground truth, not vibes.

## Result

Across the six hard cases, Sonnet won **exactly one** — on a fine
synthesis-precision distinction (naming the "machine-enforced expiry" theme
explicitly where Haiku only gestured at it). Every operational query — the
actual traffic shape — matched on Haiku.

| | Haiku | Sonnet |
|---|---|---|
| Baseline cases | pass | pass |
| Hard cases | all but one | all |
| Price (per MTok) | $1 in / $5 out | $3 in / $15 out |
| **Relative cost** | **1×** | **~3.6×** |
| Relative latency | 1× | ~2–4× |

**Finding:** for this workload the premium model was a solution looking for a
problem. A near-null result is the strongest possible evidence *for* the cheaper
model — especially since the judge runs on Sonnet and exhibits mild
self-preference bias, tilting the deck slightly *toward* finding Sonnet better.
The null survives that tilt.

## The decision: Haiku-default, escalate rarely, and never assume the router is right

Playbook routes on **retrieval signals it already computes** — no classifier LLM
call, no added latency. Chunks spanning several distinct documents at a strong
top score are the multi-document-synthesis signature; those escalate to Sonnet,
everything else stays on Haiku. The routing reason is logged and shown on the
dashboard — routing you can read.

The honest part: **12 eval points can't calibrate a threshold without
overfitting.** So the eval suite *encodes* which queries genuinely need which
model (`expectModel`), forcing that model at eval time — this is the routing
**ground truth**. The router is a cheap *approximation* of those labels. Where
they disagree, a soft `router-agreement` check surfaces it (⚠, non-gating): the
heuristic is allowed to be wrong; it is not allowed to be wrong silently.

distinctDocs is a proxy for synthesis complexity, not a truth. The router
catches the common signature; the eval suite is the backstop that catches its
misses; the disagreement is a monitored metric, not a tuned-away embarrassment.

## Reading the dashboard numbers

On the synthesis-weighted eval set the escalation rate looks high (~33%) because
half the cases are deliberately hard. On representative ops traffic — mostly
single-topic lookups and how-tos that retrieve from one dominant document — the
rate is far lower, because the router's escalation signal (multi-doc + strong
score) rarely fires. The eval set is a stress test, not a traffic model; the
dashboard states this so the number isn't misread.

## What this demonstrates

Not "I built a router." Rather: **I ran the experiment that told me the router
was mostly unnecessary, kept it anyway as a cheap and honest heuristic, encoded
the real answer in the eval suite, and surfaced the heuristic's error rate as a
monitored metric rather than tuning it until green.** The cost data defends
every choice.