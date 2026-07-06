import { search } from "./search.js";

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Usage: npm ask "your question here"');
    process.exit(1);
  }

  const results = await search(query, 5);
  for (const { chunk, score } of results) {
    console.log(`  ${score.toFixed(4)}  ${chunk.docTitle} > ${chunk.section}`);
    console.log(`  (${chunk.id})\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
