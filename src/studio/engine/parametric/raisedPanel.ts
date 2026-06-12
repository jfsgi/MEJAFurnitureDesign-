/**
 * Raised-panel geometry: a panel whose front face steps from a thin edge
 * tongue (hidden in the frame grooves), up a profiled raise, to a proud
 * flat field — the shape a shaper panel-raising cutter leaves.
 *
 * Construction is exact, not grid-sampled: the raise is four trapezoidal
 * sweeps of the 1-D profile cross-section, mitered 45° at the corners on
 * true diagonal seams (no stair-stepping), with analytic normals that are
 * smooth along the cutter curve and crease-sharp at the tongue and field
 * arrises. All inputs in meters.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type RaiseProfileId =
  | 'cove'
  | 'ogee'
  | 'bevel'
  | 'roundover'
  | 'stepcove'
  | 'bevelstep'
  | 'covebead'
  | 'ogeebead';

type SegShape = 'line' | 'concave' | 'convex';

/**
 * One piece of a raise cross-section: runs from the previous segment's end
 * out to `a` meters from the raise start, finishing at normalized height
 * `h`. 'concave' eases in (cove: flat into steep), 'convex' eases out
 * (round: steep into flat); both work rising or falling.
 */
interface RaiseSegment {
  a: number;
  h: number;
  shape: SegShape;
}

/**
 * Shop-true cross-sections with the features that make a raise read at a
 * glance: a quirk shoulder or a bead-and-quirk at the field line, ledges on
 * the stepped cuts, and full-depth bodies. Feature sizes are absolute
 * millimeters (clamped for narrow raises) so a shoulder stays a crisp
 * shadow line no matter the raise width. W is the raise width in meters.
 */
const PROFILES: Record<RaiseProfileId, (W: number) => RaiseSegment[]> = {
  bevel: (W) => {
    const step = Math.min(0.0009, W * 0.06);
    const reveal = Math.min(0.0025, W * 0.11);
    return [
      { a: W - step - reveal, h: 0.74, shape: 'line' },
      { a: W - step, h: 0.74, shape: 'line' },
      { a: W, h: 1, shape: 'line' },
    ];
  },
  cove: (W) => {
    const step = Math.min(0.0009, W * 0.06);
    return [
      { a: W - step, h: 0.8, shape: 'concave' },
      { a: W, h: 1, shape: 'line' },
    ];
  },
  roundover: (W) => {
    const step = Math.min(0.0009, W * 0.06);
    return [
      { a: W - step, h: 0.8, shape: 'convex' },
      { a: W, h: 1, shape: 'line' },
    ];
  },
  ogee: (W) => {
    const step = Math.min(0.0009, W * 0.06);
    return [
      { a: (W - step) * 0.48, h: 0.4, shape: 'concave' },
      { a: W - step, h: 0.8, shape: 'convex' },
      { a: W, h: 1, shape: 'line' },
    ];
  },
  stepcove: (W) => {
    const step = Math.min(0.0009, W * 0.06);
    const approach = Math.min(0.003, W * 0.16);
    const riser = Math.min(0.0011, W * 0.06);
    const ledge = Math.min(0.0024, W * 0.11);
    return [
      { a: approach, h: 0.1, shape: 'line' },
      { a: approach + riser, h: 0.34, shape: 'line' },
      { a: approach + riser + ledge, h: 0.34, shape: 'line' },
      { a: W - step, h: 0.82, shape: 'concave' },
      { a: W, h: 1, shape: 'line' },
    ];
  },
  bevelstep: (W) => {
    const step = Math.min(0.0016, W * 0.09);
    const reveal = Math.min(0.0038, W * 0.15);
    return [
      { a: W - step - reveal, h: 0.58, shape: 'line' },
      { a: W - step, h: 0.58, shape: 'line' },
      { a: W, h: 1, shape: 'line' },
    ];
  },
  covebead: (W) => {
    const bead = Math.min(0.0044, W * 0.22);
    const quirk = Math.min(0.0014, W * 0.07);
    return [
      { a: W - bead - quirk, h: 0.58, shape: 'concave' },
      { a: W - bead / 2 - quirk, h: 0.96, shape: 'convex' },
      { a: W - quirk, h: 0.78, shape: 'concave' },
      { a: W, h: 1, shape: 'line' },
    ];
  },
  ogeebead: (W) => {
    const bead = Math.min(0.0044, W * 0.22);
    const quirk = Math.min(0.0014, W * 0.07);
    const body = W - bead - quirk;
    return [
      { a: body * 0.48, h: 0.34, shape: 'concave' },
      { a: body, h: 0.6, shape: 'convex' },
      { a: W - bead / 2 - quirk, h: 0.97, shape: 'convex' },
      { a: W - quirk, h: 0.8, shape: 'concave' },
      { a: W, h: 1, shape: 'line' },
    ];
  },
};

/** Height ease and its derivative for each segment shape, over t ∈ [0,1]. */
const SHAPE_EASE: Record<SegShape, [(t: number) => number, (t: number) => number]> = {
  line: [(t) => t, () => 1],
  concave: [
    (t) => 1 - Math.cos((t * Math.PI) / 2),
    (t) => (Math.PI / 2) * Math.sin((t * Math.PI) / 2),
  ],
  convex: [
    (t) => Math.sin((t * Math.PI) / 2),
    (t) => (Math.PI / 2) * Math.cos((t * Math.PI) / 2),
  ],
};

/**
 * Flat tongue at the panel edge. Shorter than the groove overlap (10mm), so
 * the flat is fully buried and the visible surface emerges already rising.
 */
const TONGUE_LENGTH = 0.008;

/** Width of the back-cut bevel that centers the tongue in the groove. */
const BACK_CUT = 0.02;

export function raisedPanelGeometry(
  width: number,
  height: number,
  thickness: number,
  raiseWidth: number,
  tongueThickness: number,
  profileId: RaiseProfileId,
): THREE.BufferGeometry {
  const back = -thickness / 2;
  // The tongue is CENTERED in the panel thickness (the shaper's back cutter
  // trims the rear), so it centers in the frame groove and the visible
  // surface meets the stick right at the groove mouth.
  const tongueZ = tongueThickness / 2;
  const tongueBack = -tongueThickness / 2;
  const fieldZ = thickness / 2;
  const m = TONGUE_LENGTH + raiseWidth; // total band from edge to field

  // Cross-section rows: distance-from-edge `a`, height z(a), and the slope
  // dz/da. Wherever the cut breaks direction (tongue→raise, ledges, quirk
  // shoulders, bead bases) the boundary row is duplicated with the one-sided
  // slope on each side so the arris shades sharp instead of averaging soft.
  interface Row {
    a: number;
    z: number;
    slope: number;
  }
  const relief = fieldZ - tongueZ;
  const rows: Row[] = [
    { a: 0, z: tongueZ, slope: 0 },
    { a: TONGUE_LENGTH, z: tongueZ, slope: 0 },
  ];
  let segA = 0;
  let segH = 0;
  let prevSlope = 0;
  for (const seg of PROFILES[profileId](raiseWidth)) {
    const span = seg.a - segA;
    if (span <= 1e-6) continue;
    const [ease, dEase] = SHAPE_EASE[seg.shape];
    const dh = seg.h - segH;
    const slopeAt = (t: number) => (dh * relief * dEase(t)) / span;
    if (Math.abs(slopeAt(0) - prevSlope) > 0.02) {
      rows.push({ a: TONGUE_LENGTH + segA, z: tongueZ + segH * relief, slope: slopeAt(0) });
    }
    const n = seg.shape === 'line' ? 1 : 24;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      rows.push({
        a: TONGUE_LENGTH + segA + span * t,
        z: tongueZ + (segH + dh * ease(t)) * relief,
        slope: slopeAt(t),
      });
    }
    prevSlope = slopeAt(1);
    segA = seg.a;
    segH = seg.h;
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  /**
   * One swept strip per edge. `ex, ey` point outward toward that edge;
   * the strip footprint is the mitered trapezoid between the panel edge
   * and the field rectangle. `isBack` sweeps the back-cut bevel instead
   * (faces −z, winding reversed).
   */
  const strip = (ex: number, ey: number, stripRows: Row[] = rows, isBack = false) => {
    const edgeDist = ex !== 0 ? width / 2 : height / 2;
    const alongHalfAt = (a: number) => (ex !== 0 ? height / 2 - a : width / 2 - a);
    for (let r = 0; r < stripRows.length - 1; r++) {
      const r0 = stripRows[r];
      const r1 = stripRows[r + 1];
      if (r1.a <= r0.a) continue;
      const out0 = edgeDist - r0.a;
      const out1 = edgeDist - r1.a;
      const t0 = alongHalfAt(r0.a);
      const t1 = alongHalfAt(r1.a);
      // Quad corners (along × across), mitered ends.
      const P = (out: number, t: number, z: number): [number, number, number] =>
        ex !== 0 ? [ex * out, t, z] : [t, ey * out, z];
      const a0 = P(out0, -t0, r0.z);
      const b0 = P(out0, t0, r0.z);
      const a1 = P(out1, -t1, r1.z);
      const b1 = P(out1, t1, r1.z);
      // Normals: rising inward ⇒ tilt toward the edge (mirrored for the
      // back bevel, which faces −z).
      const n = (slope: number): [number, number, number] => {
        const inv = 1 / Math.hypot(slope, 1);
        if (isBack) {
          return ex !== 0 ? [-ex * slope * inv, 0, -inv] : [0, -ey * slope * inv, -inv];
        }
        return ex !== 0 ? [ex * slope * inv, 0, inv] : [0, ey * slope * inv, inv];
      };
      const n0 = n(r0.slope);
      const n1 = n(r1.slope);
      // Winding so faces point +z (out of the panel front).
      const emit = (
        p: [number, number, number],
        pn: [number, number, number],
      ) => {
        positions.push(...p);
        normals.push(...pn);
        uvs.push(0, 0);
      };
      const flip = isBack ? !(ex < 0 || ey > 0) : ex < 0 || ey > 0;
      const tri = (
        v1: [[number, number, number], [number, number, number]],
        v2: [[number, number, number], [number, number, number]],
        v3: [[number, number, number], [number, number, number]],
      ) => {
        if (flip) {
          emit(v1[0], v1[1]);
          emit(v3[0], v3[1]);
          emit(v2[0], v2[1]);
        } else {
          emit(v1[0], v1[1]);
          emit(v2[0], v2[1]);
          emit(v3[0], v3[1]);
        }
      };
      tri([a0, n0], [b0, n0], [b1, n1]);
      tri([a0, n0], [b1, n1], [a1, n1]);
    }
  };
  strip(1, 0);
  strip(-1, 0);
  strip(0, 1);
  strip(0, -1);

  // Back-cut bevel: tongue back out to the full panel back thickness.
  const bevelSlope = (back - tongueBack) / (BACK_CUT - TONGUE_LENGTH);
  const backRows: Row[] = [
    { a: 0, z: tongueBack, slope: 0 },
    { a: TONGUE_LENGTH, z: tongueBack, slope: 0 },
    { a: TONGUE_LENGTH, z: tongueBack, slope: bevelSlope },
    { a: BACK_CUT, z: back, slope: bevelSlope },
  ];
  strip(1, 0, backRows, true);
  strip(-1, 0, backRows, true);
  strip(0, 1, backRows, true);
  strip(0, -1, backRows, true);

  const raiseGeo = new THREE.BufferGeometry();
  raiseGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  raiseGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  raiseGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));

  // Flat field plate.
  const fw = width - 2 * m;
  const fh = height - 2 * m;
  const field = new THREE.PlaneGeometry(Math.max(fw, 0.001), Math.max(fh, 0.001));
  field.translate(0, 0, fieldZ);

  // Back face (inside the back-cut bevel).
  const backFace = new THREE.PlaneGeometry(
    Math.max(width - 2 * BACK_CUT, 0.001),
    Math.max(height - 2 * BACK_CUT, 0.001),
  );
  backFace.rotateY(Math.PI);
  backFace.translate(0, 0, back);

  // Edge band: the panel's perimeter — the centered tongue's edge.
  const band = new THREE.BoxGeometry(width, height, tongueThickness);
  const sides = band.toNonIndexed();
  const position = sides.attributes.position;
  const normal = sides.attributes.normal;
  const uv = sides.attributes.uv;
  const keep: number[] = [];
  for (let i = 0; i < position.count; i += 3) {
    if (Math.abs(normal.getZ(i)) < 0.5) keep.push(i, i + 1, i + 2);
  }
  const filtered = new THREE.BufferGeometry();
  const fp = new Float32Array(keep.length * 3);
  const fn = new Float32Array(keep.length * 3);
  const fu = new Float32Array(keep.length * 2);
  keep.forEach((src, dst) => {
    fp.set([position.getX(src), position.getY(src), position.getZ(src)], dst * 3);
    fn.set([normal.getX(src), normal.getY(src), normal.getZ(src)], dst * 3);
    fu.set([uv.getX(src), uv.getY(src)], dst * 2);
  });
  filtered.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  filtered.setAttribute('normal', new THREE.BufferAttribute(fn, 3));
  filtered.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
  band.dispose();
  sides.dispose();

  const merged = mergeGeometries(
    [raiseGeo, field.toNonIndexed(), backFace.toNonIndexed(), filtered],
    false,
  );
  raiseGeo.dispose();
  field.dispose();
  backFace.dispose();
  filtered.dispose();
  return merged!;
}
