/**
 * Fallback Anthropic public list pricing, used ONLY when a Cursor usage event
 * doesn't already carry a computed cost (`tokenUsage.totalCents`). Cursor
 * normally computes cost itself (public list price + Cursor Token Rate) even
 * for BYOK requests, so this table is a safety net, not the primary source.
 *
 * Prices are USD per million tokens. Keep this list short and match Cursor's
 * model id by substring, since Cursor's ids (e.g. "claude-4.6-sonnet-thinking")
 * don't line up 1:1 with Anthropic's API model ids.
 *
 * Source: https://platform.claude.com/docs/en/about-claude/pricing (update
 * this table if Anthropic changes pricing).
 */
interface ModelRate {
  match: RegExp;
  inputPerM: number;
  outputPerM: number;
  cacheWritePerM: number;
  cacheReadPerM: number;
}

const RATES: ModelRate[] = [
  {
    match: /gemini-3\.5-flash/i,
    inputPerM: 1.5,
    outputPerM: 9.0,
    cacheWritePerM: 1.0,
    cacheReadPerM: 0.15,
  },
  {
    match: /gemini-3\.1-pro/i,
    inputPerM: 2.0,
    outputPerM: 12.0,
    cacheWritePerM: 4.5,
    cacheReadPerM: 0.2,
  },
  {
    match: /gemini-3-flash/i,
    inputPerM: 0.5,
    outputPerM: 3.0,
    cacheWritePerM: 1.0,
    cacheReadPerM: 0.05,
  },
  {
    match: /gemini/i,
    inputPerM: 1.5,
    outputPerM: 9.0,
    cacheWritePerM: 1.0,
    cacheReadPerM: 0.15,
  },
  {
    match: /sonnet-5/i,
    inputPerM: 2,
    outputPerM: 10,
    cacheWritePerM: 2.5,
    cacheReadPerM: 0.2,
  },
  {
    match: /opus/i,
    inputPerM: 5,
    outputPerM: 25,
    cacheWritePerM: 6.25,
    cacheReadPerM: 0.5,
  },
  {
    match: /sonnet/i,
    inputPerM: 3,
    outputPerM: 15,
    cacheWritePerM: 3.75,
    cacheReadPerM: 0.3,
  },
  {
    match: /haiku/i,
    inputPerM: 1,
    outputPerM: 5,
    cacheWritePerM: 1.25,
    cacheReadPerM: 0.1,
  },
];

// Reasonable default if a Claude model doesn't match any known family.
const DEFAULT_RATE: ModelRate = RATES[1];

export function findRate(model: string): ModelRate {
  return RATES.find((r) => r.match.test(model)) ?? DEFAULT_RATE;
}

export function isClaudeModel(model: string): boolean {
  return /claude|gemini/i.test(model) || RATES.some((r) => r.match.test(model));
}

/**
 * Estimate cost in cents from raw token counts using public list pricing.
 */
export function estimateCostCents(
  model: string,
  tokens: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
  }
): number {
  const rate = findRate(model);
  const dollars =
    (tokens.inputTokens / 1_000_000) * rate.inputPerM +
    (tokens.outputTokens / 1_000_000) * rate.outputPerM +
    (tokens.cacheWriteTokens / 1_000_000) * rate.cacheWritePerM +
    (tokens.cacheReadTokens / 1_000_000) * rate.cacheReadPerM;
  return dollars * 100;
}
