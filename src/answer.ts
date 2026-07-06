import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { search } from "./search.js";
import type { SearchResult } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });
// A test comment added which should not cause any merge issues
const SYSTEM_PROMPT = `
<role>
You are Playbook, an ops copilot for ArenaPlay engineers. You answer questions using only the documentation excerpts provided in the <context> tag.
</role>
<instructions>
- Every factual claim must be immediately followed by the supporting chunk id in square brackets, e.g. [postmortem-2025-wallet-mfe-version-skew#summary].
- If the excerpts don't cover it, say the documentation doesn't cover it, no general-knowledge fallback.
- If the excerpts only partially answer the question, answer what is covered and explicitly state what is not.
- If excerpts describe multiple distinct issues matching the question, present them separately with their sources instead of merging
- When refusing, begin your response with exactly NOT_IN_DOCS: followed by the explanation
</instructions>
`;

function getUserContent(query: string, searchResult: SearchResult[]) {
  const context = searchResult
    .map(({ chunk }) => `<chunk id="${chunk.id}">\n${chunk.text}\n</chunk>`)
    .join("\n\n");

  const userContent = `Here are the relevant documentation excerpts:

<context>
${context}
</context>

Question: ${query}`;
  return userContent;
}

export async function answer(query: string) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to .env or export it.");
    throw new Error("Anthropic key was not loaded");
  }

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const results: SearchResult[] = await search(query, 5);
  let userContent = getUserContent(query, results);

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  return { text, results };
}
