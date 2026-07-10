import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { TOOLS } from "./definitions.js";
import {
  createIncident,
  getOncall,
  getServiceStatus,
  type IncidentInput,
} from "./mock-ops.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });

console.log()

const MAX_TURNS = 8;

const AGENT_SYSTEM_PROMPT = "";

async function runAgent(query: string) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to .env or export it.");
    throw new Error("Anthropic key was not loaded");
  }
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const messages: Anthropic.MessageParam[] = [];
  messages.push({ role: "user", content: query });
  let iterations = 0;
  const trace: { name: string; input: unknown}[] = [];

  while (true) {
    if (iterations++ >= MAX_TURNS)
      throw new Error("Agent exceeded max iterations");

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1000,
      tools: TOOLS,
      system: AGENT_SYSTEM_PROMPT,
      messages,
    });

    console.log("Token usage: ", msg.usage.input_tokens);

    if (msg.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: msg.content });
      const toolUses = msg.content.filter((c) => c.type === "tool_use");
      
      const toolResults = toolUses.map((tool) => {
        trace.push({ name: tool.name, input: tool.input })
        switch (tool.name) {
          case "get_service_status":
            return {
                type: "tool_result" as const,
                tool_use_id: tool.id,
                content: JSON.stringify(getServiceStatus((tool.input as { service: string }).service)),
              };
          case "get_oncall":
            return {
                type: "tool_result" as const,
                tool_use_id: tool.id,
                content: JSON.stringify(getOncall((tool.input as { team: string }).team)),
              };
          case "create_incident":
            return {
                type: "tool_result" as const,
                tool_use_id: tool.id,
                content: JSON.stringify(createIncident(tool.input as IncidentInput)),
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
      
      messages.push({ role: "user", content: toolResults});
    } else {
      const text = msg.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      return { text, trace}
    }
  }
}

async function main() {
    const query = process.argv.slice(2).join(" ").trim();
    if (!query) {
      console.error('Usage: npm agent "your question here"');
      process.exit(1);
    }
  
    const result = await runAgent(query);
    console.log('Result: ', result.text);
    console.dir(result.trace, {depth: null})
  }

main().catch((err) => {
    console.error(err);
    process.exit(1);
  });