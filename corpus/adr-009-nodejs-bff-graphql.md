# ADR-009: Node.js Backend-for-Frontend with GraphQL

**Status:** Accepted (2024-01)
**Deciders:** Web Platform EM, Backend Platform Lead, Frontend Leads
**Technical area:** API layer between clients and domain services

## Context

Web and app clients called ~14 domain services (wallet, matchmaking, tournaments, user profile, risk, content, etc.) directly through an API gateway. Consequences:

- Funnel pages required 6–10 sequential/parallel client-side calls; on mid-range Android over mobile networks, request waterfalls dominated time-to-interactive.
- Every client shipped its own aggregation/shaping logic, drifting between web and app.
- Domain teams received UI-shaped feature requests ("add this field for the lobby screen") that polluted service APIs with presentation concerns.

## Decision

Introduce a **Node.js BFF exposing GraphQL**, owned by the Web Platform team. The BFF aggregates domain services into client-shaped queries; domain services keep clean, UI-agnostic REST/gRPC contracts. Resolvers use DataLoader for batching/dedup within a request; per-resolver timeouts and partial-data responses are mandatory (a slow recommendations service must not block wallet balance rendering).

## Alternatives Considered

**1. REST BFF (aggregate endpoints, no GraphQL).**
Simpler operationally, but every new screen variant needs a new endpoint or versioned response shape — the coordination cost lands back on the platform team. GraphQL moves shape selection to the client, which fit our multi-squad, multi-platform reality. Rejected, though acknowledged as the lower-risk default for smaller orgs.

**2. GraphQL federation across domain teams (each team owns a subgraph).**
Architecturally cleaner long-term, but requires every domain team to adopt GraphQL expertise simultaneously — an org-wide change management cost we couldn't justify for the initial problem. Deferred, not rejected; the BFF schema was designed with entity boundaries that map to future subgraphs.

**3. Do nothing; optimize client-side call orchestration.**
Rejected: leaves logic duplicated per client and keeps presentation pressure on domain APIs.

## Objections Raised

- **"The BFF becomes a monolith bottleneck owned by one team."** Partially conceded. Mitigations: schema modules with squad-level code ownership inside the BFF repo, per-module resolver budgets, and the explicit federation exit path from Alternative 2.
- **"GraphQL's flexible queries make capacity planning and caching harder."** Mitigation: persisted queries only in production (clients register operations at build time), which restores cacheability and blocks arbitrary query cost. This constraint later mattered for CDN caching of server-rendered pages (ADR-014).

## Consequences

**Measured outcomes:**
- Funnel-page client requests collapsed to 1–2 GraphQL operations; request-waterfall elimination contributed to the load-time program alongside ADR-012.
- Web/app aggregation drift eliminated for migrated flows.

**Costs accepted:**
- BFF is a new tier on the critical path: it gets its own SLOs, on-call, and load testing.
- Resolver-level timeout/partial-data discipline is enforced in code review — an ongoing culture cost.

## Follow-ups

- Persisted-query allowlist tooling in CI.
- Evaluate subgraph federation when ≥3 domain teams have GraphQL capability in-house.
