import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { search } from "./search.js";
import type { SearchResult } from "./types.js";
import { TOOLS } from "./tools/definitions.js";
import {
  createIncident,
  getOncall,
  getServiceStatus,
  type IncidentInput,
} from "./tools/mock-ops.js";
import { log } from "./log.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });

const MAX_TURNS = 8;
const MODEL = "claude-haiku-4-5";

// Prompt v4 — changelog:
// v4: tools merged into the answer path. Role names both sources; added
//     source-delimitation rule (docs = how-to/history/policy, tools =
//     current state/actions) and tool-claims-uncited rule.
const SYSTEM_PROMPT = `
<role>
You are Playbook, an ops copilot for ArenaPlay engineers. You answer questions using the documentation excerpts provided in the <context> tag and the operational tools available to you.
</role>
<instructions>
- Every factual claim from the documentation must be immediately followed by the supporting chunk id in square brackets, e.g. [postmortem-2025-wallet-mfe-version-skew#summary].
- Facts obtained from tools are stated plainly, with no chunk id brackets. Never attach a chunk id to a tool-derived fact.
- Use docs for how-to, history, and policy; tools for current state and actions; complete answers often combine both.
- If neither the excerpts nor the tools cover the question, say the documentation doesn't cover it. No general-knowledge fallback.
- If the excerpts only partially answer the question, answer what is covered and explicitly state what is not.
- If excerpts describe multiple distinct issues matching the question, present them separately with their sources instead of merging them.
- When refusing, begin your response with exactly NOT_IN_DOCS: followed by the explanation.
</instructions>
`;

function getUserContent(query: string, searchResult: SearchResult[]) {
  const context = searchResult
    .map(({ chunk }) => `<chunk id="${chunk.id}">\n${chunk.text}\n</chunk>`)
    .join("\n\n");

  return `Here are the relevant documentation excerpts:

<context>
${context}
</context>

Question: ${query}`;
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function runAgent(userContent: string) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages: Anthropic.MessageParam[] = [];
  messages.push({ role: "user", content: userContent });
  let iterations = 0;
  const trace: { name: string; input: unknown }[] = [];

  const textParts: string[] = [];

  while (true) {
    if (iterations++ >= MAX_TURNS)
      throw new Error("Agent exceeded max iterations");

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      tools: TOOLS,
      system: SYSTEM_PROMPT,
      messages,
    });

    const usage = msg.usage;
    log("llm_call", {
      MODEL,
      in: usage.cache_creation_input_tokens,
      out: usage.output_tokens,
      cache_write: usage.cache_creation_input_tokens ?? 0,
      cache_read: usage.cache_read_input_tokens ?? 0,
    });

    const turnText = extractText(msg.content);
    if (turnText.trim()) textParts.push(turnText.trim());

    if (msg.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: msg.content });
      const toolUses = msg.content.filter((c) => c.type === "tool_use");

      const toolResults = toolUses.map((tool) => {
        trace.push({ name: tool.name, input: tool.input });
        switch (tool.name) {
          case "get_service_status":
            return {
              type: "tool_result" as const,
              tool_use_id: tool.id,
              content: JSON.stringify(
                getServiceStatus((tool.input as { service: string }).service),
              ),
            };
          case "get_oncall":
            return {
              type: "tool_result" as const,
              tool_use_id: tool.id,
              content: JSON.stringify(
                getOncall((tool.input as { team: string }).team),
              ),
            };
          case "create_incident":
            return {
              type: "tool_result" as const,
              tool_use_id: tool.id,
              content: JSON.stringify(
                createIncident(tool.input as IncidentInput),
              ),
            };
          default: {
            return {
              type: "tool_result" as const,
              tool_use_id: tool.id,
              content: `Unknown tool: ${tool.name}`,
              is_error: true,
            };
          }
        }
      });

      messages.push({ role: "user", content: toolResults });
    } else {
      return { text: textParts.join("\n\n"), trace };
    }
  }
}

export async function answer(query: string) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to .env or export it.");
    throw new Error("Anthropic key was not loaded");
  }

  const results: SearchResult[] = await search(query, 5);
  const userContent = getUserContent(query, results);

  const { text, trace } = await runAgent(userContent);

  return { text, results, trace };
}
