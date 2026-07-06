# Web Platform On-Call Handbook

**Owner:** Web Platform Team
**Audience:** Engineers joining the web-platform on-call rotation
**Last reviewed:** 2026-03

## Scope of This Rotation

Web platform on-call covers: the micro-frontend shell and federation contracts, the Node.js BFF (GraphQL), the asset pipeline, CDN configuration (as part of the CDN Guild rotation), and client-side signal SDKs (fraud fingerprinting, analytics). It does **not** cover domain services (wallet, matchmaking, risk engine) — but web symptoms frequently originate there, so half of this job is correct routing.

## The Routing Problem (read this first)

Client-visible symptoms are ambiguous. The wallet MFE version-skew incident cost 18 minutes to misrouted triage because "balance not visible" reads like a payments problem. Routing heuristics:

- **Error metadata is authoritative, symptoms are not.** Client errors carry remote name, shell bundle version, and app version. Errors scoped to one MFE remote or correlating with shell version = ours. Errors spanning all remotes on one API operation = likely BFF (ours) or the domain service behind it.
- **GraphQL partial-data responses:** if the page renders but a section shows fallback UI, check the BFF resolver error rate for that field before paging a domain team — per-resolver timeouts (ADR-009) surface downstream slowness as partial data by design.
- **All routes degraded simultaneously:** shell, shared dependencies, or CDN. Check CDN cache-hit and recent shell deploys before anything else.

## Most Common Pages, in order

1. **Cache-hit degradation / origin cost alerts** → CDN runbook. Usually deploy-caused invalidation.
2. **Single-remote error spike** → bad-deploy runbook. Remote rollback is fast and low-risk; bias toward rolling back early rather than diagnosing forward in production.
3. **BFF latency/error alerts** → check downstream service health first (DataLoader amplifies one slow service into many slow queries), then resolver budgets.
4. **Signal SDK null-rate alerts** → coordinate with Risk (fraud runbook, triage step 2). You own the SDK; they own the consequences.

## Deploy Rules for On-Call Week

- No federation contract overrides during your rotation without the expiring, machine-verified override flow (post-incident rule from the wallet skew postmortem — overrides carry their assumptions as checked conditions).
- Festival/tournament windows: deploy freeze for shell and shared dependencies; remote deploys allowed with stale-shell-stratum canary only. Check the capacity calendar at rotation start.

## Handoff Checklist

- Open SEVs and their downgrade criteria
- Any active CI overrides (should be none or expiring)
- Capacity calendar events in the next 7 days
- Canary configuration changes made during the week

## Escalation Contacts

- Shell/federation core: `#web-platform`
- CDN Guild secondary: PagerDuty `cdn-guild-secondary`
- BFF schema module owners: `CODEOWNERS` in the BFF repo maps GraphQL fields to squads
- EM escalation: SEV-2+, or any incident touching money display
