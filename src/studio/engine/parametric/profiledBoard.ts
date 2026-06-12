/**
 * Profiled board geometry: a board whose front face carries edge details —
 * the cope-&-pattern profile along the panel opening (confined to the
 * opening span), and/or the door-edge detail along outer edges and across
 * board ends, so the detail runs continuously around an assembled door.
 *
 * Built as a displaced front-face grid (profiles are computed as a depth
 * field from edge distances), four side walls that follow the displaced
 * perimeter, and a flat back. All inputs in meters.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { displacedFrontFace, nonuniformSamples, perimeterWall } from './displacedGrid.js';

export type EdgeProfileId =
  | 'chamfer'
  | 'bevel30'
  | 'roundover'
  | 'ogee'
  | 'bead'
  | 'cove'
  | 'ovolo'
  | 'step'
  | 'thumbnail'
  | 'fingerpull'
  | 'classical';

/** Cut depth relative to the base profile depth — shallow bevels vs deep pulls. */
const DEPTH_SCALE: Partial<Record<EdgeProfileId, number>> = {
  bevel30: 0.55,
  fingerpull: 1.5,
};

/** Drop curves: s = 0 at the field side of the band → 0; s = 1 at the edge → 1. */
function shape(profile: EdgeProfileId, s: number): number {
  switch (profile) {
    case 'chamfer':
    case 'bevel30':
      return s;
    case 'roundover':
      return 1 - Math.sqrt(Math.max(0, 1 - s * s));
    case 'cove': {
      // Quirk fillet at the field, then the cove sweep.
      if (s < 0.08) return 0.12 * (s / 0.08);
      return 0.12 + 0.88 * Math.sin((((s - 0.08) / 0.92) * Math.PI) / 2);
    }
    case 'fingerpull':
      // Deep sweeping cove for handle-less fronts.
      return Math.sin((Math.pow(s, 0.8) * Math.PI) / 2);
    case 'ogee': {
      // Quirk fillet at the field, then the S-sweep.
      if (s < 0.1) return 0.14 * (s / 0.1);
      const t = (s - 0.1) / 0.9;
      return 0.14 + 0.86 * t * t * (3 - 2 * t);
    }
    case 'bead': {
      if (s < 0.18) return (s / 0.18) * 0.25;
      const r = (s - 0.18) / 0.82;
      return 0.25 + 0.75 * (1 - Math.sqrt(Math.max(0, 1 - r * r)));
    }
    case 'ovolo': {
      if (s < 0.12) return (s / 0.12) * 0.15;
      if (s > 0.88) return 0.85 + ((s - 0.88) / 0.12) * 0.15;
      const r = (s - 0.12) / 0.76;
      return 0.15 + 0.7 * (1 - Math.sqrt(Math.max(0, 1 - r * r)));
    }
    case 'step':
      return s < 0.45 ? 0 : s < 0.55 ? (s - 0.45) / 0.1 : 1;
    case 'thumbnail': {
      // Listel step at the field, then the rolled nose.
      if (s < 0.1) return 0.16 * (s / 0.1);
      const t = (s - 0.1) / 0.9;
      return 0.16 + 0.84 * Math.pow(t * t * (3 - 2 * t), 1.4);
    }
    case 'classical': {
      // Quirk-and-bead at the field, sweeping cove to the edge.
      if (s < 0.2) return 0.18 * (s / 0.2) * (s / 0.2) * (3 - 2 * (s / 0.2));
      return 0.18 + 0.82 * Math.sin((((s - 0.2) / 0.8) * Math.PI) / 2);
    }
  }
}

export interface ProfiledBoardOptions {
  /** Profile depth into the thickness (m). */
  depth: number;
  outer?: {
    profile: EdgeProfileId;
    width: number;
    /** Overrides the shared profile depth (exact 45° bevels: depth = width). */
    depth?: number;
    uMin: boolean;
    uMax: boolean;
    vMin: boolean;
    vMax: boolean;
  };
  inner?: {
    profile: EdgeProfileId;
    width: number;
    side: 'vMin' | 'vMax';
    /** Pattern stops this far from each board end (the cope line). */
    endInset: number;
    /**
     * Coped ends (rails): the same profile applied across the board ends,
     * so the face descends to mate the mating stile's full-length stick.
     */
    copeEnds?: boolean;
  };
  /**
   * Mitered frame member: both ends cut at 45° (a sheared trapezoid running
   * from full length at the outer edge to length − 2·width at the inner
   * edge). Profiles run through the miter uninterrupted; the mating member
   * carries them on across the seam.
   */
  miterEnds?: { outerSide: 'vMin' | 'vMax' };
  /**
   * Cope-&-stick witness on the board ends (stiles) of an assembled door:
   * the rail's stub tenon fills the groove and the cope fills the profile
   * hollow, so the end face is flush with shallow seam reveals (`capDepth`)
   * outlining the tenon end-grain and the cope line.
   */
  stickCaps?: { grooveWidth: number; grooveDepth: number; capDepth: number; innerSide: 'vMin' | 'vMax' };
}

export function profiledBoardGeometry(
  L: number,
  W: number,
  T: number,
  opts: ProfiledBoardOptions,
): THREE.BufferGeometry {
  const pd = opts.depth;
  const miter = opts.miterEnds;
  const endInset = miter ? 0 : (opts.inner?.endInset ?? 0);
  const drop = (u: number, v: number): number => {
    let d = 0;
    const band = (dist: number, profile: EdgeProfileId, pw: number, depth = pd) =>
      dist < pw
        ? depth * (DEPTH_SCALE[profile] ?? 1) * shape(profile, 1 - dist / pw)
        : 0;
    if (opts.outer) {
      const { profile, width: pw } = opts.outer;
      const od = opts.outer.depth ?? pd;
      if (opts.outer.vMax) d = Math.max(d, band(W / 2 - v, profile, pw, od));
      if (opts.outer.vMin) d = Math.max(d, band(v + W / 2, profile, pw, od));
      // End bands only on butt-jointed members; mitered profiles continue
      // across the seam instead.
      if (!miter && opts.outer.uMax) d = Math.max(d, band(L / 2 - u, profile, pw, od));
      if (!miter && opts.outer.uMin) d = Math.max(d, band(u + L / 2, profile, pw, od));
    }
    if (opts.inner) {
      const dEdge = opts.inner.side === 'vMax' ? W / 2 - v : v + W / 2;
      const over = Math.abs(u) - (L / 2 - endInset);
      const dist = over > 0 ? Math.max(over, dEdge) : dEdge;
      let innerDrop = band(dist, opts.inner.profile, opts.inner.width);
      if (opts.inner.copeEnds && !miter) {
        // Coped rail end riding over the stile's stick: in the overlap the
        // visible surface is the frontmost of the rail's own band and the
        // mating stick (rising to the field at the very tip), which is how
        // a male/female coped joint presents from the front.
        const e = L / 2 - Math.abs(u);
        if (e < opts.inner.width) {
          const scale = DEPTH_SCALE[opts.inner.profile] ?? 1;
          const stick = pd * scale * shape(opts.inner.profile, Math.max(0, e) / opts.inner.width);
          innerDrop = Math.min(innerDrop, stick);
        }
      }
      d = Math.max(d, innerDrop);
    }
    return d;
  };
  const frontZ = (u: number, v: number) => T / 2 - drop(u, v);

  // Footprint: rectangle, or 45°-sheared trapezoid for mitered members.
  const lim = (v: number): number => {
    if (!miter) return L / 2;
    const dOut = miter.outerSide === 'vMax' ? W / 2 - v : v + W / 2;
    return Math.max(L / 2 - dOut, 0.001);
  };
  const M = (u: number, v: number): [number, number] => [(u * lim(v)) / (L / 2), v];

  const fine = 0.0012;
  const coarse = 0.008;
  const uZones: Array<[number, number]> = [];
  const vZones: Array<[number, number]> = [];
  if (opts.outer) {
    const pw = opts.outer.width + 0.002;
    if (opts.outer.uMin) uZones.push([-L / 2, -L / 2 + pw]);
    if (opts.outer.uMax) uZones.push([L / 2 - pw, L / 2]);
    if (opts.outer.vMin) vZones.push([-W / 2, -W / 2 + pw]);
    if (opts.outer.vMax) vZones.push([W / 2 - pw, W / 2]);
  }
  if (opts.inner) {
    const pw = opts.inner.width + 0.002;
    vZones.push(
      opts.inner.side === 'vMax' ? [W / 2 - pw, W / 2] : [-W / 2, -W / 2 + pw],
    );
    if (endInset > 0) {
      for (const sign of [-1, 1]) {
        const corner = sign * (L / 2 - endInset);
        uZones.push([corner - pw, corner + pw]);
      }
    }
    if (opts.inner.copeEnds) {
      uZones.push([-L / 2, -L / 2 + pw], [L / 2 - pw, L / 2]);
    }
  }
  if (miter) {
    // Dense sampling near the sheared ends keeps the diagonal seam clean.
    uZones.push([-L / 2, -L / 2 + W + 0.002], [L / 2 - W - 0.002, L / 2]);
  }
  const us = nonuniformSamples(L, uZones, fine, coarse);
  const vs = nonuniformSamples(W, vZones, fine, coarse);
  const front = displacedFrontFace(us, vs, frontZ, M);

  // Back: flat quad over the (possibly trapezoidal) footprint, facing −z.
  const corners = [M(-L / 2, -W / 2), M(L / 2, -W / 2), M(L / 2, W / 2), M(-L / 2, W / 2)];
  const back = new THREE.BufferGeometry();
  const bz = -T / 2;
  const [a, b, c, d2] = corners;
  back.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([
        a[0], a[1], bz, c[0], c[1], bz, b[0], b[1], bz,
        a[0], a[1], bz, d2[0], d2[1], bz, c[0], c[1], bz,
      ]),
      3,
    ),
  );
  back.setAttribute(
    'normal',
    new THREE.BufferAttribute(new Float32Array(Array(6).fill([0, 0, -1]).flat()), 3),
  );
  back.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(12), 2));

  // Side walls follow the displaced front perimeter (sampled on the same
  // grid lines as the front face) so the shell stays watertight where
  // profiles cut the edges down. Coped boards ride over the mating stick,
  // so in the overlap their walls bottom out on the stick surface — the
  // door's top edge then shows the true joint cross-section.
  const inner = opts.inner;
  const wallBack: number | ((x: number, y: number) => number) =
    inner?.copeEnds && !miter
      ? (x: number) => {
          const e = L / 2 - Math.abs(x);
          if (e >= inner.width) return bz;
          const scale = DEPTH_SCALE[inner.profile] ?? 1;
          return T / 2 - pd * scale * shape(inner.profile, Math.max(0, e) / inner.width);
        }
      : bz;
  const walls: THREE.BufferGeometry[] = [
    perimeterWall(us.map((u) => M(u, -W / 2)), frontZ, wallBack),
    perimeterWall([...us].reverse().map((u) => M(u, W / 2)), frontZ, wallBack),
  ];
  if (!opts.stickCaps) {
    walls.push(perimeterWall([...vs].reverse().map((v) => M(-L / 2, v)), frontZ, wallBack));
    walls.push(perimeterWall(vs.map((v) => M(L / 2, v)), frontZ, wallBack));
  } else {
    // End caps with the stick cut carved in: a displaced grid in the (v, z)
    // plane whose "height" is the x position — recessed inside the groove
    // channel and under the pattern profile curve. Grid walls give the
    // channel interiors for free, with crease-sharp normals.
    const { grooveWidth, grooveDepth, capDepth } = opts.stickCaps;
    const innerSign = opts.stickCaps.innerSide === 'vMin' ? -1 : 1;
    const vIn = innerSign * (W / 2);
    const innerBand = opts.inner;
    // Assembled-joint witness: crisp seam LINES (not sunken areas) outlining
    // the rail tenon's end grain in the groove and the cope line along the
    // pattern profile — how the joint reads on a real door's top edge.
    const seam = 0.0005;
    const recess = (v: number, z: number): number => {
      const distIn = innerSign > 0 ? W / 2 - v : v + W / 2;
      // Tenon outline: border of the groove rectangle.
      if (distIn < grooveDepth + seam && Math.abs(z) < grooveWidth / 2 + seam) {
        const inside = distIn < grooveDepth && Math.abs(z) < grooveWidth / 2;
        const borderDist = Math.min(
          grooveDepth - distIn,
          grooveWidth / 2 - Math.abs(z),
        );
        if (!inside || borderDist < seam) return capDepth;
      }
      // Cope seam: a line tracing the pattern profile cross-section.
      if (innerBand && distIn < innerBand.width + seam) {
        const dropHere =
          pd *
          (DEPTH_SCALE[innerBand.profile] ?? 1) *
          shape(innerBand.profile, Math.max(0, 1 - distIn / innerBand.width));
        if (Math.abs(z - (T / 2 - dropHere)) < seam) return capDepth;
      }
      return 0;
    };
    const vsCap = nonuniformSamples(
      W,
      [innerSign > 0 ? [vIn - grooveDepth - 0.004, vIn] : [vIn, vIn + grooveDepth + 0.004]],
      0.0004,
      0.003,
    );
    const buildCap = (sign: 1 | -1): THREE.BufferGeometry => {
      const endU = L / 2;
      // Build in the +u end's local frame; the −u cap is the same rotated
      // 180° about z, so its sampling uses mirrored v.
      const localV = (a: number) => (sign > 0 ? a : -a);
      // The cap silhouette follows the end face: where the door-edge detail
      // wraps the end, the front boundary is the profiled edge, not T/2 —
      // otherwise the cap would stand proud of the rounded-over edge.
      const topZ = (a: number) => frontZ(endU, localV(a));
      const tSamples = nonuniformSamples(1, [], 0.018, 0.018); // ~56 rows
      const capMap = (a: number, b: number): [number, number] => [
        a,
        -T / 2 + (b + 0.5) * (topZ(a) + T / 2),
      ];
      const grid = displacedFrontFace(
        vsCap,
        tSamples,
        (x, y) => endU - recess(sign > 0 ? x : -x, y),
        capMap,
      );
      // Permute (v, z, x) → (x, v, z): cyclic, so winding stays correct.
      const pos = grid.attributes.position;
      const nor = grid.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const a = pos.getX(i);
        const b = pos.getY(i);
        const c = pos.getZ(i);
        pos.setXYZ(i, c, a, b);
        const na = nor.getX(i);
        const nb = nor.getY(i);
        const nc = nor.getZ(i);
        nor.setXYZ(i, nc, na, nb);
      }
      if (sign < 0) grid.rotateZ(Math.PI);
      return grid;
    };
    walls.push(buildCap(1), buildCap(-1));
  }

  const merged = mergeGeometries([front, back, ...walls], false);
  front.dispose();
  back.dispose();
  for (const w of walls) w.dispose();
  return merged!;
}
