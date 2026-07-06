# Playbook — Prompt Evolution

The 4×2 grid: four queries run against prompt v1 and prompt v2, model `claude-haiku-4-5`, top-5 retrieval, same index. Outputs verbatim (2026-07-05).

The four queries and what each tests:

| Query | Tests |
|---|---|
| "money stuck in wallet" | Ambiguity — two distinct wallet issues match (withdrawal delays vs. balance not rendering) |
| "how do we prepare for big tournaments" | Multi-document synthesis within one topic |
| "why did the wallet page break in August" | Paraphrase retrieval + single-document faithfulness (doc says "2025-08-07", "failed to mount") |
| "what's our policy on database sharding?" | Refusal — nothing in the corpus answers it |

---

## Prompt v1

```
You are an agent that get context in <context> tag and answers only if you have sufficient information.
If you don't have sufficient answer, answer with I don't know
```

Covers refusal (roughly). No role, no citation requirement, no ambiguity handling.

### v1 — "money stuck in wallet"

> Based on the documentation, if users are reporting money stuck in their wallet, this typically relates to **withdrawal latency degradation**.
> Here are the key details:
> ## Symptoms to Look For
> - Delayed payouts beyond the advertised window
> - Users report money "stuck" or payouts pending
> - Support tickets tagged with `payout-delay`
> ## Alert Triggers
> - `withdrawal-p95-latency` alert
> - `withdrawal-success-rate` alert
> - Severity mapping:
>   - **SEV-3**: p95 > 30s for 15 min
>   - **SEV-2**: p95 > 120s OR success rate < 97%
> ## Possible Causes
> 1. **Partner degradation** — External payment partner (UPI rails or bank transfer) experiencing issues
> 2. **Ledger writer backlog** — Payout processing queue backed up
> 3. **Fraud-rule review surge** — Risk team reviewing transactions, causing delays
> ## Immediate Actions
> - **Escalate to**: Payments on-call (`payments-primary` PagerDuty)
> - **Risk/Fraud team**: `#risk-ops` (business hours) or `risk-oncall` (24/7)
> - **Important**: Post status-page notice + in-app banner immediately if user-visible, even at SEV-3 (silence during payouts is a major churn driver)
> **Note**: The documentation indicates this is a **client-side rendering issue** *separate* from actual money movement — the wallet service and BFF should be healthy even if the wallet UI shows an error.

**FAILURE — cross-document conflation.** The final Note is a fact from the version-skew postmortem (balance not *displaying*, Aug 2025) welded onto an answer about withdrawal latency, where it is false: withdrawal latency is precisely a money-movement problem. It steers real triage away from the payments stack, attributed to "the documentation". Retrieval was correct (both wallet narratives legitimately in context); generation merged two truths into a falsehood. No citations → error unverifiable. **This output is the anchor case for the faithfulness eval.**

### v1 — "how do we prepare for big tournaments"

> Based on the documentation, ArenaPlay prepares for big tournaments through a structured **forecast-driven capacity planning process**:
> ## Key Preparation Steps:
> 1. **Demand Forecasting** — Create predictions for peak traffic, including inputs from marketing spend and referral activity
> 2. **Pre-scaling** — Scale the matchmaking fleet **60 minutes before the tournament opens**, based on the demand forecast
> 3. **Warm Standby Pool** — Maintain pre-provisioned instances ready during festival windows as a buffer
> 4. **Load Testing** — Conduct quarterly load tests simulating spikes at **5x the last peak** to validate capacity
> 5. **Cross-Functional Checkpoints** — Hold mandatory planning sessions at T-4 weeks and T-1 week with capacity planning, Growth/Marketing, and tournament ops to:
>    - Reconcile demand forecasts with current marketing plans
>    - Catch any changes in marketing spend that could affect predictions
>    - Validate payout mechanics for abuse risks
> 6. **Pre-Event Checklist** — Complete:
>    - Demand forecast with marketing/referral inputs
>    - Pre-scaling plan
>    - Load-test evidence at forecast-plus-contingency
>    - Risk review for payout-adjacent mechanics
> 7. **War Room Staffing** — During the event, staff a tournament war room with tournament ops lead, engineers, and on-calls for critical systems
> This replaces the older reactive autoscaling approach with **proactive, scheduled preparation** since tournament dates are known months in advance.

Accurate multi-document synthesis (capacity-planning doc + Diwali postmortem action items + incident-management doc). Zero citations; closing line is editorial summary — traceable to docs but unattributed.

### v1 — "why did the wallet page break in August"

> Based on the documentation, the wallet page broke on August 7, 2025 (14:20–15:35 IST) due to a **version-skew issue in the micro-frontend federation setup**.
> Here's what happened:
> 1. **Root cause**: A wallet micro-frontend deploy shipped against a newer version of the design-system than what the production shell was providing as a shared singleton dependency.
> 2. **Who was affected**: Users who had cached shell bundles from before the deploy. When they tried to use the wallet, the newer wallet remote was incompatible with their older shell version, causing the wallet section to fail to mount.
> 3. **The impact**: About 35% of web users experienced an error boundary rendering in the wallet section for roughly 75 minutes. However, no actual money movement was affected—the failure was purely a client-side rendering problem.
> 4. **Why it wasn't caught earlier**: The canary deployment (5% of traffic for 15 minutes) passed because canary users predominantly had fresh shell bundles, which masked the incompatibility with older cached versions.
> The issue was resolved by rolling back the wallet remote via a manifest repoint at 14:57 IST.

Faithful single-document answer. Note the query→doc bridge: "August" matched "2025-08-07", "break" matched "failed to mount" — the same semantic machinery that powers retrieval, working at generation. Zero citations.

### v1 — "what's our policy on database sharding?"

> I don't know. The provided documentation doesn't contain information about database sharding policies. The excerpts cover topics like GraphQL BFF architecture, PSP payout routing, server-rendered page caching, and game session disconnection handling, but none of them address database sharding strategies or policies.

Refusal works. Observation: retrieval never refuses — it returned the top-5 *closest* chunks regardless; the refusal burden sits entirely on generation.

---

## Prompt v2

```
<role>
You are Playbook, an ops copilot for ArenaPlay engineers. You answer questions
using only the documentation excerpts provided in the <context> tag.
</role>
<instructions>
- Every factual claim must be immediately followed by the supporting chunk id
  in square brackets, e.g. [postmortem-2025-wallet-mfe-version-skew#summary]
- If the excerpts don't cover the question, say the documentation doesn't
  cover it. No general-knowledge fallback.
- If the excerpts only partially answer the question, answer what is covered
  and explicitly state what is not.
- If excerpts describe multiple distinct issues matching the question, present
  them separately with their sources instead of merging them.
</instructions>
```

Changes from v1: role framing; mandatory per-claim citations with literal format example; sharpened refusal (no general-knowledge fallback); partial-coverage rule; ambiguity rule (motivated directly by the v1 wallet conflation).

### v2 — "money stuck in wallet"

> Based on the documentation, "money stuck in wallet" typically refers to **withdrawal payout delays**, which is ArenaPlay's most trust-sensitive flow [runbook-wallet-withdrawal-latency#background].
> ## Key symptoms to watch for:
> - Alert: `withdrawal-p95-latency` or `withdrawal-success-rate` [runbook-wallet-withdrawal-latency#background]
> - Support ticket spike tagged `payout-delay` [runbook-wallet-withdrawal-latency#background]
> - Users report money "stuck" or payouts pending beyond the advertised window [runbook-wallet-withdrawal-latency#background]
> ## Severity thresholds:
> - **SEV-3:** Withdrawal p95 > 30s for 15 min
> - **SEV-2:** p95 > 120s **or** success rate < 97% [runbook-wallet-withdrawal-latency#intro]
> ## Critical communication note:
> Withdrawal incidents require **proactive comms earlier than other SEVs** — post to status page + in-app banner at SEV-3 if user-visible. Silence during payout delays is the single largest driver of churn-correlated support contacts [runbook-wallet-withdrawal-latency#mitigation].
> **Note:** The documentation also covers a separate 2025 incident where the wallet section failed to render entirely due to a frontend version mismatch [postmortem-2025-wallet-mfe-version-skew#summary], but that was a client-side rendering issue with no actual money movement impact.
> Do you need escalation contacts or mitigation steps for a specific scenario?

**FIXED.** Same two documents in context, same model — the conflation repaired into the ideal behavior: the skew incident presented as "a separate 2025 incident", correctly cited, correctly scoped, plus an unprompted disambiguating question back to the user. Claim-level citation granularity (`#background`, `#intro`, `#mitigation`).

### v2 — "how do we prepare for big tournaments"

> # Preparing for Big Tournaments at ArenaPlay
> ArenaPlay uses a forecast-driven capacity planning process to prepare for scheduled peak events like festivals, replacing reactive autoscaling that historically caused incidents [ops-festival-capacity-planning#why-this-process-exists].
> ## Key Preparation Steps
> **Demand Forecasting & Pre-Scaling:**
> The matchmaking fleet is pre-scaled to forecast peak 60 minutes before lobby open, using a demand model that includes marketing spend and referral inputs [postmortem-2025-diwali-matchmaking-surge#action-items]. Additional pre-provisioned instances are held ready during festival windows as a warm standby pool [postmortem-2025-diwali-matchmaking-surge#action-items].
> **Pre-Event Checklist:**
> Owning teams must complete: demand forecast (including marketing/referral inputs), pre-scaling plan, load-test evidence at forecast-plus-contingency, and risk review for any payout-adjacent mechanics [ops-incident-management-severities#capacity-calendar].
> **Cross-Functional Planning:**
> Mandatory joint sessions between capacity planning, Growth/marketing, and tournament ops occur at T-4 weeks and T-1 week to reconcile demand forecasts with current marketing plans — changes in marketing spend after forecast submission were a root cause of the Diwali incident [ops-festival-capacity-planning#cross-functional-checkpoint].
> **Load Testing:**
> Quarterly load tests of lobby-open spikes at 5x the last peak occur [postmortem-2025-diwali-matchmaking-surge#action-items].
> ## During the Event
> A tournament war room is staffed with tournament ops lead, an IC-trained engineer, and on-calls for critical services, with elevated severity evaluation [ops-festival-capacity-planning#during-the-event].

No regression; substance preserved; correct attribution across three documents.

### v2 — "why did the wallet page break in August"

> The wallet page broke in August because of a **version-skew mismatch in the micro-frontend federation setup** [postmortem-2025-wallet-mfe-version-skew#summary].
> Specifically: a wallet micro-frontend deploy shipped against a newer version of the design-system than what the production shell was providing as a shared singleton. Users who had cached older shell bundles received a wallet remote that failed to mount, causing the wallet section to render an error boundary [postmortem-2025-wallet-mfe-version-skew#summary].
> The outage lasted roughly 75 minutes (14:20–15:35 IST on August 7, 2025) and affected approximately 35% of web users [postmortem-2025-wallet-mfe-version-skew#summary]. Importantly, no actual money movement was affected—the failure was purely on the client-side rendering layer; the BFF and wallet services remained healthy [postmortem-2025-wallet-mfe-version-skew#summary].
> The canary deploy had passed because canary users predominantly had fresh shell bundles, which masked the skew problem [postmortem-2025-wallet-mfe-version-skew#timeline-ist]. The fix was to roll back the wallet remote via manifest repoint rather than force-refresh all shells [postmortem-2025-wallet-mfe-version-skew#timeline-ist].

No regression. Per-claim provenance tracking: incident facts cite `#summary`; canary-masking and rollback decision cite `#timeline-ist` — genuinely where those facts live.

### v2 — "what's our policy on database sharding?"

> The documentation provided doesn't cover database sharding policy. The excerpts focus on architectural decisions around the BFF layer, caching strategies, PSP routing, and game session operations, but don't address sharding approaches or policies.
> To answer your question, you'd need to check documentation on data storage architecture, scalability decisions, or operational runbooks specific to database infrastructure.

Refusal held; no general-knowledge leak; became *informative* (points at where such docs would live). Watch-item for the eval suite: refusals must not name specific documents unless they appear in context — "check the sharding runbook" would be a citation-adjacent hallucination. Not observed, but adjacent.

---

## Scorecard

| Axis | v1 | v2 |
|---|---|---|
| Citations | 0/4 answers | 4/4, claim-level granularity |
| Cross-document conflation | 1 observed (wallet) | Repaired into explicit disambiguation |
| Refusal | Clean | Clean + informative |
| Substance on correct answers | Good | Preserved, no regressions |
| General-knowledge leakage | Editorial garnish (borderline) | None observed |

## Eval seeds extracted from this grid

1. **Faithfulness / conflation regression:** "money stuck in wallet" — answer must not attribute the client-side-rendering fact to the withdrawal issue; if both issues appear, they must be presented as distinct, each cited to its own doc.
2. **Retrieval ground truth:** "why did the wallet page break in August" must retrieve `postmortem-2025-wallet-mfe-version-skew#summary` in top-k.
3. **Citation presence:** every non-refusal answer contains ≥1 `[chunk-id]` bracket, and every bracketed id exists in the retrieved set.
4. **Refusal:** "what's our policy on database sharding?" must refuse, must not answer from general knowledge, must not name specific documents absent from context.