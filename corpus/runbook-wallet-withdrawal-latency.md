# Runbook: Wallet Withdrawal Latency Degradation

**Service:** Wallet / Payments
**Owner:** Payments Platform Team
**Severity mapping:** Withdrawal p95 > 30s for 15 min = SEV-3; > 120s or success rate < 97% = SEV-2
**Last reviewed:** 2026-01

## Background

Withdrawals are ArenaPlay's most trust-sensitive flow: a delayed payout generates support tickets and social media complaints at roughly 8x the rate of any other degraded feature. The withdrawal path: web/app client → BFF (GraphQL) → wallet service → payout orchestrator → external payment partners (UPI rails via two PSP integrations, bank transfer via a third).

## Symptoms

- Alert: `withdrawal-p95-latency` or `withdrawal-success-rate`
- Support ticket spike tagged `payout-delay`
- Users report money "stuck" or payouts pending beyond the advertised window

## Triage Order

1. **Partner or us?** Check the PSP status dashboards and our per-partner success-rate panels first. The majority of withdrawal incidents are external partner degradation, not ArenaPlay systems.
2. **If a single PSP is degraded:** confirm the payout orchestrator's health-based routing has shifted traffic to the healthy PSP. If automatic failover hasn't triggered (health check flapping), force the routing weight manually via the orchestrator admin console. See ADR-018 for the dual-PSP design rationale.
3. **If both PSPs healthy:** check wallet service queue depth. A backlog in the reconciliation ledger writer will delay withdrawal confirmation even when the money has moved. Ledger writer lag panel: `wallet/ledger-write-lag`.
4. **Check for a fraud-rule deployment.** New or tightened fraud rules can route an abnormal share of withdrawals to manual review, which users experience as latency. Compare the manual-review rate against the 7-day baseline. If elevated, engage Risk team — do not disable rules unilaterally.
5. **Check BFF timeout config** if errors are client-visible but wallet-side metrics look healthy: a GraphQL resolver timeout shorter than current partner latency surfaces as failure to the client even when the payout eventually succeeds.

## Mitigation

- Partner degradation with failover working: no action beyond monitoring; post a status-page notice if p95 remains elevated > 30 min.
- Ledger writer backlog: scale writer consumers; if lag > 10 min, enable the "payout initiated" interim push notification so users see progress instead of silence.
- Fraud-rule review surge: Risk team tunes thresholds; comms template `payout-under-review` available for support.

## Communication

Withdrawal incidents require proactive comms earlier than other SEVs: status page + in-app banner at SEV-3 if user-visible, not just SEV-2. Silence during payout delays is the single largest driver of churn-correlated support contacts.

## Escalation

- Payments on-call: PagerDuty `payments-primary`
- Risk/Fraud team: `#risk-ops` (business hours), PagerDuty `risk-oncall` (24/7)
- PSP escalation contacts: see `payments/partner-contacts` (internal wiki)
