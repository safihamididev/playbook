# Postmortem: Matchmaking Queue Overload — Diwali Mega Tournament

**Date of incident:** 2025-10-20, 19:10–21:40 IST
**Severity:** SEV-1
**Status:** Resolved. Action items complete as of 2025-12.
**Author:** Web Platform / Game Services (joint)

## Summary

During the opening evening of the Diwali Mega Tournament, concurrent matchmaking requests reached 3.4x the previous recorded peak. Matchmaking service instances hit CPU saturation, queue wait times grew from a p50 of 4 seconds to over 90 seconds, and approximately 18% of match requests timed out over a 2.5-hour window. Users experienced stuck "Finding players…" screens and duplicate entry-fee deductions on retry (all auto-refunded within 24 hours). No data loss. Estimated impact: ~2.1M affected match attempts, elevated support ticket volume (11x daily average), measurable next-day retention dip in affected cohorts.

## Timeline (IST)

- **18:45** — Tournament lobby opens. Traffic ramp begins, steeper than projected.
- **19:10** — Matchmaking queue p50 wait exceeds 15s. First alert fires (`matchmaking-queue-wait-p50`).
- **19:18** — On-call confirms CPU saturation across all matchmaking instances (sustained >92%). Autoscaling is adding instances but with ~6 min lag per scale-out step — demand is outpacing the scaling policy.
- **19:25** — SEV-1 declared. Incident commander assigned.
- **19:40** — Manual scaling override: instance count raised directly to 4x baseline, bypassing stepped autoscaling policy.
- **19:55** — New instances healthy, but the retry storm from queued clients keeps the backlog growing. Client retry behavior identified as an amplifier: the app retried failed matchmaking requests every 5 seconds with no backoff.
- **20:10** — Feature flag shipped to force exponential backoff + jitter on matchmaking retries (flag already existed from a prior experiment; values tuned live).
- **20:35** — Queue backlog begins draining. Wait times recovering.
- **21:40** — p50 wait back under 5s. SEV-1 downgraded. Monitoring continues through the night.

## Root Cause

The direct cause was under-provisioned matchmaking capacity for the traffic peak. The underlying causes were:

1. **Forecasting gap.** Capacity planning used the previous festival peak + 40% headroom. Actual demand was 3.4x — driven by a larger marketing spend and a new referral mechanic that the capacity model didn't account for. Capacity planning and growth/marketing operated on separate planning calendars.
2. **Reactive scaling policy unfit for spike-shaped load.** Stepped autoscaling (add N instances per threshold breach, 6-minute stabilization window) is designed for gradual load changes. Festival tournament traffic arrives as a near-vertical spike at lobby-open time — a known, scheduled moment.
3. **Retry amplification.** Aggressive fixed-interval client retries turned a capacity shortfall into a self-sustaining overload.

## What Went Well

- Feature-flag infrastructure allowed a client behavior change (retry backoff) to ship in ~15 minutes without an app release.
- Manual scaling override path existed and worked.
- Entry-fee reconciliation job correctly identified and refunded all duplicate deductions automatically.

## What Went Poorly

- Autoscaling policy was trusted for a load shape it was never designed for.
- The 6-minute scale-out lag was known but not treated as a risk for scheduled spike events.
- No load test had been run against the tournament lobby-open scenario at projected-plus-contingency scale.

## Action Items

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | **Predictive pre-scaling for scheduled events:** capacity calendar integrated with tournament schedule; matchmaking fleet pre-scaled to forecast peak 60 min before lobby open, using a demand model that includes marketing spend and referral inputs | Game Services | Done |
| 2 | Warm standby pool: additional pre-provisioned instances held ready during festival windows (accepted cost tradeoff, reviewed quarterly) | Game Services | Done |
| 3 | Exponential backoff + jitter made the permanent default for all client retry paths | Web Platform | Done |
| 4 | Quarterly load test of lobby-open spike at 5x last peak | Game Services + QA | Done (recurring) |
| 5 | Joint planning checkpoint between capacity planning and growth/marketing before every festival event | EM, Game Services | Done (process) |

## Lessons

Scheduled demand spikes should be treated as capacity *planning* problems, not autoscaling problems. Autoscaling handles the unexpected; festivals are the most predictable traffic we have. The permanent fix — forecast-driven pre-scaling with standby capacity during festival windows — trades a known, bounded infrastructure cost for elimination of an unbounded incident and trust cost.
