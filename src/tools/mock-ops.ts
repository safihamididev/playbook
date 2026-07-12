// Mock ArenaPlay ops backend. The data is fake; the shapes are the contract.
// Tool results are a communication channel back to the model, so unknown
// inputs return articulate error objects, never undefined (see decision log).

export type Severity = "SEV-1" | "SEV-2" | "SEV-3";
export type ServiceName =
  | "matchmaking"
  | "wallet"
  | "session-gateway"
  | "bff"
  | "cdn"
  | "payout-orchestrator";

export interface ServiceStatus {
  service: ServiceName;
  status: "healthy" | "degraded" | "down";
  p99_ms: number;
  note: string;
}

export interface Oncall {
  team: string;
  primary: string;
  slack: string;
}

export interface IncidentInput {
  title: string;
  severity: Severity;
  service: ServiceName;
}

export interface Incident extends IncidentInput {
  id: string;
  created: string;
  status: "open";
}

export interface ToolError {
  error: string;
}

// One service is deliberately degraded — a healthy-everything mock makes
// every demo boring and gives tools+RAG nothing to collaborate on.
export const SERVICES: Record<ServiceName, ServiceStatus> = {
  matchmaking: {
    service: "matchmaking",
    status: "degraded",
    p99_ms: 2400,
    note: "Queue wait times elevated since 14:00 IST. Investigating.",
  },
  wallet: {
    service: "wallet",
    status: "healthy",
    p99_ms: 42,
    note: "Nominal.",
  },
  "session-gateway": {
    service: "session-gateway",
    status: "healthy",
    p99_ms: 18,
    note: "Nominal. 1.2M active connections.",
  },
  bff: {
    service: "bff",
    status: "healthy",
    p99_ms: 185,
    note: "Nominal.",
  },
  cdn: {
    service: "cdn",
    status: "healthy",
    p99_ms: 24,
    note: "Cache-hit ratio 94.1%.",
  },
  "payout-orchestrator": {
    service: "payout-orchestrator",
    status: "healthy",
    p99_ms: 310,
    note: "PSP-A 88% / PSP-B 12% routing weights. Nominal.",
  },
};

const ONCALL: Record<string, Oncall> = {
  "web-platform": {
    team: "web-platform",
    primary: "Priya Nair",
    slack: "@priya-oncall",
  },
  payments: {
    team: "payments",
    primary: "Arjun Mehta",
    slack: "@arjun-oncall",
  },
  "game-services": {
    team: "game-services",
    primary: "Sana Iqbal",
    slack: "@sana-oncall",
  },
  risk: {
    team: "risk",
    primary: "Dev Kulkarni",
    slack: "@dev-oncall",
  },
};

let incidentCounter = 1000;

export function getServiceStatus(service: string): ServiceStatus | ToolError {
  const status = SERVICES[service as ServiceName];
  if (!status) {
    return {
      error: `unknown service: "${service}". Known services: ${Object.keys(SERVICES).join(", ")}`,
    };
  }
  return status;
}

export function getOncall(team: string): Oncall | ToolError {
  const oncall = ONCALL[team];
  if (!oncall) {
    return {
      error: `unknown team: "${team}". Known teams: ${Object.keys(ONCALL).join(", ")}`,
    };
  }
  return oncall;
}

export function createIncident(input: IncidentInput): Incident | ToolError {
  if (!SERVICES[input.service]) {
    return {
      error: `unknown service: "${input.service}". Known services: ${Object.keys(SERVICES).join(", ")}`,
    };
  }
  incidentCounter += 1;
  return {
    id: `INC-${incidentCounter}`,
    ...input,
    created: new Date().toISOString(),
    status: "open",
  };
}