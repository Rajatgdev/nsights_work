/**
 * Export forbidden-terms scan (spec §9). Fails the export if any price-source
 * name/code appears in the rendered text. Terms come from the DB
 * (forbidden_term), passed in so this stays pure.
 */
export function scanForbiddenTerms(texts: string[], terms: string[]): string[] {
  const hits = new Set<string>();
  const haystack = texts.join('\n').toLowerCase();
  for (const term of terms) {
    const t = term.trim();
    if (t && haystack.includes(t.toLowerCase())) hits.add(term);
  }
  return [...hits];
}
