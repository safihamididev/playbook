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

    const batches: Chunk[][] = [[]];
    let budget = 0;
    for (const c of chunks) {
      const t = estTokens(c.text);
      if (budget + t > BATCH_TOKEN_BUDGET && batches.at(-1)!.length > 0) {
        batches.push([]);
        budget = 0;
      }
      batches.at(-1)!.push(c);
      budget += t;
    }
    
    const data: { embedding?: number[] }[] = [];
    for (const [i, batch] of batches.entries()) {
      if (i > 0) await sleep(61_000);  // one batch per minute, both limits respected
      const res = await client.embed({
        input: batch.map((c) => c.text),
        model: EMBEDDING_MODEL,
        inputType: "document",
      });
      data.push(...(res.data ?? []));
      console.log(`Batch ${i + 1}/${batches.length} embedded`);
    }


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
    const json = JSON.stringify(index);
    await writeFile(INDEX_PATH, json);
    const sizeKb = Math.round(json.length / 1024);
    console.log(`Wrote ${INDEX_PATH} (${sizeKb} KB, model=${EMBEDDING_MODEL})`);

}


main().catch((err) => {
    console.error(err);
    process.exit(1);
});