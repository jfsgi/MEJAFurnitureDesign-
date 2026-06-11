import { describe, expect, it } from 'vitest';
import { GRAIN_MM_U } from './woodTexture';
import { grainBoxGeometry } from './geometry';

describe('grain UVs in part space', () => {
  it('uvOrigin shifts grain along the board so stacked primitives stay continuous', () => {
    const size: [number, number, number] = [100, 100, 400];
    const base = grainBoxGeometry(size, 2);
    const shifted = grainBoxGeometry(size, 2, [0, 0], [0, 0, 400]);
    const a = base.getAttribute('uv');
    const b = shifted.getAttribute('uv');
    expect(b.count).toBe(a.count);
    const expectedShift = 400 / GRAIN_MM_U;
    let shiftedCount = 0;
    for (let i = 0; i < a.count; i++) {
      const du = b.getX(i) - a.getX(i);
      const dv = b.getY(i) - a.getY(i);
      // Faces carrying the grain shift by exactly origin/tile; end grain is untouched.
      expect(Math.min(Math.abs(du), Math.abs(du - expectedShift))).toBeLessThan(1e-9);
      expect(Math.abs(dv)).toBeLessThan(1e-9);
      if (Math.abs(du - expectedShift) < 1e-9) shiftedCount++;
    }
    expect(shiftedCount).toBeGreaterThan(0);
  });
});
