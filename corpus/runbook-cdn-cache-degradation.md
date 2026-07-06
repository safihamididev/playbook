# Runbook: CDN Cache-Hit Degradation & Cost Spike Response

**Service:** Edge / CDN (Cloudflare)
**Owner:** Web Platform Team (CDN Guild)
**Severity mapping:** Cache-hit ratio < 85% for 30 min = SEV-3; < 70% or origin egress cost alert = SEV-2
**Last reviewed:** 2026-03

## Background

ArenaPlay serves ~85M registered users. All static assets, game bundles, and image content are served via Cloudflare. We migrated from Akamai in 2024. As part of that migration we moved away from a vendor-managed relationship model (dedicated Akamai account/solutions team) to an **in-house CDN Guild**: four engineers on the Web Platform team trained and certified to own Cloudflare configuration directly. This runbook exists because CDN expertise is now an internal responsibility — there is no external team to escalate configuration issues to.

## Symptoms

- Cache-hit ratio drops below 85% (dashboard: `edge/cache-hit-ratio`)
- Origin egress bandwidth spike (alert: `origin-egress-cost-daily`)
- p90 asset load time increase on the web client
- Spike in origin 5xx errors as origin absorbs traffic the edge should serve

## Immediate Triage (first 15 minutes)

1. **Check for a recent deploy.** Most cache-hit degradations at ArenaPlay are self-inflicted: a deploy that changed asset hashing, cache-control headers, or URL structure invalidates the entire edge cache at once. Check the deploy log for `web-client` and `asset-pipeline` in the last 2 hours.
2. **Check Cloudflare dashboard for purge events.** An accidental full-zone purge (instead of a targeted purge-by-tag) will crater the hit ratio. Purge audit log: Cloudflare dashboard → Caching → Purge history.
3. **Check cache-control headers on top assets.** Run the header verification script: `pnpm run cdn:verify-headers`. A misconfigured `no-store` or short `max-age` on high-traffic assets is a common regression.
4. **Check for a traffic pattern change.** A marketing push or tournament event can shift traffic to uncached long-tail assets. Compare top-100 requested URLs against the previous week.

## Mitigation

- **Deploy-caused invalidation:** Do NOT roll back solely for cache reasons. Instead, pre-warm the cache for the top 500 assets using the warming script (`pnpm run cdn:warm --top500`). Hit ratio typically recovers within 45 minutes.
- **Accidental full purge:** Run the warming script immediately. Identify who purged and why; targeted purge-by-tag is the only approved purge method in production.
- **Header regression:** Fix headers at the origin config (`infra/cloudflare/cache-rules.tf`), deploy, then issue a targeted purge for affected paths only.
- **Traffic shift:** If a planned event, coordinate with the event team to get the asset manifest in advance and pre-warm. Add the event to the capacity calendar.

## Cost Spike Response

Origin egress cost alerts fire at 130% of the 14-day rolling average. Because we no longer have a vendor account team monitoring spend on our behalf, cost anomalies are owned by the on-call CDN Guild member.

1. Identify the top egress-driving paths (Cloudflare analytics → Origin traffic by path).
2. Common causes: uncacheable API responses accidentally routed through CDN, image variants being generated per-request instead of cached, video content missing tiered caching.
3. Verify tiered caching (Argo) is enabled for the affected zone.
4. If cost spike is from a new feature, file a ticket against the owning team with the projected monthly cost delta — cost accountability sits with the feature team, enforcement with the Guild.

## Historical Context

The 2024 Akamai → Cloudflare migration reduced CDN spend by 67%. The savings came from two sources: (a) Cloudflare's pricing model for our traffic profile, and (b) eliminating the managed-services layer — instead of paying for a dedicated vendor relationship team, we invested in training four internal engineers to own CDN configuration. Tradeoff accepted: slower access to deep vendor expertise in exchange for faster iteration and lower cost. This runbook and the Guild rotation are the operational consequence of that decision.

## Escalation

- CDN Guild on-call: `#cdn-guild` / PagerDuty `cdn-guild-primary`
- Cloudflare support (Business plan): only for platform-side incidents (verify at cloudflarestatus.com first)
- SEV-2 or above: page Web Platform EM
