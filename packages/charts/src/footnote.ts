import { LOCKED_DISCLAIMER } from '@nsights/shared';

/** Standard chart footnote (spec §7). */
export function standardFootnote(opts: {
  dataMonth: string;
  window?: string;
  grossOf?: string;
}): string {
  const parts = ['Figures from monthly unit prices'];
  if (opts.grossOf) parts.push(`gross of ${opts.grossOf}`);
  if (opts.window) parts.push(opts.window);
  return `${parts.join(', ')}. Data as at ${opts.dataMonth}. ${LOCKED_DISCLAIMER}`;
}
