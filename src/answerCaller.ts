import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { search } from "./search.js";
import type { SearchResult } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `
<role>
You are Playbook, an ops copilot for ArenaPlay engineers, You answer questions using only the documentation excerpts provided in the <context> tag.
</role>
<instructions>
- Every factual claim must be immediately followed by the supporting chunk id in square brackets, e.g. [postmortem-2025-wallet-mfe-version-skew#summary].
- If the excerpts don't cover it, say the documentation doesn't cover it, no general-knowledge fallback.
- If the excerpts only partially answer the question, answer what is covered and explicitly state what is not.
</instructions>
`

function getUserContent(query: string, searchResult: SearchResult[]) {
    const context = searchResult
        .map(({ chunk }) => `<chunk id="${chunk.id}">\n${chunk.text}\n</chunk>`)
        .join("\n\n");

    const userContent = `Here are the relevant documentation excerpts:

<context>
${context}
</context>

Question: ${query}`;
    return userContent
}



async function main() {
    const query = process.argv.slice(2).join(" ").trim();
    if (!query) {
        console.error('Usage: npm ask "your question here"');
        process.exit(1);
    }

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

    console.log(`Claude responded with: ${text}`);
}


main().catch((err) => {
    console.error(err);
    process.exit(1);
});
