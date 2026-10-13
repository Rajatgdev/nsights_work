/**
 * Upload parser (build spec §5.1 / §5.2). Turns a real .xlsx workbook into the
 * `ParsedUpload` the validator consumes. Isolated from the validator so the
 * pure rules stay testable without Excel.
 *
 * Template (§5.1):
 *   Sheet `Prices`: col A header = "Date", then one column per fund with
 *     header = platform-internal fund code. Each row below = one month.
 *   Sheet `Funds`:  one row per fund with the facts columns (see FUND_COLUMNS).
 *
 * Date convention (§5.2 DECISION): any date in the month is accepted and
 * normalised to the month-end valuation date (YYYY-MM-DD). Leading blank price
 * cells (pre-launch) stay null — never 1 (prototype bug).
 *
 * Structural problems (missing sheet / missing "Date" header / no fund columns)
 * throw ParseError: the file cannot be interpreted, so it is a hard stop before
 * row-level validation. Everything the validator can describe as an issue
 * (non-numeric cells, etc.) is passed through, not thrown.
 */
import ExcelJS from 'exceljs';
import type { ParsedUpload, UploadFundRow } from './types.js';

export class ParseError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
  }
}

/** Normalise any date in a month to the month-end ISO date (UTC). */
export function monthEnd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-based
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

/** Coerce a Prices-sheet date cell to a JS Date, or null if unreadable. */
function toDate(value: ExcelJS.CellValue): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    // Excel serial date (days since 1899-12-30), UTC.
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Read a price cell. Clean numeric → number. Blank → null. Anything else
 * (text, error) → passed through as the raw value so the validator can raise
 * `non_numeric_price`. Typed loosely on purpose; `prices` is `(number|null)[]`
 * at the interface but the validator inspects runtime type.
 */
function toPrice(value: ExcelJS.CellValue): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isNaN(value) ? (value as unknown as number) : value;
  if (typeof value === 'object' && value !== null && 'result' in value) {
    // formula cell: use its computed result
    const r = (value as ExcelJS.CellFormulaValue).result;
    if (typeof r === 'number') return r;
    return (r as unknown as number) ?? null;
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isNaN(n) ? (s as unknown as number) : n;
  }
  return value as unknown as number;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'result' in value) return cellText((value as ExcelJS.CellFormulaValue).result ?? null);
  if (typeof value === 'object' && 'richText' in value) {
    return (value as ExcelJS.CellRichTextValue).richText.map((rt) => rt.text).join('').trim();
  }
  if (typeof value === 'object' && 'hyperlink' in value) {
    return cellText((value as ExcelJS.CellHyperlinkValue).text ?? null);
  }
  return String(value).trim();
}

function toBool(value: ExcelJS.CellValue): boolean | undefined {
  const t = cellText(value).toLowerCase();
  if (t === '') return undefined;
  return t === 'y' || t === 'yes' || t === 'true' || t === '1';
}

function toNum(value: ExcelJS.CellValue): number | undefined {
  if (value == null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(cellText(value));
  return Number.isNaN(n) ? undefined : n;
}

/** Canonical Funds-sheet header → UploadFundRow key. Matched case-insensitively. */
const FUND_COLUMNS: Record<string, keyof UploadFundRow> = {
  code: 'code',
  name: 'name',
  provider: 'provider',
  asset_class: 'assetClass',
  category: 'category',
  launch_date: 'launchDate',
  risk_rating: 'riskRating',
  ongoing_charge_pct: 'ongoingChargePct',
  amc_pct: 'amcPct',
  manager: 'manager',
  style: 'style',
  region: 'region',
  risk_controlled: 'riskControlled',
  sfdr_article: 'sfdrArticle',
  description: 'description',
  closed: 'closed',
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_');
}

function parseFundsSheet(ws: ExcelJS.Worksheet): UploadFundRow[] {
  const headerRow = ws.getRow(1);
  const colKey: Record<number, keyof UploadFundRow> = {};
  headerRow.eachCell((cell, col) => {
    const key = FUND_COLUMNS[normHeader(cellText(cell.value))];
    if (key) colKey[col] = key;
  });
  if (!Object.values(colKey).includes('code')) {
    throw new ParseError('funds_header_missing', 'Funds sheet is missing a "code" column.');
  }

  const funds: UploadFundRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rec: Partial<UploadFundRow> = {};
    let empty = true;
    const numKeys = new Set<keyof UploadFundRow>(['riskRating', 'ongoingChargePct', 'amcPct', 'sfdrArticle']);
    const boolKeys = new Set<keyof UploadFundRow>(['riskControlled', 'closed']);
    for (const [colStr, key] of Object.entries(colKey)) {
      const col = Number(colStr);
      const raw = row.getCell(col).value;
      if (raw != null && cellText(raw) !== '') empty = false;
      if (numKeys.has(key)) {
        Object.assign(rec, { [key]: toNum(raw) });
      } else if (boolKeys.has(key)) {
        Object.assign(rec, { [key]: toBool(raw) });
      } else {
        Object.assign(rec, { [key]: cellText(raw) || undefined });
      }
    }
    if (empty || !rec.code) continue;
    funds.push({
      code: rec.code,
      name: rec.name ?? '',
      provider: rec.provider ?? '',
      assetClass: rec.assetClass ?? '',
      category: rec.category,
      launchDate: rec.launchDate,
      riskRating: rec.riskRating,
      ongoingChargePct: rec.ongoingChargePct,
      amcPct: rec.amcPct,
      manager: rec.manager,
      style: rec.style,
      region: rec.region,
      riskControlled: rec.riskControlled,
      sfdrArticle: rec.sfdrArticle,
      description: rec.description,
      closed: rec.closed,
    });
  }
  return funds;
}

function parsePricesSheet(ws: ExcelJS.Worksheet): {
  dates: string[];
  prices: Record<string, (number | null)[]>;
} {
  const headerRow = ws.getRow(1);
  const firstHeader = normHeader(cellText(headerRow.getCell(1).value));
  if (firstHeader !== 'date') {
    throw new ParseError('prices_header_missing', 'Prices sheet column A header must be "Date".');
  }

  // Fund code columns = every non-empty header from column 2 onward.
  const codeByCol: { col: number; code: string }[] = [];
  const seen = new Set<string>();
  headerRow.eachCell((cell, col) => {
    if (col === 1) return;
    const code = cellText(cell.value);
    if (!code) return;
    if (seen.has(code)) throw new ParseError('duplicate_fund_column', `Prices sheet has duplicate fund column "${code}".`);
    seen.add(code);
    codeByCol.push({ col, code });
  });
  if (codeByCol.length === 0) {
    throw new ParseError('no_fund_columns', 'Prices sheet has no fund columns after the Date column.');
  }

  const dates: string[] = [];
  const prices: Record<string, (number | null)[]> = {};
  for (const { code } of codeByCol) prices[code] = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const dateCell = row.getCell(1).value;
    const d = toDate(dateCell);
    // A row with no date but no data either is just trailing padding — skip it.
    if (d == null) {
      const anyData = codeByCol.some(({ col }) => {
        const v = row.getCell(col).value;
        return v != null && v !== '';
      });
      if (!anyData) continue;
      throw new ParseError('unreadable_date', `Prices row ${r} has data but an unreadable date cell.`);
    }
    dates.push(monthEnd(d));
    for (const { col, code } of codeByCol) {
      prices[code]!.push(toPrice(row.getCell(col).value));
    }
  }

  return { dates, prices };
}

/** Parse a workbook (from a Buffer) into a ParsedUpload. */
export async function parseUploadBuffer(buffer: Buffer | ArrayBuffer): Promise<ParsedUpload> {
  const wb = new ExcelJS.Workbook();
  // exceljs accepts a Buffer; ArrayBuffer is wrapped for safety.
  const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer;
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);

  const pricesWs = wb.getWorksheet('Prices');
  if (!pricesWs) throw new ParseError('sheet_missing', 'Workbook is missing the "Prices" sheet.');
  const fundsWs = wb.getWorksheet('Funds');
  if (!fundsWs) throw new ParseError('sheet_missing', 'Workbook is missing the "Funds" sheet.');

  const { dates, prices } = parsePricesSheet(pricesWs);
  const funds = parseFundsSheet(fundsWs);

  return { dates, prices, funds };
}