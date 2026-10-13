/**
 * Shared zod schemas used across API in/out and the worker.
 * Kept minimal at scaffold stage; grow per route as endpoints are built.
 */
import { z } from 'zod';
import { COMPARE_MODES, TEMPLATE_IDS, CHART_KEYS } from './constants.js';

export const compareModeSchema = z.enum(COMPARE_MODES);
export const templateIdSchema = z.enum(TEMPLATE_IDS);
export const chartKeySchema = z.enum(CHART_KEYS);

export const chartDataRequestSchema = z.object({
  fundIds: z.array(z.string().uuid()).min(1),
  portfolioId: z.string().uuid().optional(),
  compareMode: compareModeSchema.default('common'),
  versionId: z.string().uuid().optional(),
});
export type ChartDataRequest = z.infer<typeof chartDataRequestSchema>;

export const exportRequestSchema = z.object({
  format: z.enum(['pptx', 'pdf']),
});
export type ExportRequest = z.infer<typeof exportRequestSchema>;

export const portfolioHoldingSchema = z.object({
  fundId: z.string().uuid(),
  weightBp: z.number().int().min(0).max(10_000),
  role: z.enum(['core', 'satellite']).nullable().optional(),
});

export const createPortfolioSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  kind: z.enum(['house', 'personal']),
  approach: z
    .enum(['core-satellite', 'equal-weighted', 'multi-manager', 'multi-strategy'])
    .optional(),
  rebalancing: z.enum(['monthly', 'buy-and-hold']).default('monthly'),
  holdings: z.array(portfolioHoldingSchema).default([]),
});
export type CreatePortfolio = z.infer<typeof createPortfolioSchema>;
