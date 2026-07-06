import dotenv from "dotenv";
import { VoyageAIClient } from "voyageai";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EmbeddingIndex, SearchResult } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });
const INDEX_PATH = path.resolve(here, "../embeddings.json");
const QUERY_CACHE_PATH = path.resolve(here, "../.query-cache.json");

let cachedIndex: EmbeddingIndex | null = null;

// Query-embedding cache: key = `${model}::${query}`, value = vector.
// The model is part of the key so a cached vector can never be served
// against an index built with a different model (see decision 009) —
// stale entries become unreachable instead of needing invalidation.
// inputType is always "query" in this path, so it isn't in the key.
let queryCache: Record<string, number[]> | null = null;

export function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

export async function loadIndex(): Promise<EmbeddingIndex> {
  if (cachedIndex) return cachedIndex;
  const raw = await readFile(INDEX_PATH, "utf-8");
  cachedIndex = JSON.parse(raw) as EmbeddingIndex;
  return cachedIndex;
}

async function loadQueryCache(): Promise<Record<string, number[]>> {
  if (queryCache) return queryCache;
  try {
    const raw = await readFile(QUERY_CACHE_PATH, "utf-8");
    queryCache = JSON.parse(raw) as Record<string, number[]>;
  } catch {
    // Missing or unreadable cache file is not an error — start empty.
    queryCache = {};
  }
  return queryCache;
}

async function saveQueryCache(cache: Record<string, number[]>): Promise<void> {
  // Fail-soft by design: the cache is an optimization, not data.
  // A failed write must never fail a search that already succeeded —
  // worst case, the next run re-embeds (costs a fraction of a cent).
  // Contrast with ingest, which fails FAST: there, a write problem
  // means the system's source of truth is at risk. Here nothing is.
  try {
    await writeFile(QUERY_CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.warn(`query-cache write failed (continuing): ${String(err)}`);
  }
}

async function embedQuery(query: string, model: string): Promise<number[]> {
  const cache = await loadQueryCache();
  const key = `${model}::${query.trim()}`;

  const hit = cache[key];
  if (hit) return hit;

  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY is not set. Add it to .env or export it.");
  }
  const client = new VoyageAIClient({ apiKey });
  const res = await client.embed({
    input: [query],
    model,
    inputType: "query",
  });

  const vector = res?.data?.[0]?.embedding;
  if (!vector) throw new Error("Failed to embed query");

  cache[key] = vector;
  await saveQueryCache(cache);
  return vector;
}

export async function search(query: string, topK = 3): Promise<SearchResult[]> {
  const index = await loadIndex();
  const queryVector = await embedQuery(query, index.model);

  return index.chunks
    .map((chunk) => ({ chunk, score: dot(queryVector, chunk.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}