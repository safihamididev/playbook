# Runbook: Fraud Detection False-Positive Spike

**Service:** Risk / Fraud Detection
**Owner:** Risk Engineering (with Web Platform for client-side signals)
**Severity mapping:** Manual-review rate > 2x 7-day baseline = SEV-3; legitimate-user block rate confirmed rising = SEV-2
**Last reviewed:** 2025-11

## Background

ArenaPlay's fraud system scores account creation, deposits, gameplay patterns (collusion/multi-accounting), and withdrawals. The 2024–2025 fraud program reduced confirmed fraud loss by ~40%, but the operating constraint is precision: every false positive is a legitimate user blocked from their money or their game, which is a trust incident, not just a support ticket.

Device fingerprinting and behavioral signals are collected client-side by the web platform SDK; scoring happens server-side in the risk engine.

## Symptoms

- Manual review queue depth alert (`risk/review-queue-depth`)
- Support tickets tagged `account-blocked` or `kyc-reverification` spiking
- Withdrawal latency runbook step 4 escalated to this runbook
- Social listening flags coordinated complaints about blocks

## Triage Order

1. **Was a rule or model version deployed in the last 24h?** Check the risk-engine deploy log. Rule changes are the leading cause of false-positive spikes. If yes, compare block-rate by rule ID against baseline; the offending rule usually stands out immediately.
2. **Did a client release change signal collection?** A web or app release that breaks/alters device fingerprint or behavioral signal capture can silently degrade model inputs, shifting scores for entire device cohorts. Correlate spike start with client release timeline; check signal null-rates by app version.
3. **Is a legitimate traffic pattern being misread?** Festival events produce fraud-like patterns at scale: many new accounts, shared payment instruments within families, bursts from the same region. Check whether the spike correlates with a scheduled event on the capacity calendar.
4. **Is it actually fraud?** Confirm with Risk analysts before assuming false positives — a real attack also raises review volume. Sample 20 queue items with an analyst before any threshold change.

## Mitigation

- **Bad rule deploy:** roll back the rule version (rules are versioned and independently revertible; model versions require Risk sign-off to revert).
- **Client signal regression:** risk engine has a per-version signal-trust flag — degrade affected app versions to reduced-signal scoring rather than letting broken signals drive decisions. File a P0 against the client team.
- **Event-driven pattern:** apply the pre-approved festival leniency profile (raises review thresholds for deposit-side rules only; withdrawal-side rules never loosened without Risk director approval).
- Always: unblock-and-apologize workflow for confirmed false positives runs from the review queue in bulk; support gets the `fp-apology` template.

## Guardrails

Never disable a withdrawal-side fraud rule to relieve queue pressure. Accepting slower payouts is always preferable to accepting fraudulent payouts.

## Escalation

- Risk on-call: PagerDuty `risk-oncall`
- Web Platform (signal SDK): `#web-platform`
- Risk director approval required for: model rollback, withdrawal-rule changes
