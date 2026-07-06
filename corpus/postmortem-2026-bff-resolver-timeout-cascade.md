# Postmortem: BFF Resolver Timeout Cascade — Lobby Page Degradation

**Date of incident:** 2026-01-22, 20:05–20:50 IST
**Severity:** SEV-2
**Status:** Resolved. Action items complete.
**Author:** Web Platform

## Summary

A latency degradation in the recommendations service cascaded into platform-wide lobby-page slowness despite the BFF's partial-data design. Root cause was a misconfigured resolver: the recommendations field on the lobby query had a 10-second timeout instead of the 800ms standard, and the lobby page's server render awaited the full query. Lobby p90 rose from ~4s to ~11s for 45 minutes during peak evening traffic. No errors — everything eventually succeeded — which delayed detection because error-rate alerts stayed green while latency burned.

## Timeline (IST)

- **19:55** — Recommendations service p99 begins climbing (a model-serving node issue, their incident).
- **20:05** — Lobby page p90 breaches 8s. Latency alert fires; error rates normal everywhere.
- **20:12** — On-call initially suspects render fleet or cache regression (ADR-014 tiers); cache-hit ratios check out healthy.
- **20:20** — BFF resolver-level latency panel shows the recommendations field p99 at ~10s — pinned at its timeout. Timeout misconfiguration identified: 10000ms literal in the resolver config, standard is 800ms.
- **20:26** — Two-part mitigation: resolver timeout corrected to 800ms via config deploy, and the lobby recommendations section switched to its fallback (popular-games list) via feature flag while recommendations recovered.
- **20:50** — Lobby p90 back under 4.5s. SEV closed. Recommendations service recovered independently ~21:30.

## Root Cause

1. **Non-standard resolver timeout.** The 800ms per-resolver budget (ADR-009 discipline) was policy enforced by code review, not by tooling. The recommendations resolver had shipped months earlier with 10s "temporarily" during an integration debug; the TODO to restore it was never actioned.
2. **Server rendering awaited a non-critical field.** RSC streaming (ADR-014) was designed for exactly this — personal/slow segments stream after the shell — but the lobby recommendations section had been implemented inside the awaited segment rather than a streamed boundary. Two independent safeguards were each configured out of their intended state.
3. **Alerting was error-biased.** Slow-but-successful is a failure mode our lobby alerts underweighted; 10 minutes of the incident predates the first page.

## What Went Well

- Resolver-level latency panels made the diagnosis fast once suspicion landed on the BFF.
- The feature-flag fallback for recommendations existed and shipped in minutes (ADR-016 operational-lever pattern).

## What Went Poorly

- A "temporary" configuration survived months because nothing expired it — the same lesson as the wallet-skew override incident, in configuration form.
- A design intention (streamed boundary for slow segments) silently didn't match implementation, and no test asserted it.

## Action Items

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Resolver timeout budgets moved from convention to schema-level enforcement: budgets declared per field, CI fails on undeclared or out-of-policy timeouts | Web Platform | Done |
| 2 | Render-boundary contract test: fields marked non-critical in the schema must resolve inside streamed boundaries; CI asserts the mapping | Web Platform | Done |
| 3 | Latency-based SLO burn alerts added for funnel pages alongside error-rate alerts | Web Platform | Done |
| 4 | Sweep of all resolver configs for non-standard timeouts (found 3 more) | Web Platform | Done |

## Lessons

Both safeguards that should have contained this incident existed on paper. The recurring platform lesson — from the CI-override skew incident to this one — is that **conventions and temporary states must be machine-enforced with expiry, because review-time discipline decays while configuration persists.**
