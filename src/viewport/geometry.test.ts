import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GRAIN_MM_U } from './woodTexture';
import { grainBoxGeometry, mortisedPostGeometry } from './geometry';

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
      expect(Math.min(Math.abs(du), Math.abs(du - expectedShift))).toBeLessThan(1e-6);
      expect(Math.abs(dv)).toBeLessThan(1e-6);
      if (Math.abs(du - expectedShift) < 1e-6) shiftedCount++;
    }
    expect(shiftedCount).toBeGreaterThan(0);
  });
});

describe('French dovetail socket floor', () => {
  // Count outer-face (+Y) vertices that sit inside the notch column near the
  // groove bottom: a flat floor leaves the column open (none), a rounded floor
  // refills it as the walls close in (some) — the negative of the key's round.
  const refillCount = (geo: THREE.BufferGeometry, hy: number) => {
    const pos = geo.getAttribute('position');
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (Math.abs(y - hy) < 0.6 && z > -61 && z < -56 && Math.abs(x) < 7) n++;
    }
    return n;
  };

  it('rounds the groove floor to match the key, instead of a square bottom', () => {
    const w = 60;
    const d = 60;
    const h = 200;
    const base = { face: 'y+' as const, z: 0, width: 20, height: 120, depth: 15, flare: 6, openTop: true };
    const round = mortisedPostGeometry(w, d, h, 5, [{ ...base, roundBottom: true }]);
    const flat = mortisedPostGeometry(w, d, h, 5, [{ ...base, roundBottom: false }]);
    expect(refillCount(round, d / 2)).toBeGreaterThan(0);
    expect(refillCount(flat, d / 2)).toBe(0);
  });
});
