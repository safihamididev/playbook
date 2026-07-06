# Runbook: Real-Time Game Session Disconnection Spike

**Service:** Game Session Gateway (WebSocket layer)
**Owner:** Game Services
**Severity mapping:** Disconnect rate > 3% of active sessions over 10 min = SEV-3; > 8% or reconnect failures rising = SEV-2 (SEV-1 during paid tournaments)
**Last reviewed:** 2025-12

## Background

Live games hold a persistent WebSocket per player through the session gateway. Disconnections mid-game in paid contests have direct money implications: game outcomes may be voided and entry fees refunded per the fairness policy, which is both a cost and a trust event. Severity is therefore elevated automatically during tournament windows.

## Symptoms

- `session-gateway/disconnect-rate` alert
- Reconnect success rate dropping (`session-gateway/reconnect-success`)
- Player reports of games freezing or "connection lost" mid-match
- Fairness-policy refund job volume rising

## Triage Order

1. **Gateway fleet health:** memory pressure on gateway nodes is the most common internal cause — connection counts grow, GC pauses lengthen, heartbeats miss, clients get dropped in waves. Check per-node connection count vs. the 40k soft limit and GC pause panels.
2. **Recent gateway or load-balancer deploy:** a gateway deploy drains connections by design; a *misconfigured* rolling deploy (too many nodes cycling at once) turns a graceful drain into a mass disconnect. Check deploy log and drain-rate config.
3. **Regional network pattern:** if disconnects cluster by ISP/region (panel: disconnects by ASN), the cause is likely external — a carrier issue in a specific state. This is diagnosis, not something we fix; skip to mitigation for external causes.
4. **Client release correlation:** a client bug in heartbeat or reconnect logic shows up as one app version over-represented in disconnects.

## Mitigation

- **Node memory pressure:** scale out the gateway fleet; connection rebalancing is automatic for new connections but existing ones stay pinned — expect gradual relief, not instant.
- **Bad rolling deploy:** pause the deploy, restore drain-rate limits (max 5% of fleet draining concurrently).
- **External/regional:** enable the degraded-network client profile via feature flag (longer heartbeat tolerance, aggressive reconnect with session resume). Post regional status notice if sustained.
- **During paid tournaments:** engage the fairness-policy decision path early — the tournament ops lead decides between pausing new match starts vs. continuing, based on disconnect trajectory. Voiding games retroactively is worse than briefly pausing entry.

## Reconnect & Session Resume

Session resume allows a reconnecting player to rejoin an in-progress game within a 45-second window. If reconnect success is low while disconnect cause is external, verify the resume-token store (Redis) health — resume failures with healthy gateways usually mean token store latency.

## Escalation

- Game Services on-call: PagerDuty `game-services-primary`
- Tournament ops lead (during events): `#tournament-warroom`
- Fairness/refund policy decisions: Product on-call, not engineering
