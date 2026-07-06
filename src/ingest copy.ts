import dotenv from "dotenv";
import { VoyageAIClient } from "voyageai";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chunkMarkdown } from "./chunk.js";
import type { Chunk, EmbeddedChunk, EmbeddingIndex } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") })
const CORPUS = path.resolve(here, "../corpus");
const INDEX_PATH = path.resolve(here, "../embeddings.json");
const EMBEDDING_MODEL = 'voyage-4-lite';
const BATCH_TOKEN_BUDGET = 8000;          // stay under 10K TPM with margin
const estTokens = (s: string) => Math.ceil(s.length / 4);  // rough heuristic
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) {
        console.error("VOYAGE_API_KEY is not set. Add it to .env or export it.");
        process.exit(1);
    }
    const client = new VoyageAIClient({ apiKey: apiKey });
    const files = (await readdir(CORPUS)).filter((f) => f.endsWith(".md"));
    const chunks: Chunk[] = [];
    for (const file of files.sort()) {
        const raw = await readFile(path.join(CORPUS, file), 'utf-8');
        chunks.push(...chunkMarkdown(file, raw));
    }
    console.log(`Chunked ${files.length} docs into ${chunks.length} chunks`);

    const res = await client.embed({
        input: chunks.map((c) => c.text),
        model: EMBEDDING_MODEL,
        inputType: "document",
    });

    const data = res.data ?? [];
    if (data.length !== chunks.length) {
        throw new Error(`Embedding mismatch: sent ${chunks.length}, got ${data.length}`);
    }

    const embedded: EmbeddedChunk[] = chunks.map((chunk, i) => {
        const vector = data[i]?.embedding;
        if (!vector) throw new Error(`Missing embedding for chunk ${chunk.id}`);
        return { ...chunk, vector };
    });

    const index: EmbeddingIndex = {
        model: EMBEDDING_MODEL,
        createdAt: new Date().toISOString(),
        chunks: embedded
    };
    await writeFile(INDEX_PATH, JSON.stringify(index));
    const sizeKb = Math.round(JSON.stringify(index).length / 1024);
    console.log(`Wrote ${INDEX_PATH} (${sizeKb} KB, model=${EMBEDDING_MODEL})`);

}


main().catch((err) => {
    console.error(err);
    process.exit(1);
});