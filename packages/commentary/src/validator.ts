/**
 * Commentary numbers-validator + banned-phrase check (spec §8.4).
 * Pure logic — no AI dependency. If validation fails, the caller uses the
 * chart's deterministic fallback() sentence instead.
 */
import { COMMENTARY_BANNED_PHRASES, COMMENTARY_MAX_CHARS } from '@nsights/shared';

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
}

/** Extract every number (incl. percentages, negatives, decimals) from text. */
export function extractNumbers(text: string): number[] {
  const matches = text.match(/-?\d+(?:\.\d+)?/g) ?? [];
  return matches.map(Number).filter((n) => !Number.isNaN(n));
}

/**
 * Validate generated commentary against the allowed facts.
 * Every number in the text must match a facts value after normalisation
 * (tolerance ±0.05, to absorb display rounding).
 */
export function validateCommentary(
  text: string,
  facts: Record<string, number | string>,
  opts: { tolerance?: number } = {},
): ValidationResult {
  const reasons: string[] = [];
  const tol = opts.tolerance ?? 0.05;

  if (text.length > COMMENTARY_MAX_CHARS) {
    reasons.push(`length ${text.length} > ${COMMENTARY_MAX_CHARS}`);
  }

  const lower = text.toLowerCase();
  for (const phrase of COMMENTARY_BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) reasons.push(`banned phrase: "${phrase}"`);
  }

  const allowed = Object.values(facts)
    .filter((v): v is number => typeof v === 'number')
    .flatMap((v) => [v, Math.abs(v)]); // allow sign-stripped mention

  for (const n of extractNumbers(text)) {
    const matched = allowed.some((a) => Math.abs(a - n) <= tol || Math.abs(Math.abs(a) - Math.abs(n)) <= tol);
    if (!matched) reasons.push(`number ${n} not in allowed facts`);
  }

  return { ok: reasons.length === 0, reasons };
}
