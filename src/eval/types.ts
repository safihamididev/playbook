export interface EvalCase {
    id: string;                    // stable name, shows up in reports
    query: string;                 // what gets sent to answer()
    expect: "answer" | "refusal";  // drives the mode check via NOT_IN_DOCS:
    mustRetrieve?: string[];       // chunk ids that must appear in top-k
    judge?: string;                // criterion for the LLM judge, if needed
    notes?: string;                // why this case exists — for humans
}