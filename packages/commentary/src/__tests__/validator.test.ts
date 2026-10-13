import { describe, it, expect } from 'vitest';
import { validateCommentary, extractNumbers } from '../validator.js';

describe('commentary validator', () => {
  const facts = { ytd: 7.05, r5: 5.91, vol: 8.4 };

  it('passes when all numbers are in facts and tone is neutral', () => {
    const text = 'The fund returned 7.05% year to date. Five-year annualised return was 5.91% with volatility of 8.4%.';
    expect(validateCommentary(text, facts).ok).toBe(true);
  });

  it('fails on a number not present in facts', () => {
    const text = 'The fund returned 7.05% YTD and 99.9% over five years.';
    const res = validateCommentary(text, facts);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.includes('99.9'))).toBe(true);
  });

  it('fails on a banned phrase', () => {
    const text = 'This fund is risk-free and returned 7.05%.';
    const res = validateCommentary(text, facts);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.includes('risk-free'))).toBe(true);
  });

  it('extracts negatives and decimals', () => {
    expect(extractNumbers('down -14.56% then up 7.05%')).toEqual([-14.56, 7.05]);
  });
});
