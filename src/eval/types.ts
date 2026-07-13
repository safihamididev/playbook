export interface EvalCase {
  id: string;
  query: string;
  expect: "answer" | "refusal";
  mustRetrieve?: string[];
  mustCallTools?: string[];
  mustNotCallTools?: string[];
  skipCitationChecks?: boolean;
  expectModel?: "haiku" | "sonnet";
  judge?: string;
  notes?: string;
}