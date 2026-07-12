import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { log } from "../log.js";
import { costOf } from "../pricing.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });

const MODEL = "claude-sonnet-4-6";

const JUDGE_SYSTEM_PROMPT = `
<role>
You are a strict QA evaluator for a RAG system. You are given a user question,
a response produced by the system under test, and one specific evaluation
criterion. Your only job is to decide whether the response violates that
criterion.
</role>
<instructions>
- Evaluate ONLY the given criterion. Do not grade style, completeness,
  formatting, or any other quality.
- Plausibility, confidence, and well-formatted citations are NOT evidence of
  correctness. Check the actual claims against the criterion.
- Be strict: if the response violates the criterion even partially or
  ambiguously, the verdict is FAIL.
- Your response MUST begin, on its first line, with exactly:
  VERDICT: PASS
  or
  VERDICT: FAIL
- After the verdict line, explain your reasoning in 1-3 sentences.
</instructions>
`;
export interface JudgeVerdict {
  pass: boolean;
  reason: string;
}

export async function judgeAnswer(
  query: string,
  answerText: string,
  criterion: string,
  runId: string,
): Promise<JudgeVerdict> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to .env or export it.");
    throw new Error("Anthropic key was not loaded");
  }
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const userContent = `
  <question>
    ${query}
  </question>

  <criterion>
    ${criterion}
  </criterion>

  <response_under_test>
    ${answerText}
  </response_under_test>`;

  const startTime = Date.now();

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: JUDGE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const usage = msg.usage;
  log("llm_call", {
    runId,
    model: MODEL,
    in: usage.input_tokens,
    out: usage.output_tokens,
    cache_write: usage.cache_creation_input_tokens ?? 0,
    cache_read: usage.cache_read_input_tokens ?? 0,
    latency_ms: Date.now() - startTime,
    cost_usd: costOf(MODEL, usage)
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const [firstLine = "", ...rest] = text.split("\n");
  const reason = rest.join("\n").trim();

  if (firstLine.trim() === "VERDICT: PASS") return { pass: true, reason };
  if (firstLine.trim() === "VERDICT: FAIL") return { pass: false, reason };
  throw new Error(
    `Judge returned malformed verdict. First line: "${firstLine}"`,
  );
}
