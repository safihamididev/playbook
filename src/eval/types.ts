export interface EvalCase {
    id: string; // stable name, shows up in reports
    query: string; // what gets sent to answer()
    expect: "answer" | "refusal"; // drives the mode check via NOT_IN_DOCS:
    mustRetrieve?: string[]; // chunk ids that must appear in top-k
    mustCallTools?: string[]; // tool names that must appear in the trace
    mustNotCallTools?: string[]; // tool names that must NOT appear in the trace
    skipCitationChecks?: boolean;
    judge?: string; // criterion for the LLM judge, if needed
    notes?: string; // why this case exists — for humans
  }