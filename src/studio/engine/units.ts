/**
 * Imperial unit helpers. The engine's internal model is always millimeters;
 * these convert at the boundaries — shop-friendly fractional inches out,
 * inch input in.
 */

export const MM_PER_INCH = 25.4;

export function inchesToMm(inches: number): number {
  return inches * MM_PER_INCH;
}

export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH;
}

/**
 * Formats millimeters as carpenter-style fractional inches, e.g.
 * 1580mm → `62-3/16"`. Rounds to the nearest 1/denominator (default 1/16").
 */
export function formatInches(mm: number, denominator = 16): string {
  const totalInches = mmToInches(Math.abs(mm));
  let whole = Math.floor(totalInches);
  let numerator = Math.round((totalInches - whole) * denominator);
  let denom = denominator;
  if (numerator === denom) {
    whole += 1;
    numerator = 0;
  }
  while (numerator > 0 && numerator % 2 === 0 && denom % 2 === 0) {
    numerator /= 2;
    denom /= 2;
  }
  const sign = mm < 0 ? '-' : '';
  if (numerator === 0) return `${sign}${whole}"`;
  if (whole === 0) return `${sign}${numerator}/${denom}"`;
  return `${sign}${whole}-${numerator}/${denom}"`;
}
