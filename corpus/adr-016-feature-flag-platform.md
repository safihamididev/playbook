# ADR-016: In-House Feature Flag Platform over SaaS

**Status:** Accepted (2024-09)
**Deciders:** Web Platform EM, Backend Platform Lead, Security
**Technical area:** Release engineering / runtime configuration

## Context

Feature flags at ArenaPlay outgrew their origin as a frontend convenience. Three distinct use cases emerged with different requirements:

1. **Release gating** (percentage rollouts, canary cohorts) — needs targeting and kill switches.
2. **Operational levers** — runtime behavior changes during incidents (retry backoff tuning in the Diwali incident, degraded-network client profiles in the session-gateway runbook). Needs sub-minute propagation and audit trails.
3. **Experimentation** — A/B assignment with stable bucketing for growth teams.

Evaluation was SaaS (LaunchDarkly-class) vs. building on our existing config infrastructure.

## Decision

Build an in-house flag platform on existing infrastructure: flag definitions in a versioned config store, evaluated client-side via SDK with streamed updates (< 30s propagation), server-side via a sidecar library. Experimentation bucketing is a layer on top, sharing the targeting engine.

The deciding factors, in order:

1. **Data residency and cost at our scale.** Flag evaluation at 85M-user scale makes per-MAU SaaS pricing a materially bad deal, and streaming user-targeting attributes to a third party crossed our data-residency posture for a real-money product.
2. **Operational levers are incident-critical.** Runbooks depend on flags as mitigation tools; putting incident mitigation behind a third-party availability dependency inverts the reliability relationship.
3. We already operated the config-store and streaming infrastructure — the build was integration, not greenfield.

## Alternatives Considered

**1. SaaS flag platform.**
Faster to full capability (their targeting UI and experimentation stats are mature). Rejected on cost-at-scale, data residency, and the incident-dependency argument above. Acknowledged honestly: for an org without existing config infrastructure, this decision likely flips.

**2. Open-source self-hosted (Unleash/Flagsmith-class).**
Considered seriously. Rejected mainly because integrating our existing config store was less total surface than operating a new stateful system; secondarily, experimentation-grade stable bucketing would have required forking.

**3. Status quo (config files + deploys).**
Rejected: "change requires deploy" is exactly the property operational levers cannot have — the Diwali retry-backoff mitigation shipped in ~15 minutes *because* a flag existed; a deploy path would have taken the client-release cycle.

## Objections Raised

- **"In-house flag platforms rot into unowned critical infrastructure."** The strongest objection, conceded as a real pattern. Mitigation: the platform has a named owning team (Web Platform), flags have mandatory owners and expiry dates, and a monthly stale-flag report goes to EMs — flags past expiry without renewal fail closed in the next release.
- **"Experimentation stats are hard to get right in-house."** Conceded; the experimentation layer launched later and thinner than a SaaS equivalent, with analyst review of methodology.

## Consequences

- Flags became first-class incident tooling: both 2025 postmortems (Diwali, session-gateway degraded-network profile) feature flag-based mitigations with sub-hour ship times.
- Permanent ownership cost accepted; stale-flag hygiene is an ongoing EM-level responsibility, enforced by process rather than goodwill.
