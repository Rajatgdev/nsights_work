/**
 * Seed loader (spec §12 milestone 2).
 *
 * Phase-1 plan: load the prototype dataset (72 funds × 159 months, 5 providers;
 * 6 MyFolio series flagged is_estimated, dev only) extracted from the standalone
 * HTML bundle's `dataset-default.js`. That extraction is a dedicated step — this
 * file is the entry point the pipeline calls once the dataset JSON exists at
 * ./data/dataset-default.json.
 *
 * Run: pnpm --filter @nsights/db seed
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  const datasetPath = resolve(import.meta.dirname, '../../data/dataset-default.json');
  if (!existsSync(datasetPath)) {
    console.log(
      '[seed] dataset-default.json not found.\n' +
        '       Extract it from the prototype bundle first (see docs/EXTRACT_DATASET.md),\n' +
        '       then re-run the seed. Scaffold stage: nothing to seed yet.',
    );
    return;
  }
  // TODO: parse dataset, insert provider/fund/data_version/fund_price/fund_fact_version,
  //       enqueue recalculate to build fund_metric, flip live pointer.
  console.log('[seed] dataset found — loader not yet implemented (milestone 2).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
