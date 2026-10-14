/**
 * DEV: build a realistic upload xlsx from the seeded dataset.
 * Lives in packages/validation so Node resolves exceljs locally.
 * Run from anywhere:
 *   node packages/validation/gen-upload.mjs
 * Output: <repo-root>/real-upload.xlsx
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..'); // repo root

const ds = JSON.parse(
  readFileSync(resolve(ROOT, 'packages/db/data/dataset-default.json'), 'utf8'),
);

const funds = ds.funds.filter((f) => !f.est);
const dates = [...ds.dates];

const last = new Date(dates[dates.length - 1]);
const next = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1));
const nextIso = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
dates.push(nextIso);

const wb = new ExcelJS.Workbook();

const prices = wb.addWorksheet('Prices');
prices.addRow(['Date', ...funds.map((f) => f.id)]);
dates.forEach((d, i) => {
  const row = [d];
  for (const f of funds) {
    if (i < f.prices.length) {
      row.push(f.prices[i] ?? null);
    } else {
      let lastPrice = null;
      for (let k = f.prices.length - 1; k >= 0; k--) {
        if (f.prices[k] != null) { lastPrice = f.prices[k]; break; }
      }
      row.push(lastPrice == null ? null : Math.round(lastPrice * 1.004 * 1e6) / 1e6);
    }
  }
  prices.addRow(row);
});

const fundsWs = wb.addWorksheet('Funds');
fundsWs.addRow(['code', 'name', 'provider', 'asset_class', 'category', 'risk_rating', 'amc_pct', 'closed']);
for (const f of funds) {
  fundsWs.addRow([f.id, f.name, f.provider, f.cls, f.category, f.risk ?? null, f.amc ?? null, 'N']);
}

await wb.xlsx.writeFile(resolve(ROOT, 'real-upload.xlsx'));
console.log(`written real-upload.xlsx: ${funds.length} funds, ${dates.length} months (new month ${nextIso})`);