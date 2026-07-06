# ADR-018: Dual-PSP Payout Routing with Health-Based Failover

**Status:** Accepted (2025-04)
**Deciders:** Payments Platform Lead, Web Platform EM, Finance Ops
**Technical area:** Withdrawal/payout orchestration

## Context

Withdrawals originally routed through a single payment service provider (PSP) for UPI payouts. PSP-side degradations — which we neither control nor get advance notice of — directly produced our most trust-damaging incident class: delayed payouts. Postmortem review across two quarters showed the majority of SEV-2 withdrawal incidents traced to single-PSP dependency.

## Decision

Integrate a second UPI PSP and route payouts through an orchestrator with **health-based weighted routing**: per-PSP success rate and latency computed over a sliding window; routing weights shift automatically when a PSP degrades past thresholds; manual override available (see wallet withdrawal runbook, step 2).

Reconciliation treats PSP identity as an attribute of the payout attempt, so a payout failed on PSP-A and retried on PSP-B remains one logical withdrawal in the ledger — double-payout prevention lives in the orchestrator's idempotency layer, not in the PSPs.

## Alternatives Considered

**1. Single PSP + tighter SLA contract.**
Cheaper and simpler, but an SLA is a refund mechanism, not an availability mechanism — users experience the outage regardless of penalty clauses. Rejected because the cost of withdrawal incidents is trust, which SLA credits don't repair.

**2. Active-passive failover (secondary PSP only on primary failure).**
Simpler routing, but a cold secondary is unproven exactly when needed: integration drift, untested volume limits, stale credentials. Rejected in favor of always-warm weighted routing where the secondary continuously handles a minority share (10–20%), keeping the path production-proven.

**3. Three or more PSPs.**
Deferred. Each PSP adds reconciliation, compliance, and contract overhead; two proved sufficient for the observed failure independence.

## Objections Raised

- **"Split volume weakens our pricing tier with the primary PSP."** Finance modeled it: the pricing delta was smaller than the modeled cost of one SEV-1 withdrawal incident per quarter (support load + churn effect on affected cohorts). Decision made on that comparison, documented here deliberately as a cost-vs-trust tradeoff.
- **"Health-based routing can flap."** Mitigation: hysteresis in weight shifts (degrade fast, recover slowly) and a manual-override console for on-call, which the wallet runbook operationalizes.

## Consequences

- Single-PSP degradations no longer produce user-visible withdrawal incidents (weight shifts absorb them); SEV-2 withdrawal incident rate dropped in the following two quarters.
- Reconciliation complexity increased; idempotency layer became critical-path code with its own test suite.
- Ongoing cost: second PSP contract + continuous minority routing.

## Follow-ups

- Quarterly failover drill: force weights to 100% secondary for one hour under supervision, verifying the warm path at meaningful volume.
