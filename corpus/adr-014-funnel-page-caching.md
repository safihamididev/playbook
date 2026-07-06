# ADR-014: Caching Strategy for Server-Rendered Funnel Pages

**Status:** Accepted (2025-06)
**Deciders:** Web Platform EM, CDN Guild, Principal Engineer
**Technical area:** Rendering & edge caching (follows ADR-012)

## Context

The RSC migration (ADR-012) moved rendering server-side, shifting compute cost from user devices to our infrastructure and putting render latency on our critical path. Two pressures:

1. Server render cost scales with traffic; festival peaks (see Diwali postmortem) make unbounded per-request rendering a capacity and cost risk.
2. Funnel pages mix highly cacheable content (tournament listings, game catalog) with per-user content (wallet balance, personalized recommendations).

## Decision

Three-tier strategy, applied per route segment rather than per page:

1. **Edge-cached static segments:** catalog and tournament-listing segments render with no user context and cache at Cloudflare with short TTL (60s) + stale-while-revalidate. Cache keys exclude cookies for these paths.
2. **Server-cached shared renders:** segments shared across users but too dynamic for edge TTLs (live tournament states) cache in a regional render cache (Redis) keyed by segment + variant, TTL 5–15s.
3. **Per-user segments render per-request, streamed:** wallet balance and personalization stream into the page via RSC streaming after the cached shell paints. Users see cacheable content immediately; personal data follows within the same request.

Persisted GraphQL queries (ADR-009) make BFF responses for tier-2 segments cacheable by operation hash.

## Alternatives Considered

**1. Full-page edge caching with client-side personalization fetch.**
Simplest CDN story, but reintroduces the client-side waterfall for personal data that ADR-012 removed — the low-end-device cost returns. Rejected.

**2. Per-user edge caching (cache key includes user).**
Cache-hit ratio collapses at 85M users; effectively no caching plus key-cardinality cost. Rejected.

**3. No caching; scale render capacity.**
Honest baseline. Rejected on cost: festival peak modeling showed render fleet cost growing superlinearly with concurrency, and the capacity-calendar process (Diwali postmortem action item) already commits us to pre-provisioning — caching directly shrinks what we must pre-provision.

## Objections Raised

- **"Segment-level cache rules are operationally fragile — one wrong header and we cache someone's wallet balance."** Treated as the primary risk. Mitigations: per-user segments are structurally non-cacheable (rendered only under authenticated layout boundaries that set `Cache-Control: private, no-store`), CI contract tests assert cache headers per route class, and the CDN runbook's header-verification script covers these paths.
- **"60s TTL on tournament listings will show stale prize pools."** Product decision made explicitly: prize-pool counters may lag up to 60s on the listing page; the detail page renders live. Documented in the product spec, not silently accepted by engineering.

## Consequences

- Render fleet peak capacity requirement reduced meaningfully for festival events (tier-1/2 hit ratios absorb the spike-shaped read traffic).
- Cache correctness for authenticated content is now a tested invariant, not a convention.
- Added operational surface: render cache (Redis) joins the critical path with its own alerts.

## Follow-ups

- Quarterly cache-correctness audit joins the load-test cadence from the Diwali postmortem action items.
