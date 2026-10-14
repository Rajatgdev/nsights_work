export * from './registry.js';
export * from './footnote.js';
export * from './_util.js';
export { CORE_CHARTS, type TableSpec } from './charts.js';

import { registerChart } from './registry.js';
import { CORE_CHARTS } from './charts.js';

// Register the launch charts on import so chartRegistry is populated.
for (const def of CORE_CHARTS) registerChart(def);