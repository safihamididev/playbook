# ArenaPlay Incident Management: Severities, Roles, and Process

**Owner:** Engineering Ops
**Applies to:** All engineering teams
**Last reviewed:** 2026-01

## Severity Definitions

| Severity | Definition | Examples | Response |
|----------|------------|----------|----------|
| SEV-1 | Money, fairness, or platform-wide availability impact affecting a large user share; or any mid-game disruption during paid tournaments at scale | Matchmaking down during a festival tournament; payouts failing platform-wide; game outcomes voided at scale | Page immediately, incident commander assigned, war room opened, exec notification within 30 min |
| SEV-2 | Major feature degraded or unavailable; financial exposure contained but active; significant user-visible errors | Wallet section unrenderable for a user segment; single-PSP failure with failover engaged; fraud exposure detected and contained | Page on-call, IC assigned, status updates every 30 min |
| SEV-3 | Degraded experience with workaround, or leading-indicator breach likely to escalate | Cache-hit ratio degradation; elevated queue wait times within tolerances; review-queue backlog | On-call investigates within business SLA; no IC required |

Escalation bias: **during festival/tournament windows, all severities are evaluated one level higher.** The trust cost of incidents during paid events justifies over-response.

## Roles

- **Incident Commander (IC):** owns coordination and decisions, not diagnosis. Any trained engineer can IC; the IC must not simultaneously be the hands-on debugger.
- **On-call engineer:** diagnosis and mitigation per the relevant runbook.
- **Comms owner:** status page, in-app banners, support briefings. For withdrawal-related incidents, comms start at SEV-3 (see wallet runbook — silence during payout issues is its own incident).
- **Scribe:** timeline capture in the incident channel; the postmortem draft starts from this record.

## Process

1. Alert or report → on-call acknowledges within 5 minutes (SEV-1/2).
2. Severity assigned using the table above; IC assigned for SEV-1/2.
3. Mitigate first, root-cause later. Rollback is always a first-class mitigation (see the bad-deploy runbook for web; remote-level rollback preferred over full-client).
4. Do not change fraud/risk rules as an incident mitigation without Risk approval — guardrail documented in the fraud runbook.
5. SEV downgrade/closure criteria must be stated when the SEV is opened ("closed when p50 < 5s for 30 min"), not decided ad hoc.

## Postmortems

- Required for all SEV-1 and SEV-2 incidents; optional but encouraged for instructive SEV-3s.
- Blameless: root causes are systemic (process, tooling, incentives), and the document names conditions, not individuals.
- Due within 5 working days; action items must have owners and dates; the EM of the owning team is accountable for action-item completion, reviewed monthly.
- Format: Summary, Timeline, Root Cause, What Went Well, What Went Poorly, Action Items, Lessons. See the Diwali matchmaking and wallet MFE postmortems as reference examples.

## Capacity Calendar

Scheduled high-traffic events (festival tournaments, marketing pushes, major game launches) are tracked on the shared capacity calendar. Owning teams must complete the pre-event checklist: demand forecast (including marketing/referral inputs), pre-scaling plan, load-test evidence at forecast-plus-contingency, and a risk review for any payout-adjacent mechanic (post bonus-abuse incident). This process is the institutionalized form of the Diwali postmortem's action items.
