# ArenaPlay Festival & Peak Event Capacity Planning Process

**Owner:** Game Services (process), all teams (execution)
**Origin:** Diwali Mega Tournament postmortem action items (2025-10)
**Last reviewed:** 2026-02

## Why This Process Exists

Festival tournaments are the most predictable traffic ArenaPlay receives — the date is known months ahead — yet historically produced our worst incidents because scheduled spikes were handled by reactive autoscaling designed for gradual load. This process replaces reactive scaling with forecast-driven preparation for all scheduled peak events.

## Demand Forecasting

Forecasts are produced 4 weeks before each event and refreshed weekly. Inputs, in order of historical predictive weight:

1. Same-event prior-year peak, adjusted for user-base growth
2. Marketing spend plan for the event (from Growth — the missing input in the 2025 Diwali incident)
3. Active referral/virality mechanics and their measured amplification
4. Concurrent external events (cricket calendar overlaps materially shift evening traffic)

Output: projected peak concurrency per service (matchmaking, session gateway, wallet, BFF, render fleet) with a P90 band. Planning targets the P90 upper bound plus 25% contingency.

## Pre-Scaling & Standby Capacity

- **T-60 minutes before lobby open:** fleets pre-scaled to forecast peak. Lobby-open spikes are near-vertical; autoscaling stabilization windows (≈6 min per step) cannot track them.
- **Warm standby pool:** an additional pre-provisioned instance pool held ready through the festival window, sized at the contingency margin. This is an explicit, quarterly-reviewed cost: we pay for idle capacity to cap incident risk during the highest-trust-stakes windows.
- Render fleet requirements are reduced by the ADR-014 caching tiers; the forecast feeds cache-hit assumptions, which the load test must validate.

## Load Testing

- Lobby-open spike scenario tested quarterly at 5x last recorded peak (postmortem action item, now recurring).
- Event-specific load test at forecast-plus-contingency is a pre-event checklist gate — no test evidence, no event sign-off.
- Client retry behavior (exponential backoff + jitter) is asserted in the load-test harness; retry-storm amplification is a regression class we test for explicitly.

## Cross-Functional Checkpoint

A joint session between capacity planning, Growth/marketing, and the tournament ops lead is mandatory at T-4 weeks and T-1 week. Purpose: reconcile the demand forecast with the *current* marketing plan (spend changes after forecast submission were the root forecasting gap in the Diwali incident), and confirm any payout-adjacent mechanic passed risk review (bonus-abuse postmortem action item).

## During the Event

- Tournament war room (`#tournament-warroom`) staffed for the window: tournament ops lead, IC-trained engineer, on-calls for matchmaking/session gateway/wallet.
- Severity evaluation runs one level elevated per the incident management policy.
- Fairness-policy decision authority (pause entries vs. continue vs. void) sits with the tournament ops lead and Product on-call — pre-assigned, not negotiated mid-incident.

## After the Event

Retro within one week: forecast vs. actuals per service, standby pool utilization, cost of pre-provisioned capacity vs. incident-free outcome. Forecast model inputs are re-weighted from actuals. The retro feeds the next quarter's standby-pool sizing review.
