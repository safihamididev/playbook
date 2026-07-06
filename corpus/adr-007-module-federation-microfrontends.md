# ADR-007: Adopt Micro-Frontend Architecture via Module Federation

**Status:** Accepted (2023-08) — fully rolled out 2024-03
**Deciders:** Web Platform EM, Frontend Leads (all squads), Principal Engineer
**Technical area:** Web client architecture & developer experience

## Context

The web client was a single monolithic React application shared by six feature squads (~30 frontend engineers). Two problems had become organizational, not just technical:

1. **Developer experience collapse.** Local dev server startup took **6–8 minutes**; any engineer touching any feature paid the full-monolith cost. HMR was unreliable at that scale. Engineers batched changes to avoid restarts, which degraded review quality.
2. **Deploy coupling.** A single deploy pipeline (~20 minutes) served all squads. Any squad's failing test or broken build blocked everyone. Release coordination consumed EM time weekly; hotfixes required negotiating a global deploy window.

## Decision

Split the client into independently built and deployed micro-frontends composed at runtime by a shell application using **Webpack Module Federation**. Boundaries follow squad ownership (wallet, game lobby, tournaments, profile/social, growth, platform shell). Shared dependencies (React, design system, router, GraphQL client) are provided by the shell as federation shared singletons.

## Alternatives Considered

**1. Monorepo build optimization (Turborepo/Nx caching, module boundaries, faster bundler).**
Would improve build times but retain the single deploy artifact — the deploy-coupling problem, which was the bigger organizational cost, remains. Adopted partially anyway: build caching landed as complementary work.

**2. iframe-based composition.**
Strongest isolation, weakest UX: navigation, shared auth state, and design consistency across frames all degrade. Rejected for a consumer product where funnel-page polish is revenue-relevant.

**3. Build-time composition (npm packages per squad, single deploy).**
Solves code ownership but not deploy independence; a version bump chain across packages re-creates coordination overhead in a different shape. Rejected.

**4. Full rewrite into separate apps per route domain.**
Deploy independence without federation complexity, but loses SPA navigation between domains and duplicates shared runtime cost per app. Rejected on UX and bundle-size grounds for our low-end-device user base.

## Objections Raised

- **"Module Federation version-skew failures will trade deploy coupling for runtime coupling."** Legitimate — this is the technology's sharpest edge. Mitigation designed before rollout: shared-dependency contracts checked in CI (a remote cannot deploy requiring versions the production shell doesn't provide), canary stage per remote, and remote-level rollback (see the bad-deploy runbook).
- **"Six teams will drift into six UX dialects."** Mitigation: design system provided as a shell singleton, plus a platform review checkpoint for new remotes.

## Consequences

**Measured outcomes:**
- Local dev server startup: **6–8 minutes → ~30 seconds** (engineers run only their remote + a thin shell).
- Squad deploy time: **~20 minutes → ~4 minutes**, fully independent per squad.
- Release coordination meetings eliminated; hotfix lead time no longer gated on other squads.

**Costs accepted:**
- A platform team now owns the shell, federation contracts, and CI guardrails — permanent headcount allocation, justified by the multi-squad velocity gain.
- Version-skew class of incidents exists and must be operationally managed (runbook + CI gates).
- Onboarding requires teaching the federation mental model; covered in engineer onboarding week 1.

## Follow-ups

- ADR-012 (RSC migration) executed per-remote, which the federation split made independently schedulable per squad.
