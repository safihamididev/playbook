import dotenv from "dotenv";
import { VoyageAIClient } from "voyageai";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EmbeddingIndex, SearchResult } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });
const INDEX_PATH = path.resolve(here, "../embeddings.json");

let cachedIndex: EmbeddingIndex | null = null;

export function dot(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
    return sum;
}

export async function loadIndex() {
    if (cachedIndex) return cachedIndex;
    const raw = await readFile(INDEX_PATH, "utf-8");
    cachedIndex = JSON.parse(raw) as EmbeddingIndex;
    return cachedIndex;
}

export async function search(query: string, topK = 3): Promise<SearchResult[]> {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) {
        console.error("VOYAGE_API_KEY is not set. Add it to .env or export it.");
        throw new Error("Voyage key was not loaded");
    }
    const index = await loadIndex();
    const client = new VoyageAIClient({ apiKey: apiKey });
    const res = await client.embed({
        input: [query],
        model: index.model,
        inputType: "query",
    });

    const queryVector = res?.data?.[0]?.embedding;
    if (!queryVector) throw new Error("Failed to embed query");

    return index.chunks
        .map((chunk) => ({ chunk, score: dot(queryVector, chunk.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}
