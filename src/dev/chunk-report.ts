import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chunkMarkdown } from "../chunk.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.resolve(here, "../../corpus");

const files = (await readdir(CORPUS)).filter((f) => f.endsWith(".md"));
let total = 0;
const sizes: number[] = [];

for (const f of files.sort()) {
  const chunks = chunkMarkdown(f, await readFile(path.join(CORPUS, f), "utf-8"));
  total += chunks.length;
  sizes.push(...chunks.map((c) => c.text.length));
  console.log(`${String(chunks.length).padStart(3)}  ${f}`);
}

sizes.sort((a, b) => a - b);
console.log(`\ndocs=${files.length} chunks=${total}`);
console.log(`chars: min=${sizes[0]} median=${sizes[Math.floor(sizes.length / 2)]} max=${sizes.at(-1)}`);