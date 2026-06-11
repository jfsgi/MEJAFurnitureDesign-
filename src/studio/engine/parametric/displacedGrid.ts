/**
 * Displaced front-face builder shared by the profiled-board and raised-panel
 * geometry. Key property: normals are computed analytically from the height
 * field with one-sided sampling toward each triangle's interior, so curved
 * profile regions shade smoothly while genuine arrises (bevel-to-field,
 * quirk steps) stay knife-sharp instead of being averaged soft.
 */

import * as THREE from 'three';

/**
 * Sample positions along an axis: fine spacing inside the given zones
 * (profile bands, corners), coarse elsewhere. Returns ascending coordinates
 * from -extent/2 to extent/2.
 */
export function nonuniformSamples(
  extent: number,
  denseZones: Array<[number, number]>,
  fine: number,
  coarse: number,
): number[] {
  const lo = -extent / 2;
  const hi = extent / 2;
  const inZone = (x: number) =>
    denseZones.some(([a, b]) => x >= a - fine && x <= b + fine);
  const samples: number[] = [lo];
  let x = lo;
  while (x < hi) {
    const step = inZone(x) ? fine : coarse;
    // Don't stride past the start of an upcoming dense zone.
    let next = x + step;
    for (const [a] of denseZones) {
      if (x < a && next > a) next = Math.max(a, x + fine);
    }
    x = Math.min(next, hi);
    samples.push(x);
  }
  return samples;
}

/**
 * Builds the displaced front face over the sample grid. Non-indexed, with
 * crease-preserving analytic normals. An optional `map` warps the parameter
 * grid into the final footprint (e.g. the 45° shear of mitered frame
 * members); the height field is always evaluated in mapped coordinates.
 */
export function displacedFrontFace(
  us: number[],
  vs: number[],
  zFn: (x: number, y: number) => number,
  map?: (u: number, v: number) => [number, number],
): THREE.BufferGeometry {
  const M = map ?? ((u: number, v: number): [number, number] => [u, v]);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const pushVertex = (u: number, v: number, cu: number, cv: number, h: number) => {
    // Sample the gradient slightly toward the triangle interior so each side
    // of a crease keeps its own slope.
    const [ex, ey] = M(u + (cu - u) * 0.3, v + (cv - v) * 0.3);
    const dzdx = (zFn(ex + h, ey) - zFn(ex - h, ey)) / (2 * h);
    const dzdy = (zFn(ex, ey + h) - zFn(ex, ey - h)) / (2 * h);
    const inv = 1 / Math.hypot(dzdx, dzdy, 1);
    const [x, y] = M(u, v);
    positions.push(x, y, zFn(x, y));
    normals.push(-dzdx * inv, -dzdy * inv, inv);
    uvs.push(0, 0);
  };

  for (let i = 0; i < us.length - 1; i++) {
    for (let j = 0; j < vs.length - 1; j++) {
      const u0 = us[i];
      const u1 = us[i + 1];
      const v0 = vs[j];
      const v1 = vs[j + 1];
      const h = Math.min(u1 - u0, v1 - v0) * 0.25;
      const c1u = (u0 + u1 + u1) / 3;
      const c1v = (v0 + v0 + v1) / 3;
      pushVertex(u0, v0, c1u, c1v, h);
      pushVertex(u1, v0, c1u, c1v, h);
      pushVertex(u1, v1, c1u, c1v, h);
      const c2u = (u0 + u1 + u0) / 3;
      const c2v = (v0 + v1 + v1) / 3;
      pushVertex(u0, v0, c2u, c2v, h);
      pushVertex(u1, v1, c2u, c2v, h);
      pushVertex(u0, v1, c2u, c2v, h);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  return geometry;
}

/**
 * A vertical wall strip from `backZ` up to the displaced front surface along
 * a perimeter polyline (traversed counter-clockwise seen from +z). Outward
 * normals are derived per segment.
 */
export function perimeterWall(
  points: Array<[number, number]>,
  frontZ: (x: number, y: number) => number,
  backZ: number | ((x: number, y: number) => number),
): THREE.BufferGeometry {
  const backAt = typeof backZ === 'number' ? () => backZ : backZ;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const nx = dy / len;
    const ny = -dx / len;
    const zt0 = frontZ(x0, y0);
    const zt1 = frontZ(x1, y1);
    const zb0 = Math.min(backAt(x0, y0), zt0);
    const zb1 = Math.min(backAt(x1, y1), zt1);
    positions.push(x0, y0, zb0, x1, y1, zb1, x1, y1, zt1);
    positions.push(x0, y0, zb0, x1, y1, zt1, x0, y0, zt0);
    for (let k = 0; k < 6; k++) {
      normals.push(nx, ny, 0);
      uvs.push(0, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  return geometry;
}
