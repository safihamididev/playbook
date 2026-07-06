# Postmortem: Wallet MFE Version-Skew Outage

**Date of incident:** 2025-08-07, 14:20–15:35 IST
**Severity:** SEV-2
**Status:** Resolved. Action items complete.
**Author:** Web Platform

## Summary

A deploy of the wallet micro-frontend shipped against a design-system version newer than what the production shell provided as a federation shared singleton. Users holding cached shell bundles received a wallet remote that failed to mount — the wallet section of the app rendered an error boundary for roughly 35% of web users over 75 minutes. No money movement was affected (BFF and wallet services healthy); the failure was purely client-side rendering. Support volume spiked with "can't see my balance" reports, which triaged initially — and wrongly — toward the wallet service.

## Timeline (IST)

- **14:20** — Wallet MFE deploy completes. Canary (5% / 15 min) passes: canary users predominantly had fresh shells, masking the skew.
- **14:31** — Error-rate alert fires for wallet routes. Pattern: errors concentrated in sessions with older shell bundle versions.
- **14:38** — Payments on-call engaged first due to symptom shape ("balance not visible"); 12 minutes spent on wallet-service triage before error metadata pointed client-side.
- **14:50** — Web Platform on-call identifies federation shared-scope mismatch from the error signature. Decision: roll back the wallet remote rather than force-refresh shells.
- **14:57** — Remote rolled back via manifest repoint; targeted CDN purge of the remote manifest issued (per bad-deploy runbook).
- **15:35** — Error rate at baseline as cached sessions re-navigate. SEV closed.

## Root Cause

The CI contract check that blocks a remote requiring shared-dependency versions beyond the production shell (the ADR-007 guardrail) **was overridden** for this deploy. The override existed for a legitimate-seeming reason: the shell upgrade carrying the new design-system version was scheduled to deploy the same afternoon, and the wallet team sequenced their deploy assuming the shell would land first. The shell deploy was delayed by an unrelated test flake; the wallet deploy proceeded on the stale assumption. The override was approved but the approval didn't re-verify the sequencing dependency at deploy time.

Contributing factor: canary sampling didn't stratify by shell bundle version, so the exact at-risk population (stale shells) was underrepresented during canary.

## What Went Well

- Remote-level rollback worked exactly as designed (ADR-007 / bad-deploy runbook): recovery required no full-client deploy.
- Error metadata included shell bundle version, which shortened diagnosis once the right team was looking.

## What Went Poorly

- A guardrail override defeated the guardrail — process, not tooling, failed.
- 18 minutes lost to misrouted triage (payments vs. web platform) because the symptom read as a service issue.

## Action Items

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Overrides of the federation contract check now expire in 4 hours and re-verify the declared dependency (e.g., "shell ≥ vX in production") automatically at deploy time — deploy blocks if the dependency still unmet | Web Platform | Done |
| 2 | Canary population stratified by shell bundle version; skew-sensitive deploys require canary pass in the stale-shell stratum | Web Platform | Done |
| 3 | Alert routing: client-side error signatures on wallet routes page Web Platform first, with payments as secondary | Web Platform + Payments | Done |

## Lessons

The MFE architecture converted what would once have been a full-client outage into a single-remote incident with a 7-minute rollback — the ADR-007 tradeoff working as intended. But the incident is a clean example of a second-order rule: **any guardrail that can be overridden will eventually be overridden under schedule pressure; overrides must therefore carry their assumptions as machine-checked conditions, not comments.**
