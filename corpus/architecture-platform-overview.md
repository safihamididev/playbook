# ArenaPlay Platform Architecture Overview

**Owner:** Principal Engineering
**Audience:** New engineers, on-call rotations, cross-team design reviews
**Last reviewed:** 2026-02

## Platform at a Glance

ArenaPlay is a real-money consumer gaming platform (~85M registered users, India-first, majority mid-range Android over mobile networks). The device and network profile drives architecture more than any single technology preference: client JS cost, request waterfalls, and reconnect behavior are first-order design constraints.

## Client Layer

- **Web client:** micro-frontend architecture — independently deployed remotes (wallet, game lobby, tournaments, profile/social, growth) composed by a shell via Module Federation (ADR-007). Rendering is server-first via Next.js 14 / React Server Components (ADR-012) with tiered caching (ADR-014).
- **Mobile apps:** native shells with shared React Native surfaces for content-heavy screens.
- **Signal SDKs:** device fingerprinting and behavioral signals for the risk engine are collected client-side (owned by Web Platform, consumed by Risk).

## API Layer

- **BFF (Node.js, GraphQL):** single client-facing API aggregating domain services (ADR-009). Persisted queries only in production. Per-resolver timeouts with partial-data responses. Owned by Web Platform; schema modules code-owned by squads.

## Domain Services (selected)

- **Wallet service:** balances, ledger, deposits. The reconciliation ledger writer is the consistency backbone — most money-display incidents trace here or to the client layer above it.
- **Payout orchestrator:** withdrawals via dual-PSP health-based routing with idempotency layer (ADR-018).
- **Matchmaking service:** player matching and queues; the primary festival-spike pressure point (see Diwali postmortem and the festival capacity planning process).
- **Session gateway:** persistent WebSockets for live games; session-resume tokens in Redis.
- **Tournament service:** scheduling, lobbies, prize pools, fairness policy state.
- **Risk engine:** per-account rules plus real-time graph-based cluster scoring (post bonus-abuse incident); consumes client signal SDK data.
- **Bonus/growth service:** promotional mechanics; payout-adjacent changes require risk review by launch checklist.

## Critical Flows (service touchpoints)

- **Withdrawal:** client → BFF → wallet service → risk engine (withdrawal-side rules) → payout orchestrator → PSP (A/B) → ledger reconciliation. Trust-critical; proactive comms rules apply (wallet runbook).
- **Game entry (paid):** client → BFF → wallet (entry-fee hold) → matchmaking → session gateway → game servers → outcome settlement → wallet. Mid-flow failures invoke the fairness policy (product-owned decision).
- **Festival lobby-open:** the platform's canonical spike scenario; exercised by quarterly load tests per the capacity planning process.

## Edge & Infrastructure

- **CDN:** Cloudflare, owned in-house by the CDN Guild rotation (no vendor managed-services layer — see CDN runbook background). Tiered caching per ADR-014.
- **Feature flags:** in-house platform (ADR-016); operational levers for incident mitigation with <30s propagation.
- **Render fleet:** RSC server rendering; capacity coupled to the festival forecast and cache-hit assumptions.

## Where to Go Deeper

Runbooks cover CDN, wallet withdrawal latency, fraud false positives, session disconnections, and web bad-deploy rollback. ADRs 007/009/012/014/016/018 record the architecture decisions above with alternatives and objections. Incident process and severity definitions live in the incident management doc; peak-event preparation in the festival capacity planning process.
