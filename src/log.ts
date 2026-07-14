import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Repo-root logs/, NOT src/ — generated runtime data doesn't live in source.
const LOG_DIR = path.resolve(here, "../logs");
const LOG_PATH = path.join(LOG_DIR, "events.jsonl");

let warnedOnce = false;

/**
 * Structured event log. Two channels, two philosophies:
 * - stderr: the truth channel — synchronous, always succeeds, protocol-safe
 *   under MCP stdio (stdout carries frames; see decision 019).
 * - logs/events.jsonl: derived data for the cost dashboard — fail-soft
 *   (decision 014): a failed write warns once and never breaks a caller.
 *
 * Fire-and-forget by design: callers don't await; the rejection is caught
 * here so it can never become an unhandled rejection.
 */
export function log(event: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...data }) + "\n";
  process.stderr.write(line);

  void (async () => {
    try {
      await mkdir(LOG_DIR, { recursive: true });
      await appendFile(LOG_PATH, line);
    } catch (err) {
      if (!warnedOnce) {
        warnedOnce = true;
        process.stderr.write(
          JSON.stringify({ ts: new Date().toISOString(), event: "log_sink_failed", error: String(err) }) + "\n"
        );
      }
    }
  })();
}