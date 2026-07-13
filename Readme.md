# Playbook

An ops copilot for **ArenaPlay**, a fictional real-money gaming platform (~85M users). On-call engineers ask it questions during incidents and planning — *"why are payouts slow?"*, *"how do we prepare for festival traffic?"* — and it answers from the company's runbooks, ADRs, and postmortems, with a citation on every claim and an honest refusal when the docs don't cover it.

Built **from scratch in TypeScript** — no LangChain, no vector database. Every stage of the RAG pipeline is hand-written and small enough to read in one sitting: chunking, embeddings, cosine retrieval, cited generation.

## Why this exists

Most RAG demos wire a framework to a vector DB and stop. This project makes the opposite bet: at real-corpus-starts-small scale, the entire retrieval engine is ~50 lines, and owning every line means every design decision is deliberate and defensible. The two documents below are the actual point of the repo:

- **[docs/decisions.md](docs/decisions.md)** — the decision log: 11 entries covering chunking strategy, fail-fast ingestion, deterministic ids, rate-limit batching, model provenance — each with the alternative considered and why it lost.
- **[docs/prompt-evolution.md](docs/prompt-evolution.md)** — a real, observed hallucination (the model welded facts from two different wallet incidents into one misleading answer), the prompt change that fixed it, and the before/after evidence across a 4-query grid. This failure is becoming the first automated regression test.

## Quick start

```bash
npm install
cp .env.example .env        # add VOYAGE_API_KEY and ANTHROPIC_API_KEY

npm run ingest              # chunk corpus/ → embed → embeddings.json
npm run ask -- "money stuck in wallet"          # raw retrieval, no LLM
npm run answer -- "money stuck in wallet"       # cited answer via Claude
```

## How it works

```
corpus/*.md ──► chunk.ts ──► ingest.ts ──► embeddings.json
   19 docs      118 chunks    Voyage API     1024-dim vectors
                (one per H2)  (batched,      (flat file — no
                              rate-aware)     vector DB needed)

query ──► search.ts ──────────► answer.ts ──────────► cited answer
          embed + cosine        top-5 chunks into      every claim tagged
          over all chunks       Claude Haiku with       [chunk-id]; refuses
          (a dot product —      a versioned system      when docs don't
          Voyage vectors are    prompt                  cover the question
          pre-normalized)
```

**Corpus:** 19 fictional-but-realistic ops documents — runbooks, ADRs, postmortems, and process docs for a gaming platform (CDN cost incidents, matchmaking surge postmortems, micro-frontend architecture decisions). The docs deliberately cross-reference each other, so multi-document questions have real answers.

**Retrieval:** Voyage `voyage-4-lite` embeddings, cosine similarity in-process over a flat JSON index. At 118 chunks a vector database is pure overhead; the scaling path (hybrid BM25 + embeddings behind the same `search()` interface) is documented in the decision log.

**Generation:** Claude Haiku with a versioned system prompt enforcing per-claim citations, refusal without general-knowledge fallback, and separate presentation of distinct issues (the rule that fixed the observed conflation).

## MCP server
 
Playbook is also an [MCP](https://modelcontextprotocol.io) server: its
retrieval, ops tools, and full answer pipeline are consumable by any MCP
client — Claude Desktop, Claude Code, or your own agent.
 
| Tool | Tier | Description |
|---|---|---|
| `search_docs` | primitive | Semantic search over the ops corpus; returns chunks with stable, citable ids |
| `get_service_status` | primitive | Live status + p99 for a production service |
| `get_oncall` | primitive | Current on-call engineer for a team |
| `create_incident` | primitive | Files an incident (description enforces conservative use) |
| `ask_playbook` | composed | The entire pipeline — grounded, cited, refusal-capable — behind one call |
 
Two tiers by design: primitives hand raw capability to agents that own their
own correctness; `ask_playbook` carries Playbook's guarantees inside the
call. Rationale and a real Claude Desktop session in
[docs/mcp-demo.md](docs/mcp-demo.md).
 
**Try it without any client:**
 
```bash
npx @modelcontextprotocol/inspector tsx src/mcp/server.ts
```
 
**Register in Claude Desktop** — add to
`~/Library/Application Support/Claude/claude_desktop_config.json`
(`%APPDATA%\Claude\` on Windows), absolute paths required:
 
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
 
Requires `VOYAGE_API_KEY` and `ANTHROPIC_API_KEY` in the repo's `.env`
(loaded relative to the source files, so it works regardless of the client's
working directory).

## Cost & routing dashboard
 
Every LLM call is instrumented — model, tokens, cost, latency — as JSONL
(`logs/events.jsonl`). A build-time aggregator rolls those events up per query
into `dashboard/public/summary.json`, and a small Next.js page renders it: model
split, cost by model, routing reasons, latency, and cache utilization.
 
Playbook routes on **retrieval signals it already computes** — no extra
classifier call. Queries whose chunks span several documents at a strong match
escalate to Sonnet; everything else stays on Haiku, ~3.6× cheaper. Which queries
*genuinely* need the upgrade is decided by an experiment, not an assumption — see
[docs/routing-experiment.md](docs/routing-experiment.md).
 
```bash
# from repo root: produce a fresh run, then aggregate and view
npm run eval
cd dashboard
npm run aggregate     # reads ../logs/events.jsonl → public/summary.json
npm run dev           # localhost:3000
```
 
The committed `summary.json` lets the dashboard render real numbers without the
raw logs or any API key.
 
<!-- ──────────────────────────────────────────────────────────────
Roadmap block — replace with:
─────────────────────────────────────────────────────────────── -->
 
## Roadmap
 
- [x] **Phase 1 — RAG pipeline:** corpus, chunking, ingestion, retrieval, cited generation
- [x] **Phase 2 — Eval harness in CI:** deterministic checks + LLM judge, required status check on main; the wallet conflation as a permanent regression test ([docs/ci-gate.md](docs/ci-gate.md))
- [x] **Phase 3 — Tool use + MCP server:** agentic loop with ops tools, tool-call evals, and a two-tier MCP server demoed in Claude Desktop ([docs/mcp-demo.md](docs/mcp-demo.md))
- [x] **Phase 4 — Model routing + cost dashboard:** experiment-driven Haiku/Sonnet routing on retrieval signals, per-query cost instrumentation, and a Next.js dashboard ([docs/routing-experiment.md](docs/routing-experiment.md))

## Stack

TypeScript · Node 22 · [Voyage AI](https://www.voyageai.com/) embeddings · [Anthropic Claude API](https://docs.claude.com/) · zero frameworks

## License

MIT