// Rates in USD per million tokens, verified against Anthropic pricing docs
// 2026-07-12. Cache write = 1.25x input (5-min TTL); cache read = 0.1x input.

export interface ModelPrices {
    in: number; // base input, $/MTok
    out: number; // output, $/MTok
    cacheWrite: number; // 5-min cache write, $/MTok
    cacheRead: number; // cache hit, $/MTok
  }
  
  export const PRICES: Record<string, ModelPrices> = {
    "claude-haiku-4-5": { in: 1.0, out: 5.0, cacheWrite: 1.25, cacheRead: 0.1 },
    "claude-sonnet-4-6": { in: 3.0, out: 15.0, cacheWrite: 3.75, cacheRead: 0.3 },
  };
  
  export interface UsageLike {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  }
  
  export function costOf(model: string, usage: UsageLike): number {
    const p = PRICES[model];
    if (!p) {
      // Unknown model = pricing table is stale. Fail fast (007): a silently
      // uncosted call corrupts every aggregate downstream.
      throw new Error(`No pricing for model "${model}" — update src/pricing.ts`);
    }
    const cost =
      (usage.input_tokens * p.in +
        usage.output_tokens * p.out +
        (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite +
        (usage.cache_read_input_tokens ?? 0) * p.cacheRead) /
      1e6;
    return Number(cost.toFixed(8));
  }