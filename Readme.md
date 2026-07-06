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

## Roadmap

- [x] **Phase 1 — RAG pipeline:** corpus, chunking, ingestion, retrieval, cited generation
- [ ] **Phase 2 — Eval harness in CI:** retrieval accuracy, citation presence, faithfulness, and refusal checks on every prompt change; the wallet conflation as a permanent regression test
- [ ] **Phase 3 — Tool use + MCP server:** structured actions (service status, incident creation, on-call lookup) exposed via a published MCP server
- [ ] **Phase 4 — Model routing + cost dashboard:** Haiku/Sonnet routing by query complexity, with per-query cost, latency, and eval scores made visible

## Stack

TypeScript · Node 22 · [Voyage AI](https://www.voyageai.com/) embeddings · [Anthropic Claude API](https://docs.claude.com/) · zero frameworks

## License

MIT