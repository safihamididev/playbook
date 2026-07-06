# Postmortem: Coordinated Multi-Account Bonus Abuse Spike

**Date of incident:** 2025-03-14 → 2025-03-21 (detection lag included)
**Severity:** SEV-2 (financial), no availability impact
**Status:** Resolved. Action items complete.
**Author:** Risk Engineering, with Web Platform

## Summary

A coordinated operation created an estimated 40k+ synthetic accounts over one week to farm the new-user deposit bonus, funneling winnings to a small set of withdrawal accounts through deliberate losses in head-to-head games. Estimated exposure before containment: a mid-seven-figure INR amount in bonus payouts, of which the majority was frozen before withdrawal. Detection lag was ~5 days — the fraud ran under existing rule thresholds by design.

## Timeline

- **03-14 → 03-18** — Account creation and bonus farming proceeds under thresholds: registrations spread across device fingerprints, IP ranges, and time-of-day patterns tuned to look organic.
- **03-19** — Finance's weekly bonus-cost reconciliation flags bonus payout running 2.7x forecast. Escalated to Risk.
- **03-19 (eve)** — Risk analyst review identifies the collusion pattern: statistically improbable loss chains in head-to-head games terminating at a small set of accounts.
- **03-20** — Withdrawal freeze applied to the identified account cluster. Graph analysis (shared payment instruments, device fingerprint reuse below rule thresholds, referral chains) expands the cluster to ~40k accounts.
- **03-21** — Bonus rules hotfixed: bonus winnings became withdrawable only after wagering-velocity and network checks. Incident contained.

## Root Cause

1. **Rules evaluated accounts individually; the attack was collective.** Every account passed per-account checks. The signal existed only at the graph level — shared instruments, referral topology, loss-chain patterns — which nothing evaluated in real time.
2. **Bonus product design shipped without a risk review.** The deposit-bonus mechanic went live via the growth team's normal release process; Risk saw it after launch. The abuse economics (bonus > minimum wagering friction) were identifiable on paper.
3. **Detection came from Finance, not Risk systems** — a weekly batch reconciliation, hence the 5-day lag.

## What Went Well

- Withdrawal-side controls held: the freeze landed before most exposure was withdrawn, validating the "never loosen withdrawal-side rules" guardrail (see fraud false-positive runbook).
- Graph analysis tooling, though offline, expanded the cluster quickly once pointed at the pattern.

## What Went Poorly

- 5-day detection lag for an attack that was, in retrospect, visible in daily bonus-cost telemetry.
- No pre-launch risk review gate for growth mechanics with direct payout economics.

## Action Items

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Real-time graph-based scoring for account clusters (shared instruments, device reuse, referral topology) added to the risk engine | Risk Eng | Done |
| 2 | Bonus-cost anomaly detection moved from weekly Finance batch to daily automated alert with forecast bands | Risk Eng + Finance | Done |
| 3 | Mandatory risk review gate for any growth mechanic involving payouts or bonuses, added to the launch checklist | EM (process) | Done |
| 4 | Client SDK signal hardening: device fingerprint entropy improvements from Web Platform | Web Platform | Done |

## Lessons

This incident, together with the graph-scoring work it triggered, anchored the fraud program's next phase — the combined rule + graph approach is credited with the bulk of the ~40% reduction in confirmed fraud loss measured over the following year. The organizational lesson outweighs the technical one: fraud economics are a launch-review concern, not a post-launch cleanup concern.
