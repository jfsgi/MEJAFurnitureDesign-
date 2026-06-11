// Unit-aware length parsing/formatting per UI standard §6 ("Dimension input").
// Internal storage is always millimeters. Imperial display is fractional inches to 1/32".

import type { Units } from './types';

export const MM_PER_INCH = 25.4;
export const inch = (v: number): number => v * MM_PER_INCH;

/** Arrow-key step in mm: 1/16" imperial, 1mm metric. Alt = fine (1/64" / 0.1mm). */
export function stepMM(units: Units, fine = false): number {
  if (units === 'imperial') return fine ? MM_PER_INCH / 64 : MM_PER_INCH / 16;
  return fine ? 0.1 : 1;
}

/** Move/placement snap grid in mm: 1/2" imperial, 10mm metric. */
export function snapGridMM(units: Units): number {
  return units === 'imperial' ? MM_PER_INCH / 2 : 10;
}

export function snapMM(v: number, units: Units): number {
  const g = snapGridMM(units);
  return Math.round(v / g) * g;
}

/** `3/4`, `1-1/2`, `1 1/2`, `0.75` → number (unitless). Returns null when unparseable. */
function parseNumberMaybeFraction(s: string): number | null {
  s = s.trim();
  const mixed = s.match(/^(-?\d+)[\s-]+(\d+)\/(\d+)$/);
  if (mixed) {
    const sign = mixed[1].startsWith('-') ? -1 : 1;
    return +mixed[1] + sign * (+mixed[2] / +mixed[3]);
  }
  const frac = s.match(/^(-?\d+)\/(\d+)$/);
  if (frac && +frac[2] !== 0) return +frac[1] / +frac[2];
  if (/^-?\d*\.?\d+$/.test(s)) return parseFloat(s);
  return null;
}

/**
 * Parse a user-entered length into mm.
 * Accepts: `3/4`, `1-1/2`, `1 1/2"`, `0.75in`, `19mm`, `1.5cm`, `0.5m`, `2'6"`, `36`.
 * Bare numbers take the project units. Returns null when unparseable.
 */
export function parseLength(raw: string, units: Units): number | null {
  const s = raw.trim().toLowerCase().replace(/[″”]/g, '"').replace(/[′’]/g, "'");
  if (!s) return null;

  // Feet (optionally with inches): 2'  /  2'6"  /  2' 6-1/2"
  const ftIn = s.match(/^(-?\d+(?:\.\d+)?)\s*'\s*(.*)$/);
  if (ftIn) {
    const feet = parseFloat(ftIn[1]);
    const rest = ftIn[2].trim().replace(/"$/, '').trim();
    const inches = rest === '' ? 0 : parseNumberMaybeFraction(rest);
    if (inches === null) return null;
    const sign = feet < 0 ? -1 : 1;
    return (feet * 12 + sign * inches) * MM_PER_INCH;
  }

  // Explicit unit suffix.
  const m = s.match(/^(.+?)\s*(mm|cm|m|in|")$/);
  if (m) {
    const n = parseNumberMaybeFraction(m[1]);
    if (n === null) return null;
    switch (m[2]) {
      case 'mm':
        return n;
      case 'cm':
        return n * 10;
      case 'm':
        return n * 1000;
      default:
        return n * MM_PER_INCH;
    }
  }

  const n = parseNumberMaybeFraction(s);
  if (n === null) return null;
  return units === 'imperial' ? n * MM_PER_INCH : n;
}

/** Format mm for display: `35-1/2"` (to 1/32") or `902 mm` (one decimal max). */
export function formatLength(mm: number, units: Units): string {
  const sign = mm < 0 ? '-' : '';
  const abs = Math.abs(mm);

  if (units === 'metric') {
    const r = Math.round(abs * 10) / 10;
    return `${sign}${Number.isInteger(r) ? r : r.toFixed(1)} mm`;
  }

  const totalIn = abs / MM_PER_INCH;
  let whole = Math.floor(totalIn);
  let num = Math.round((totalIn - whole) * 32);
  if (num === 32) {
    whole += 1;
    num = 0;
  }
  if (num === 0) return `${sign}${whole}"`;
  let den = 32;
  while (num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return whole > 0 ? `${sign}${whole}-${num}/${den}"` : `${sign}${num}/${den}"`;
}

/** Compact form without the unit mark, for tables where the column header carries the unit. */
export function formatLengthBare(mm: number, units: Units): string {
  const s = formatLength(mm, units);
  return units === 'imperial' ? s.replace(/"$/, '') : s.replace(/ mm$/, '');
}
