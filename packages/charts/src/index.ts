export * from './registry.js';
export * from './footnote.js';
export * from './_util.js';
export { CORE_CHARTS, type TableSpec } from './charts.js';
export { EXT_CHARTS } from './charts-ext.js';

import { registerChart } from './registry.js';
import { CORE_CHARTS } from './charts.js';
import { EXT_CHARTS } from './charts-ext.js';

// Register the full launch set on import so chartRegistry is populated.
for (const def of [...CORE_CHARTS, ...EXT_CHARTS]) registerChart(def);
