/**
 * Commentary generation prompt + schema (spec §8).
 * The actual Vertex AI call lives in the worker/API (regional EU endpoint,
 * logging disabled); this package owns the prompt text, output schema, and
 * cache-key derivation so they stay testable and provider-agnostic.
 */
import { z } from 'zod';

export const commentarySchema = z.object({ text: z.string() });
export type CommentaryOutput = z.infer<typeof commentarySchema>;

export const COMMENTARY_SYSTEM_PROMPT =
  'Write 2–3 neutral sentences describing only these figures. ' +
  'Use only numbers given. No advice, recommendations, predictions or ' +
  'comparisons not in the data. Irish English.';

export const COMMENTARY_TEMPERATURE = 0.2;

/** Build the user message from chart facts + fund names (nothing else — §8.1). */
export function buildCommentaryInput(
  facts: Record<string, number | string>,
  fundNames: string[],
): string {
  return JSON.stringify({ funds: fundNames, figures: facts });
}

/** Deterministic cache key (spec §8.6). */
export function commentaryCacheKey(input: {
  chartKey: string;
  fundIds: string[];
  portfolioHash?: string;
  versionId: string;
  compareMode: string;
}): string {
  const funds = [...input.fundIds].sort().join(',');
  return [
    input.chartKey,
    funds,
    input.portfolioHash ?? '-',
    input.versionId,
    input.compareMode,
  ].join('|');
}
