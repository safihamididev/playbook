# Runbook: Web Client Bad Deploy — Rollback & Recovery

**Service:** Web Client (micro-frontend platform)
**Owner:** Web Platform Team
**Severity mapping:** Error rate > 2% on any funnel page = SEV-2; white-screen/unrenderable = SEV-1
**Last reviewed:** 2026-02

## Background

The web client is composed of independently deployed micro-frontends (see ADR-007) orchestrated by a shell application via Module Federation. Each MFE deploys separately in ~4 minutes. This changes rollback thinking: most "web is broken" incidents require rolling back **one remote**, not the whole client.

## Symptoms

- Client error-rate alert (`web/error-rate` by route and by remote)
- Sentry issue spike scoped to a single MFE bundle
- White screen or partial render (shell loads, a remote fails to mount)
- CDN cache-hit degradation immediately after an asset-pipeline deploy (see CDN runbook — related failure mode)

## Triage Order

1. **Identify the blast radius: which remote?** The error-rate dashboard segments by MFE remote. A spike scoped to `wallet-mfe` routes means roll back that remote only; the rest of the platform is healthy.
2. **Shell vs. remote:** if all routes degrade simultaneously, suspect the shell application or shared dependency versions (the Module Federation shared-scope config). Shell rollbacks affect everything — confirm before acting.
3. **Version skew check:** a remote deployed against a newer shared-dependency contract than the shell provides fails only for users with cached older shells. Skew errors show as a characteristic mix: errors for some users, healthy for others, correlating with shell bundle version in the error metadata.

## Rollback Procedure

1. Roll back the affected remote via the deploy console — this repoints the remote's manifest entry to the previous build. Takes effect for new page loads immediately; no full-client redeploy needed.
2. Issue a targeted CDN purge for that remote's manifest path only (never full-zone — see CDN runbook).
3. Verify error rate recovery within 10 minutes; active sessions recover on next navigation.
4. If shell rollback is required: same procedure, wider comms — post in `#eng-announce` because all teams' remotes are affected by shell shared-scope changes.

## Version Skew Prevention (context for triage)

Shared dependencies (React, design system, GraphQL client) are pinned in the shell's federation config; remotes declare required versions at build time. CI blocks a remote deploy whose requirements exceed what the current production shell provides. If you're seeing skew in production anyway, check whether the CI contract check was overridden — overrides require EM approval and are logged.

## Post-Incident

Every SEV-2+ deploy incident gets a postmortem. Recurring theme worth checking during review: was the failure detectable in the canary stage? Canary runs at 5% traffic for 15 minutes per remote; error-rate deltas during canary should have gated the rollout.

## Escalation

- Web Platform on-call: PagerDuty `web-platform-primary`
- Shell/federation config owners: `#web-platform` (core team)
