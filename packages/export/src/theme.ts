/**
 * Theme tokens shared by screen preview, PPTX masters, and chart palettes
 * (spec §9). Three templates: Boardroom, Editorial, Monoline.
 */
import type { TemplateId } from '@nsights/shared';

export interface ThemeTokens {
  id: TemplateId;
  name: string;
  bg: string;
  text: string;
  accent: string;
  band: string;
  titleFont: string;
  bodyFont: string;
  palette: string[]; // 8 series colours
}

const PALETTE_8 = [
  '#16a394',
  '#1f64c4',
  '#caa023',
  '#2e8b57',
  '#6a4fb3',
  '#2a4a73',
  '#c0532b',
  '#5b6670',
];

export const THEMES: Record<TemplateId, ThemeTokens> = {
  boardroom: {
    id: 'boardroom',
    name: 'Boardroom',
    bg: '#ffffff',
    text: '#0f1b2d',
    accent: '#16a394',
    band: '#0f1b2d',
    titleFont: 'Inter',
    bodyFont: 'Inter',
    palette: PALETTE_8,
  },
  editorial: {
    id: 'editorial',
    name: 'Editorial',
    bg: '#faf6ef',
    text: '#2b2621',
    accent: '#b4532a',
    band: '#2b2621',
    titleFont: 'Georgia',
    bodyFont: 'Inter',
    palette: PALETTE_8,
  },
  monoline: {
    id: 'monoline',
    name: 'Monoline',
    bg: '#ffffff',
    text: '#1a1a1a',
    accent: '#1a1a1a',
    band: '#ffffff',
    titleFont: 'Inter',
    bodyFont: 'Inter',
    palette: PALETTE_8,
  },
};
