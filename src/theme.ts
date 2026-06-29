/**
 * Default themes (RESEARCH §1 color model). Up/down/border/wick are independent.
 * Palette mirrors common exchange dark/light defaults.
 */

import type { ChartTheme } from './types';

const UP = '#26a69a';
const DOWN = '#ef5350';

export const DARK_THEME: ChartTheme = {
  name: 'dark',
  background: '#131722',
  upColor: UP,
  downColor: DOWN,
  borderUpColor: UP,
  borderDownColor: DOWN,
  wickUpColor: UP,
  wickDownColor: DOWN,
  borderVisible: true,
  wickVisible: true,
  gridColor: '#1c2433',
  axisLineColor: '#2a2e39',
  axisTextColor: '#9598a1',
  fontSize: 11,
  crosshairColor: '#758696',
  crosshairLabelBackground: '#2a2e39',
  crosshairLabelText: '#d1d4dc',
  lastPriceUpColor: UP,
  lastPriceDownColor: DOWN,
  paneSeparatorColor: '#2a2e39',
};

export const LIGHT_THEME: ChartTheme = {
  name: 'light',
  background: '#ffffff',
  upColor: UP,
  downColor: DOWN,
  borderUpColor: UP,
  borderDownColor: DOWN,
  wickUpColor: UP,
  wickDownColor: DOWN,
  borderVisible: true,
  wickVisible: true,
  gridColor: '#f0f3fa',
  axisLineColor: '#e0e3eb',
  axisTextColor: '#131722',
  fontSize: 11,
  crosshairColor: '#9598a1',
  crosshairLabelBackground: '#131722',
  crosshairLabelText: '#ffffff',
  lastPriceUpColor: UP,
  lastPriceDownColor: DOWN,
  paneSeparatorColor: '#e0e3eb',
};
