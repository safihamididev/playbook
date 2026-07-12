# Playbook as an MCP Server: Real-Client Demo

Playbook's capabilities — semantic search over the ops corpus, the three
operational tools, and the full grounded-answer pipeline — are exposed as an
MCP (Model Context Protocol) server. Any MCP client can consume them. This
document records the server's design and its first real-client session in
Claude Desktop.

## The tool surface: two tiers (decision 018)

| Tool | Tier | What it does |
|---|---|---|
| `search_docs(query, topK)` | Primitive | Semantic search over runbooks/ADRs/postmortems; returns chunks with stable ids, titles, sections, scores |
| `get_service_status(service)` | Primitive | Current status, p99, operator note for a production service |
| `get_oncall(team)` | Primitive | Current on-call engineer for a team |
| `create_incident(title, severity, service)` | Primitive | Files an incident; description enforces conservative use |
| `ask_playbook(question)` | Composed | Runs the entire Playbook pipeline: hardwired retrieval, agent loop, per-claim citations, `NOT_IN_DOCS:` refusal |

**Why two tiers:** when you stop owning the loop, invariants can't be imposed
on the caller. The primitives tier hands over raw capability — the external
agent composes freely and owns its own correctness. The composed tier carries
Playbook's guarantees (grounding, citations, refusal discipline) inside a
black box, for callers who want the judgment, not the parts. This is the
standard shape of a platform API: raw K/V store vs. the transactional layer
above it.

## Protocol discipline

In stdio transport, **stdout is the protocol channel** — a stray
`console.log` corrupts MCP frames. All diagnostics go through `src/log.ts`,
which writes structured JSONL to **stderr**; Claude Desktop captures that
stream into `~/Library/Logs/Claude/mcp-server-playbook.log`. The same JSONL
lines (`llm_call` events with model and token counts) are the data feed for
the Phase 4 cost dashboard — one instrumentation, two consumers.

## Registering in Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS; `%APPDATA%\Claude\` on Windows) — all paths absolute, since Desktop
spawns the server outside any shell:

```json
{
  "mcpServers": {
    "playbook": {
      "command": "/absolute/path/to/repo/node_modules/.bin/tsx",
      "args": ["/absolute/path/to/repo/src/mcp/server.ts"]
    }
  }
}
```

Verify without Desktop using the Inspector:

```bash
npx @modelcontextprotocol/inspector tsx src/mcp/server.ts
```

## The demo session (Claude Desktop, first real-client traffic)

### 1. Simple round-trip — primitive tier

> **Query:** who is on call for payments?
>
> **Desktop's answer:** Arjun Mehta is on call for payments right now — Slack
> him at @arjun-oncall.

One `get_oncall` call, clean result. Notable contrast: Playbook's own
pipeline answers this query with an additional *cited* escalation handle from
the runbook. Same tool, different agent, different depth — the two-tier story
in miniature.

### 2. The composed tier through a real client

> **Query:** Use the ask_playbook tool: matchmaking seems slow, what should I do?
>
> **Desktop's answer (abridged):** matchmaking's still degraded, p99 at
> 2400ms, investigation ongoing since 14:00 IST, and Sana Iqbal
> (@sana-oncall) on game-services is on it. One added detail: the Diwali 2025
> postmortem notes that when a similar spike hit (3.4x normal traffic), queue
> p50 wait jumped from 4s to over 90s, and recovery came from a manual scaling
> override plus client-side retry backoff — worth flagging to Sana. Want me to
> file an incident, or are you just looping in Sana directly?

Playbook's full pipeline — live status, postmortem context, conservative
incident posture — invoked through the protocol. Two observations worth
keeping honest:

- Desktop's Claude **paraphrased** Playbook's cited answer into its own voice:
  the postmortem attribution survived, the `[chunk-id]` citation did not. Your
  guarantees hold up to the composed tier's boundary; the consuming agent
  renders the output however it likes. You control the answer, not the
  presentation.
- The on-call detail suggests composition *across* tiers (an additional
  `get_oncall` alongside `ask_playbook`) or in-pipeline variance — the server's
  stderr log resolves which, per session.

### 3. Primitives composed by an external agent

> **Query:** Search the ArenaPlay docs for the wallet incident from last
> August and summarize the action items.
>
> **Desktop's answer (abridged):** Found it: Postmortem: Wallet MFE
> Version-Skew Outage (Aug 7, 2025, SEV-2)... [accurate incident summary,
> the full action-items table, and:] That last one is notable — the original
> incident lost ~12 minutes because Payments was paged first based on symptom
> shape ("balance not visible") before it was traced to a client-side issue.

The external agent used `search_docs` to resolve a paraphrase ("last August"
→ a doc dated 2025-08-07 that never says "August"), extracted the
action-items table accurately, and connected the alert-routing action item to
the misrouted-triage detail from a *different chunk*. This is
retrieval-as-tool — the architecture decision 016 deliberately declined to
build internally — running legitimately one layer up, where the consumer's
agent owns its own faithfulness.

### The honest finding: instructions travel, invariants don't

`search_docs`'s description asks callers to cite chunk ids when using chunk
content. Desktop's agent — a model this server does not govern — did not.
That is not a failure; it is the empirically observed boundary of the
primitives tier, and it is the complete argument for `ask_playbook`'s
existence: a description can *request* good behavior from an external agent;
only the composed tier can *guarantee* it.

## Future work

- MCP progress notifications for `ask_playbook` (long-running tool UX)
- Consolidate tool descriptions into `definitions.ts` as the single source of
  truth shared by the agent loop and the MCP server
- An eval asserting every doc reference in a tool description resolves to a
  real corpus file (tool descriptions are documentation about documentation;
  they rot the same way)