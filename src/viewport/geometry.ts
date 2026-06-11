import * as THREE from 'three';
import { GRAIN_MM_U, GRAIN_MM_V } from './woodTexture';

type V3 = [number, number, number];
type UV = [number, number];

class MeshBuilder {
  private positions: number[] = [];
  private uvs: number[] = [];

  quad(a: V3, b: V3, c: V3, d: V3, ua: UV, ub: UV, uc: UV, ud: UV) {
    this.positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    this.uvs.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geo.computeVertexNormals();
    return geo;
  }
}

/** Index of the longest dimension — the grain runs along it (boards are cut that way). */
export function longestAxis(size: V3): 0 | 1 | 2 {
  if (size[0] >= size[1] && size[0] >= size[2]) return 0;
  return size[1] >= size[2] ? 1 : 2;
}

/**
 * Box with world-scale UVs aligned to the grain axis: u advances along the grain in mm,
 * v across it, so streak density is identical on every part regardless of its size, and
 * `uvOffset` (a stable per-part random) de-correlates the pattern between boards.
 */
export function grainBoxGeometry(
  size: V3,
  grainAxis: 0 | 1 | 2,
  uvOffset: UV = [0, 0],
): THREE.BufferGeometry {
  const h: V3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  const mb = new MeshBuilder();

  for (const n of [0, 1, 2] as const) {
    // Grain axis when it lies in this face, else any in-plane axis (end grain).
    const uAxis = grainAxis !== n ? grainAxis : ((n + 1) % 3 as 0 | 1 | 2);
    const vAxis = (3 - n - uAxis) as 0 | 1 | 2;

    for (const s of [-1, 1]) {
      // Order the in-plane axes so the winding faces outward: cross(ea, eb) = s·en.
      let a = uAxis;
      let b = vAxis;
      if (((b - a + 3) % 3 === 1 ? 1 : -1) !== s) [a, b] = [b, a];

      const corner = (ca: number, cb: number): V3 => {
        const p: V3 = [0, 0, 0];
        p[n] = s * h[n];
        p[a] = ca * h[a];
        p[b] = cb * h[b];
        return p;
      };
      const uv = (p: V3): UV => [
        p[uAxis] / GRAIN_MM_U + uvOffset[0],
        p[vAxis] / GRAIN_MM_V + uvOffset[1],
      ];
      const p0 = corner(-1, -1);
      const p1 = corner(1, -1);
      const p2 = corner(1, 1);
      const p3 = corner(-1, 1);
      mb.quad(p0, p1, p2, p3, uv(p0), uv(p1), uv(p2), uv(p3));
    }
  }
  return mb.build();
}

/**
 * Tapered box (3D nine-patch slice): rectangular top and bottom of different sizes.
 * `align` per axis: 0 = taper centered, ±1 = that face stays flush (e.g. a leg whose
 * outer faces stay straight while the inner faces taper). Grain runs along Z (legs).
 * Model space, Z-up.
 */
export function taperedBoxGeometry(
  top: [number, number],
  bottom: [number, number],
  height: number,
  align: [number, number],
  uvOffset: UV = [0, 0],
): THREE.BufferGeometry {
  const [tw, td] = top;
  const [bw, bd] = bottom;
  const hz = height / 2;
  const ox = (align[0] * (tw - bw)) / 2;
  const oy = (align[1] * (td - bd)) / 2;

  const t: V3[] = [
    [-tw / 2, -td / 2, hz],
    [tw / 2, -td / 2, hz],
    [tw / 2, td / 2, hz],
    [-tw / 2, td / 2, hz],
  ];
  const b: V3[] = [
    [ox - bw / 2, oy - bd / 2, -hz],
    [ox + bw / 2, oy - bd / 2, -hz],
    [ox + bw / 2, oy + bd / 2, -hz],
    [ox - bw / 2, oy + bd / 2, -hz],
  ];

  // Sides: grain (u) along Z; v from the perimeter coordinate. Caps: end grain.
  const side = (p: V3): UV => [
    p[2] / GRAIN_MM_U + uvOffset[0],
    (p[0] + p[1]) / GRAIN_MM_V + uvOffset[1],
  ];
  const cap = (p: V3): UV => [p[0] / GRAIN_MM_U + uvOffset[0], p[1] / GRAIN_MM_V + uvOffset[1]];

  const mb = new MeshBuilder();
  mb.quad(t[0], t[1], t[2], t[3], cap(t[0]), cap(t[1]), cap(t[2]), cap(t[3])); // top (+Z)
  mb.quad(b[0], b[3], b[2], b[1], cap(b[0]), cap(b[3]), cap(b[2]), cap(b[1])); // bottom (−Z)
  mb.quad(b[0], b[1], t[1], t[0], side(b[0]), side(b[1]), side(t[1]), side(t[0])); // −Y
  mb.quad(b[1], b[2], t[2], t[1], side(b[1]), side(b[2]), side(t[2]), side(t[1])); // +X
  mb.quad(b[2], b[3], t[3], t[2], side(b[2]), side(b[3]), side(t[3]), side(t[2])); // +Y
  mb.quad(b[3], b[0], t[0], t[3], side(b[3]), side(b[0]), side(t[0]), side(t[3])); // −X
  return mb.build();
}
