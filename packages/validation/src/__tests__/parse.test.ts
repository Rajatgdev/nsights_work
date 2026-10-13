/**
 * Parser suite (build spec §5.1 / §5.2). Builds real .xlsx workbooks in memory
 * with exceljs, writes them to a Buffer, and parses them back — exercising the
 * same code path the worker uses on an uploaded file.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseUploadBuffer, ParseError, monthEnd } from '../parse.js';
import { validateUpload } from '../validate.js';
import type { LiveSnapshot } from '../types.js';

type PriceRow = [string | Date | number, ...(number | string | null)[]];

/** Build a workbook Buffer from Prices + Funds sheet definitions. */
async function makeXlsx(opts: {
  pricesHeader?: (string | null)[]; // row 1 of Prices; default ['Date','AAA','BBB']
  priceRows?: PriceRow[];
  fundsHeader?: string[];
  fundRows?: (string | number | null)[][];
  omitPrices?: boolean;
  omitFunds?: boolean;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  if (!opts.omitPrices) {
    const ws = wb.addWorksheet('Prices');
    ws.addRow(opts.pricesHeader ?? ['Date', 'AAA', 'BBB']);
    for (const row of opts.priceRows ?? []) ws.addRow(row as unknown[]);
  }
  if (!opts.omitFunds) {
    const ws = wb.addWorksheet('Funds');
    ws.addRow(
      opts.fundsHeader ?? [
        'code', 'name', 'provider', 'asset_class', 'risk_rating',
        'ongoing_charge_pct', 'amc_pct', 'closed',
      ],
    );
    for (const row of opts.fundRows ?? [
      ['AAA', 'Alpha Fund', 'Zurich', 'Multi-Asset', 4, 0.75, 0.5, 'N'],
      ['BBB', 'Beta Fund', 'Aviva', 'Equity', 5, 1.1, 0.85, 'N'],
    ]) {
      ws.addRow(row as unknown[]);
    }
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

const emptyLive: LiveSnapshot = { dates: [], prices: {}, liveCodes: [], closedCodes: [] };

describe('monthEnd', () => {
  it('normalises a start-of-month date to month-end', () => {
    expect(monthEnd(new Date('2025-02-01'))).toBe('2025-02-28');
    expect(monthEnd(new Date('2024-02-10'))).toBe('2024-02-29'); // leap year
    expect(monthEnd(new Date('2025-12-15'))).toBe('2025-12-31');
  });
});

describe('parseUploadBuffer', () => {
  it('parses a clean workbook into dates + price columns + funds', async () => {
    const buf = await makeXlsx({
      priceRows: [
        ['2025-01-01', 100, 50],
        ['2025-02-01', 101, 50.5],
        ['2025-03-01', 102, 51],
      ],
    });
    const up = await parseUploadBuffer(buf);

    expect(up.dates).toEqual(['2025-01-31', '2025-02-28', '2025-03-31']);
    expect(up.prices.AAA).toEqual([100, 101, 102]);
    expect(up.prices.BBB).toEqual([50, 50.5, 51]);
    expect(up.funds).toHaveLength(2);
    const aaa = up.funds.find((f) => f.code === 'AAA')!;
    expect(aaa.name).toBe('Alpha Fund');
    expect(aaa.riskRating).toBe(4);
    expect(aaa.amcPct).toBe(0.5);
    expect(aaa.closed).toBe(false);
  });

  it('keeps leading blanks as null (pre-launch), never 1', async () => {
    const buf = await makeXlsx({
      priceRows: [
        ['2025-01-01', null, 50],
        ['2025-02-01', null, 50.5],
        ['2025-03-01', 102, 51],
      ],
    });
    const up = await parseUploadBuffer(buf);
    expect(up.prices.AAA).toEqual([null, null, 102]);
  });

  it('reads Y/N flags and closed=Y', async () => {
    const buf = await makeXlsx({
      fundRows: [
        ['AAA', 'Alpha', 'Zurich', 'Multi-Asset', 4, 0.75, 0.5, 'Y'],
        ['BBB', 'Beta', 'Aviva', 'Equity', 5, 1.1, 0.85, 'n'],
      ],
      priceRows: [['2025-01-01', 100, 50]],
    });
    const up = await parseUploadBuffer(buf);
    expect(up.funds.find((f) => f.code === 'AAA')!.closed).toBe(true);
    expect(up.funds.find((f) => f.code === 'BBB')!.closed).toBe(false);
  });

  it('skips fully blank trailing rows', async () => {
    const buf = await makeXlsx({
      priceRows: [
        ['2025-01-01', 100, 50],
        ['2025-02-01', 101, 50.5],
        [null as unknown as string, null, null], // padding
      ],
    });
    const up = await parseUploadBuffer(buf);
    expect(up.dates).toHaveLength(2);
  });

  it('passes a non-numeric price cell through so the validator flags it', async () => {
    const buf = await makeXlsx({
      priceRows: [
        ['2025-01-01', 100, 50],
        ['2025-02-01', 'N/A', 50.5],
      ],
    });
    const up = await parseUploadBuffer(buf);
    const report = validateUpload(up, emptyLive);
    expect(report.errors.some((e) => e.code === 'non_numeric_price' && e.fundCode === 'AAA')).toBe(true);
  });

  it('round-trips through the validator cleanly for a good file', async () => {
    const buf = await makeXlsx({
      priceRows: [
        ['2025-01-01', 100, 50],
        ['2025-02-01', 101, 50.5],
        ['2025-03-01', 102, 51],
      ],
    });
    const up = await parseUploadBuffer(buf);
    const report = validateUpload(up, emptyLive);
    expect(report.errors).toHaveLength(0);
    expect(report.publishable).toBe(true);
  });

  it('throws ParseError when the Prices sheet is missing', async () => {
    const buf = await makeXlsx({ omitPrices: true });
    await expect(parseUploadBuffer(buf)).rejects.toMatchObject({
      name: 'ParseError',
      code: 'sheet_missing',
    });
  });

  it('throws ParseError when the Funds sheet is missing', async () => {
    const buf = await makeXlsx({ omitFunds: true, priceRows: [['2025-01-01', 100, 50]] });
    await expect(parseUploadBuffer(buf)).rejects.toMatchObject({
      name: 'ParseError',
      code: 'sheet_missing',
    });
  });

  it('throws when column A header is not "Date"', async () => {
    const buf = await makeXlsx({
      pricesHeader: ['Month', 'AAA', 'BBB'],
      priceRows: [['2025-01-01', 100, 50]],
    });
    await expect(parseUploadBuffer(buf)).rejects.toMatchObject({ code: 'prices_header_missing' });
  });

  it('throws when there are no fund columns', async () => {
    const buf = await makeXlsx({
      pricesHeader: ['Date'],
      priceRows: [['2025-01-01']],
    });
    await expect(parseUploadBuffer(buf)).rejects.toMatchObject({ code: 'no_fund_columns' });
  });

  it('throws on a duplicate fund column', async () => {
    const buf = await makeXlsx({
      pricesHeader: ['Date', 'AAA', 'AAA'],
      priceRows: [['2025-01-01', 100, 101]],
    });
    await expect(parseUploadBuffer(buf)).rejects.toMatchObject({ code: 'duplicate_fund_column' });
  });

  it('throws when a data row has an unreadable date', async () => {
    const buf = await makeXlsx({
      priceRows: [
        ['2025-01-01', 100, 50],
        ['not-a-date', 101, 50.5],
      ],
    });
    await expect(parseUploadBuffer(buf)).rejects.toMatchObject({ code: 'unreadable_date' });
  });

  it('is case-insensitive and space-tolerant on Funds headers', async () => {
    const buf = await makeXlsx({
      fundsHeader: ['Code', 'Name', 'Provider', 'Asset Class', 'Risk Rating'],
      fundRows: [['AAA', 'Alpha', 'Zurich', 'Multi-Asset', 4]],
      priceRows: [['2025-01-01', 100, 50]],
    });
    const up = await parseUploadBuffer(buf);
    const aaa = up.funds.find((f) => f.code === 'AAA')!;
    expect(aaa.assetClass).toBe('Multi-Asset');
    expect(aaa.riskRating).toBe(4);
  });
});