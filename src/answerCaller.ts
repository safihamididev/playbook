import { answer } from "./answer.js";

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Usage: npm run answer -- "your question here"');
    process.exit(1);
  }

  const { text, results, trace } = await answer(query);

  console.log(`\n${text}\n`);

  if (trace.length) {
    console.log("Tool calls:");
    console.dir(trace, { depth: null });
  }

  console.log("Retrieved chunks:");
  console.table(
    results.map((r) => ({ id: r.chunk.id, score: r.score.toFixed(4) }))
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});