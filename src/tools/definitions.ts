import type Anthropic from "@anthropic-ai/sdk";

// Tool descriptions are prompts: Claude decides WHETHER and WHEN to call a
// tool almost entirely from the description. Each one states what the tool
// returns, when to use it, and — just as important — when NOT to.
// Enums make invalid inputs unrepresentable at the schema level (same
// make-invalid-states-unreachable move as deterministic chunk ids).

const SERVICES = [
  "matchmaking",
  "wallet",
  "session-gateway",
  "bff",
  "cdn",
  "payout-orchestrator",
] as const;

const TEAMS = ["web-platform", "payments", "game-services", "risk"] as const;

const SEVERITIES = ["SEV-1", "SEV-2", "SEV-3"] as const;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_service_status",
    description:
      "Returns the CURRENT operational status of an ArenaPlay production service: " +
      "status (healthy/degraded/down), p99 latency in milliseconds, and any active " +
      "operator note. Use this when the user asks about present-tense state — " +
      "whether something is up, slow, or broken right now. Do NOT use it for " +
      "historical incidents, past outages, or how-to questions; those are answered " +
      "from the documentation excerpts.",
    input_schema: {
      type: "object",
      properties: {
        service: {
          type: "string",
          enum: [...SERVICES],
          description: "The service to check.",
        },
      },
      required: ["service"],
    },
  },
  {
    name: "get_oncall",
    description:
      "Returns the current on-call engineer for an ArenaPlay team: name and Slack " +
      "handle. Use this when the user asks who is on call, who to contact, page, " +
      "or escalate to for a team. Team ownership of services and escalation POLICY " +
      "(who should be paged for what, severity rules) live in the documentation — " +
      "use this tool only to resolve the current human on the rotation.",
    input_schema: {
      type: "object",
      properties: {
        team: {
          type: "string",
          enum: [...TEAMS],
          description: "The team whose on-call rotation to look up.",
        },
      },
      required: ["team"],
    },
  },
  {
    name: "create_incident",
    description:
      "Creates a new incident ticket in the ArenaPlay incident tracker and returns " +
      "its id. Use this ONLY when the user explicitly asks to open, create, file, " +
      "or raise an incident. Never create an incident merely because a service " +
      "looks degraded — surfacing the degradation and suggesting an incident is " +
      "the correct behavior; creating one uninvited is not. Severity definitions " +
      "(SEV-1/2/3 criteria) are in the incident management documentation; if the " +
      "user did not specify a severity, ask rather than guess.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Short, specific incident title, e.g. 'Matchmaking queue wait times elevated'.",
        },
        severity: {
          type: "string",
          enum: [...SEVERITIES],
          description: "Incident severity per ArenaPlay definitions.",
        },
        service: {
          type: "string",
          enum: [...SERVICES],
          description: "The primarily affected service.",
        },
      },
      required: ["title", "severity", "service"],
    },
  },
];