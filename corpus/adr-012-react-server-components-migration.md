# ADR-012: Migrate Web Client to Next.js 14 with React Server Components

**Status:** Accepted (2025-02) — migration completed 2025-09
**Deciders:** Web Platform EM, Principal Engineer, Frontend Leads
**Technical area:** Web client architecture

## Context

The ArenaPlay web client ran on Next.js 8 with an almost entirely client-rendered architecture: most pages shipped as large client bundles, with data fetching happening in the browser after hydration. Consequences at our scale (~85M registered users, majority on mid-range Android devices over inconsistent mobile networks):

- **p90 page load time of ~7 seconds** on key funnel pages (game lobby, wallet, tournament listing). Load time correlated directly with drop-off in the deposit and game-entry funnels.
- JS bundle size had grown to the point where parse/execute cost on low-end devices dominated load time, independent of network.
- Next.js 8 (2019-era) was far behind on framework security patches, React versions, and build tooling. Hiring engineers onto a 5-major-versions-old stack was a growing drag.

## Decision

Migrate to Next.js 14 (App Router) and adopt React Server Components as the default rendering model. Components render on the server unless they demonstrably need client interactivity (`"use client"` is opt-in, justified in code review). Data fetching moves server-side into the component tree.

Migration strategy: incremental, route-by-route, behind a routing layer that let App Router and Pages Router coexist. Highest-traffic funnel pages (lobby, tournament listing) migrated first to front-load the user-facing win; long-tail pages followed over ~7 months.

## Alternatives Considered

**1. Aggressive code-splitting and bundle optimization on the existing stack.**
Route-level splitting, dynamic imports, dependency diet. Rejected as the primary strategy: our own audit showed we could realistically cut bundle size ~20–25% this way, but the architecture still required shipping and hydrating all rendering logic to the client. It treats the symptom (bundle size) rather than the model (client-first rendering). We did adopt several of these techniques during the migration as complementary work.

**2. Upgrade to Next.js 12/13 Pages Router with heavier SSR/ISR, no RSC.**
Lower migration risk and a smaller learning curve. Rejected because it captures only part of the win: SSR on the Pages Router still ships the full component JS for hydration, so parse/execute cost on low-end Android — our dominant device class — remains. It also left us one more migration away from the framework's actual direction, meaning we'd pay migration cost twice.

**3. Do nothing / defer.**
Rejected: p90 load time was a measured funnel-conversion problem, not a hygiene concern, and the framework-age problem compounds.

## Objections Raised (and how they were resolved)

- **"Half our component library and several third-party dependencies aren't RSC-compatible."** True at the time. Resolution: audit produced a compatibility matrix; incompatible dependencies were either isolated behind `"use client"` boundaries, replaced, or upstream issues tracked. This audit was made a Phase 0 exit criterion before any route migration began.
- **"The team doesn't know the App Router mental model; velocity will crater."** Resolution: two-week enablement sprint (internal workshops, a migrated reference route as the canonical example, paired migrations for the first month). Velocity dipped ~15% for the first six weeks and recovered.
- **"Route-by-route coexistence will create a confusing hybrid codebase."** Accepted as a real, time-bounded cost. Mitigation: a published migration order, lint rules preventing new pages on the old router, and a hard sunset date for the Pages Router.

## Consequences

**Measured outcomes (post-migration, funnel pages):**
- p90 load time reduced from ~7s to ~4s (**43% reduction**), driven primarily by the reduction in client JS shipped and hydrated.
- Client JS bundle for migrated routes reduced substantially; low-end Android parse/execute time no longer the dominant load-time component.
- Framework current with upstream; security patch lag eliminated.

**Costs and risks accepted:**
- ~7 months of migration effort alongside feature work.
- Temporary hybrid-router complexity.
- Server rendering shifts some compute cost from client devices to our infrastructure — accepted, as edge/server render cost was small relative to the measured funnel-conversion value of faster loads.

## Follow-ups

- ADR-014: Caching strategy for server-rendered funnel pages (interacts with CDN configuration — see CDN runbook).
- Bundle-size budget enforced in CI for all `"use client"` components.
