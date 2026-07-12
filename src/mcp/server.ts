import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
    getServiceStatus,
    getOncall,
    createIncident,
} from "../tools/mock-ops.js";
import { log } from "../log.js";
import { SERVICES, SEVERITIES, TEAMS } from "../tools/definitions.js";
import type { IncidentInput } from "../tools/mock-ops.js";
import { search } from "../search.js";
import { answer } from "../answer.js";

const NAME = "playbook";
const DESCRIPTION =
    "This server exposes key functionality of playbook for clients";

const server = new McpServer({
    version: "0.1.0",
    name: NAME,
    description: DESCRIPTION,
});

server.registerTool(
    "get_service_status",
    {
        description:
            "Returns the CURRENT operational status of an ArenaPlay production service: " +
            "status (healthy/degraded/down), p99 latency in milliseconds, and any active " +
            "operator note. Use this when the user asks about present-tense state — " +
            "whether something is up, slow, or broken right now. Do NOT use it for " +
            "historical incidents, past outages, or how-to questions; those are answered " +
            "from the documentation excerpts.",
        inputSchema: z.object({
            service: z.enum([...SERVICES]),
        }),
    },
    async ({ service }) => {
        const result = getServiceStatus(service);
        return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
    },
);

server.registerTool(
    "get_oncall",
    {
        description:
            "Returns the current on-call engineer for an ArenaPlay team: name and Slack " +
            "handle. Use this when the user asks who is on call, who to contact, page, " +
            "or escalate to for a team. Team ownership of services and escalation POLICY " +
            "(who should be paged for what, severity rules) live in the documentation — " +
            "use this tool only to resolve the current human on the rotation.",
        inputSchema: z.object({
            team: z.enum([...TEAMS]),
        }),
    },
    async ({ team }) => {
        const result = getOncall(team);
        return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
    },
);

server.registerTool(
    "create_incident",
    {
        description:
            "Creates a new incident ticket in the ArenaPlay incident tracker and returns " +
            "its id. Use this ONLY when the user explicitly asks to open, create, file, " +
            "or raise an incident. Never create an incident merely because a service " +
            "looks degraded — surfacing the degradation and suggesting an incident is " +
            "the correct behavior; creating one uninvited is not. Severity definitions " +
            "(SEV-1/2/3 criteria) are in the incident management documentation; if the " +
            "user did not specify a severity, ask rather than guess.",
        inputSchema: z.object({
            title: z.string(),
            severity: z.enum([...SEVERITIES]),
            service: z.enum([...SERVICES]),
        }),
    },
    async (input: IncidentInput) => {
        const result = createIncident(input);
        return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
    },
);

server.registerTool(
    "search_docs",
    {
        description:
            "Semantic search over ArenaPlay's operational documentation — runbooks, " +
            "ADRs, postmortems, and process docs. Returns matching chunks with stable " +
            "ids, doc titles, section names, and relevance scores. Use this for " +
            "historical incidents, how-to procedures, architecture decisions, and " +
            "policy questions. Do NOT use it for current service status — that comes " +
            "from get_service_status. When using a chunk's content in an answer, cite " +
            "its id, e.g. [runbook-cdn-cache-degradation#mitigation].",
        inputSchema: z.object({
            query: z.string(),
            topK: z.number().min(1).max(10).default(5)
        })
    },
    async ({ query, topK }) => {
        const results = await search(query, topK);
        const chunks = results.map(({ chunk, score }) => ({
            id: chunk.id,
            docTitle: chunk.docTitle,
            section: chunk.section,
            text: chunk.text,
            score: Number(score.toFixed(4)),
        }))
        return {
            content: [{ type: 'text' as const, text: JSON.stringify(chunks, null, 2) }]
        }

    }
)

server.registerTool(
    "ask_playbook",
    {
        description:
            "Runs a full retrieval-and-tools pipeline; may take up to 30 seconds " +
            "Complete assistant with grounded, cited answers; prefer this over composing "+
            "search_docs and the ops tools yourself unless you need raw access",
            
        inputSchema: z.object({
            question: z.string()
        })
    },
    async ({ question }) => {
        const { text, trace } = await answer(question);

        return {
            content: [
                { type: 'text' as const, text: text },
                { type: 'text' as const, text: "Tool calls made internally: " + JSON.stringify(trace) }
            ]
        }
    }
)

const transport = new StdioServerTransport();
await server.connect(transport);
log("mcp_server_started", { name: NAME });
