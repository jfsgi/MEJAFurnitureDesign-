import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

const ARC_SEGMENTS = 24;

export interface PostMortise {
  face: 'x+' | 'x-' | 'y+' | 'y-';
  /** Pocket center along the post's length (Z), post-local (centered at 0). */
  z: number;
  /** Pocket size along the in-face horizontal axis (at the mouth). */
  width: number;
  /** Pocket size along the post length (Z). */
  height: number;
  /** Pocket depth into the face. */
  depth: number;
  /** Dovetail flare: the pocket widens this much per side toward its depth
   *  (a sliding-dovetail socket). 0 = straight mortise walls. */
  flare?: number;
}

/** Rounded-rect cross-section (centered) with optional rectangular notches
 * cut into the middle of each face — the mortise mouths. */
function postCrossSection(
  hx: number,
  hy: number,
  r: number,
  notches: Partial<Record<'x+' | 'x-' | 'y+' | 'y-', { w: number; d: number; flare?: number }>>,
): THREE.Shape {
  const s = new THREE.Shape();
  const clampW = (w: number, span: number) => Math.min(w, span * 0.9);
  s.moveTo(-(hx - r), -hy);
  // Bottom edge (face y-): +x, inward +y. A dovetail flare widens the deep side.
  const yb = notches['y-'];
  if (yb) {
    const w = clampW(yb.w, 2 * (hx - r)) / 2;
    const fw = w + (yb.flare ?? 0);
    s.lineTo(-w, -hy);
    s.lineTo(-fw, -hy + yb.d);
    s.lineTo(fw, -hy + yb.d);
    s.lineTo(w, -hy);
  }
  s.lineTo(hx - r, -hy);
  s.absarc(hx - r, -(hy - r), r, -Math.PI / 2, 0, false);
  // Right edge (face x+): +y, inward -x.
  const xp = notches['x+'];
  if (xp) {
    const w = clampW(xp.w, 2 * (hy - r)) / 2;
    const fw = w + (xp.flare ?? 0);
    s.lineTo(hx, -w);
    s.lineTo(hx - xp.d, -fw);
    s.lineTo(hx - xp.d, fw);
    s.lineTo(hx, w);
  }
  s.lineTo(hx, hy - r);
  s.absarc(hx - r, hy - r, r, 0, Math.PI / 2, false);
  // Top edge (face y+): -x, inward -y.
  const yt = notches['y+'];
  if (yt) {
    const w = clampW(yt.w, 2 * (hx - r)) / 2;
    const fw = w + (yt.flare ?? 0);
    s.lineTo(w, hy);
    s.lineTo(fw, hy - yt.d);
    s.lineTo(-fw, hy - yt.d);
    s.lineTo(-w, hy);
  }
  s.lineTo(-(hx - r), hy);
  s.absarc(-(hx - r), hy - r, r, Math.PI / 2, Math.PI, false);
  // Left edge (face x-): -y, inward +x.
  const xm = notches['x-'];
  if (xm) {
    const w = clampW(xm.w, 2 * (hy - r)) / 2;
    const fw = w + (xm.flare ?? 0);
    s.lineTo(-hx, w);
    s.lineTo(-hx + xm.d, fw);
    s.lineTo(-hx + xm.d, -fw);
    s.lineTo(-hx, -w);
  }
  s.lineTo(-hx, -(hy - r));
  s.absarc(-(hx - r), -(hy - r), r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/**
 * Vertical post (extruded along Z) with rounded vertical corners and real
 * blind mortise pockets cut into its faces. Built as a stack of extrusions:
 * plain rounded bands, and notched bands over each mortise's height. Plain
 * bands overlap the notched bands slightly so the pocket floor/ceiling read
 * cleanly and the internal caps bury inside solid (no z-fighting).
 */
export function mortisedPostGeometry(
  w: number,
  d: number,
  h: number,
  radius: number,
  mortises: PostMortise[],
): THREE.BufferGeometry {
  const hx = w / 2;
  const hy = d / 2;
  const r = Math.max(0, Math.min(radius, hx - 0.1, hy - 0.1));
  const eps = 0.5;
  // Group mortises that share a Z band (rounded), combining their faces.
  type Notch = { w: number; d: number; flare?: number };
  const groups = new Map<string, { z: number; bh: number; notches: Partial<Record<string, Notch>> }>();
  for (const m of mortises) {
    const key = (Math.round(m.z * 100) / 100).toString();
    let g = groups.get(key);
    if (!g) {
      g = { z: m.z, bh: m.height, notches: {} };
      groups.set(key, g);
    }
    g.bh = Math.max(g.bh, m.height);
    g.notches[m.face] = { w: m.width, d: Math.min(m.depth, (m.face.startsWith('x') ? hx : hy) * 0.8), flare: m.flare };
  }
  const bands = [...groups.values()].sort((a, b) => a.z - b.z);

  const extrude = (z0: number, z1: number, notches: Partial<Record<string, Notch>>) => {
    const g = new THREE.ExtrudeGeometry(postCrossSection(hx, hy, r, notches), {
      depth: z1 - z0,
      bevelEnabled: false,
      curveSegments: ARC_SEGMENTS,
    });
    g.translate(0, 0, z0);
    return g;
  };

  const pieces: THREE.BufferGeometry[] = [];
  let cursor = -h / 2;
  for (const b of bands) {
    const z0 = b.z - b.bh / 2;
    const z1 = b.z + b.bh / 2;
    if (z0 - eps > cursor) pieces.push(extrude(cursor, z0 + eps, {})); // plain below, overlapping in
    pieces.push(extrude(z0, z1, b.notches)); // notched band
    cursor = z1 - eps;
  }
  pieces.push(extrude(cursor, h / 2, {})); // plain to the top
  const merged = mergeGeometries(pieces, false);
  for (const p of pieces) p.dispose();
  return merged ?? new THREE.BoxGeometry(w, d, h);
}


/** Circular-arc sampler: chord half-length c, rise r, returns offset above the chord. */
function arcOffset(u: number, c: number, r: number): number {
  if (r <= 1e-6) return 0; // rise dialed to zero — a straight edge
  const R = (c * c + r * r) / (2 * r);
  return Math.sqrt(Math.max(R * R - u * u, 0)) - (R - r);
}

/**
 * Board with an arch: a relief arch cut up into the bottom edge (aprons, rails) or a
 * convex bulge on the front edge in plan (shelf fronts). Grain runs along the length.
 * Model space, Z-up; `size` is the rectangular stock the curve is cut from.
 */
export function archedBoardGeometry(
  size: V3,
  arch: 'bottom-x' | 'bottom-y' | 'front' | 'scoop',
  rise: number,
  shoulder = 0,
  endSkew = 0,
  uvOffset: UV = [0, 0],
): THREE.BufferGeometry {
  if (arch === 'bottom-y') {
    // Build along X, then rotate the finished geometry into Y.
    const geo = archedBoardGeometry(
      [size[1], size[0], size[2]],
      'bottom-x',
      rise,
      shoulder,
      endSkew,
      uvOffset,
    );
    geo.rotateZ(Math.PI / 2);
    return geo;
  }

  const [sx, sy, sz] = size;
  const [hx, hy, hz] = [sx / 2, sy / 2, sz / 2];
  const mb = new MeshBuilder();
  const u = (x: number) => x / GRAIN_MM_U + uvOffset[0];
  const v = (val: number) => val / GRAIN_MM_V + uvOffset[1];

  if (arch === 'front') {
    // Half-ellipse bulge: springs vertically off the corners, +rise at center.
    // Cosine-spaced samples keep the steep ends smooth.
    const yAt = (x: number) => hy + rise * Math.sqrt(Math.max(1 - (x / hx) ** 2, 0));
    const xs: number[] = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) xs.push(-hx * Math.cos((Math.PI * i) / ARC_SEGMENTS));
    for (let i = 0; i < xs.length - 1; i++) {
      const [x0, x1] = [xs[i], xs[i + 1]];
      const [y0, y1] = [yAt(x0), yAt(x1)];
      // top cap (+Z), bottom cap (−Z), and the curved front strip
      mb.quad([x0, -hy, hz], [x1, -hy, hz], [x1, y1, hz], [x0, y0, hz],
        [u(x0), v(-hy)], [u(x1), v(-hy)], [u(x1), v(y1)], [u(x0), v(y0)]);
      mb.quad([x0, y0, -hz], [x1, y1, -hz], [x1, -hy, -hz], [x0, -hy, -hz],
        [u(x0), v(y0)], [u(x1), v(y1)], [u(x1), v(-hy)], [u(x0), v(-hy)]);
      mb.quad([x1, y1, -hz], [x0, y0, -hz], [x0, y0, hz], [x1, y1, hz],
        [u(x1), v(-hz)], [u(x0), v(-hz)], [u(x0), v(hz)], [u(x1), v(hz)]);
    }
    mb.quad([hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [-hx, -hy, -hz],
      [u(hx), v(-hz)], [u(hx), v(hz)], [u(-hx), v(hz)], [u(-hx), v(-hz)]);
    for (const s of [-1, 1]) {
      const p0: V3 = [s * hx, -hy, -hz];
      const p1: V3 = [s * hx, hy, -hz];
      const p2: V3 = [s * hx, hy, hz];
      const p3: V3 = [s * hx, -hy, hz];
      const quad = s > 0 ? [p0, p1, p2, p3] : [p1, p0, p3, p2];
      mb.quad(quad[0], quad[1], quad[2], quad[3],
        [v(quad[0][1]), v(quad[0][2])], [v(quad[1][1]), v(quad[1][2])],
        [v(quad[2][1]), v(quad[2][2])], [v(quad[3][1]), v(quad[3][2])]);
    }
    return mb.build();
  }

  if (arch === 'scoop') {
    // Finger pull, digitized from MEJA's to-scale drawing (15_3PULL): a
    // flat bottom with S-shoulders built from two 60° arcs of radius 5/6 ×
    // depth — the top arc tangent to the edge, the bottom arc tangent to
    // the flat — joined by a 60° straight. Scales uniformly with depth.
    const c = Math.max(hx - shoulder, 1);
    const R = (5 / 6) * rise;
    const arcDx = R * (Math.sqrt(3) / 2);
    const lineDx = (rise - R) / Math.sqrt(3);
    const run = 2 * arcDx + lineDx;
    // Openings too narrow for the full pattern compress the shoulders
    // horizontally; the cut depth holds.
    const k = Math.min(1, c / run);
    const drop = (t: number) => {
      if (t <= 0) return 0;
      if (t <= arcDx) return R - Math.sqrt(Math.max(R * R - t * t, 0));
      if (t <= arcDx + lineDx) return R / 2 + (t - arcDx) * Math.sqrt(3);
      if (t < run) {
        const tb = run - t; // distance to the flat
        return rise - (R - Math.sqrt(Math.max(R * R - tb * tb, 0)));
      }
      return rise;
    };
    const ztAt = (x: number) => {
      const ax = Math.abs(x);
      if (ax >= c) return hz;
      return hz - drop((c - ax) / k);
    };
    const segments = ARC_SEGMENTS * 2; // the S-curves need the extra samples
    const xs: number[] = [-hx];
    for (let i = 0; i <= segments; i++) xs.push(-c + (2 * c * i) / segments);
    xs.push(hx);
    for (let i = 0; i < xs.length - 1; i++) {
      const [x0, x1] = [xs[i], xs[i + 1]];
      if (x1 - x0 < 1e-6) continue;
      const [z0, z1] = [ztAt(x0), ztAt(x1)];
      // front cap (+Y), back cap (−Y), and the scooped top strip
      mb.quad([x0, hy, z0], [x1, hy, z1], [x1, hy, -hz], [x0, hy, -hz],
        [u(x0), v(z0)], [u(x1), v(z1)], [u(x1), v(-hz)], [u(x0), v(-hz)]);
      mb.quad([x0, -hy, -hz], [x1, -hy, -hz], [x1, -hy, z1], [x0, -hy, z0],
        [u(x0), v(-hz)], [u(x1), v(-hz)], [u(x1), v(z1)], [u(x0), v(z0)]);
      mb.quad([x0, -hy, z0], [x1, -hy, z1], [x1, hy, z1], [x0, hy, z0],
        [u(x0), v(-hy)], [u(x1), v(-hy)], [u(x1), v(hy)], [u(x0), v(hy)]);
    }
    mb.quad([-hx, hy, -hz], [hx, hy, -hz], [hx, -hy, -hz], [-hx, -hy, -hz],
      [u(-hx), v(hy)], [u(hx), v(hy)], [u(hx), v(-hy)], [u(-hx), v(-hy)]);
    for (const s of [-1, 1]) {
      const p0: V3 = [s * hx, -hy, -hz];
      const p1: V3 = [s * hx, hy, -hz];
      const p2: V3 = [s * hx, hy, hz];
      const p3: V3 = [s * hx, -hy, hz];
      const quad = s > 0 ? [p0, p1, p2, p3] : [p1, p0, p3, p2];
      mb.quad(quad[0], quad[1], quad[2], quad[3],
        [v(quad[0][1]), v(quad[0][2])], [v(quad[1][1]), v(quad[1][2])],
        [v(quad[2][1]), v(quad[2][2])], [v(quad[3][1]), v(quad[3][2])]);
    }
    return mb.build();
  }

  // bottom-x: relief arch along the length, flat shoulders at the ends.
  const c = Math.max(hx - shoulder, 1);
  const zAt = (x: number) => (Math.abs(x) >= c ? -hz : -hz + arcOffset(x, c, rise));
  const xs: number[] = [-hx];
  for (let i = 0; i <= ARC_SEGMENTS; i++) xs.push(-c + (2 * c * i) / ARC_SEGMENTS);
  xs.push(hx);
  for (let i = 0; i < xs.length - 1; i++) {
    const [x0, x1] = [xs[i], xs[i + 1]];
    if (x1 - x0 < 1e-6) continue;
    const [z0, z1] = [zAt(x0), zAt(x1)];
    // front cap (+Y), back cap (−Y), and the curved underside strip
    mb.quad([x0, hy, hz], [x1, hy, hz], [x1, hy, z1], [x0, hy, z0],
      [u(x0), v(hz)], [u(x1), v(hz)], [u(x1), v(z1)], [u(x0), v(z0)]);
    mb.quad([x0, -hy, z0], [x1, -hy, z1], [x1, -hy, hz], [x0, -hy, hz],
      [u(x0), v(z0)], [u(x1), v(z1)], [u(x1), v(hz)], [u(x0), v(hz)]);
    mb.quad([x1, -hy, z1], [x0, -hy, z0], [x0, hy, z0], [x1, hy, z1],
      [u(x1), v(-hy)], [u(x0), v(-hy)], [u(x0), v(hy)], [u(x1), v(hy)]);
  }
  mb.quad([-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
    [u(-hx), v(-hy)], [u(hx), v(-hy)], [u(hx), v(hy)], [u(-hx), v(hy)]);
  for (const s of [-1, 1]) {
    if (s > 0 && endSkew > 0) continue; // the +X end gets the angled trim below
    const p0: V3 = [s * hx, -hy, -hz];
    const p1: V3 = [s * hx, hy, -hz];
    const p2: V3 = [s * hx, hy, hz];
    const p3: V3 = [s * hx, -hy, hz];
    const quad = s > 0 ? [p0, p1, p2, p3] : [p1, p0, p3, p2];
    mb.quad(quad[0], quad[1], quad[2], quad[3],
      [v(quad[0][1]), v(quad[0][2])], [v(quad[1][1]), v(quad[1][2])],
      [v(quad[2][1]), v(quad[2][2])], [v(quad[3][1]), v(quad[3][2])]);
  }
  if (endSkew > 0) {
    // Angled end trim: the end face leans out so the board grows by endSkew at
    // its lower edge — the shoulder that meets a raked leg face.
    const xe = hx + endSkew;
    mb.quad([xe, -hy, -hz], [xe, hy, -hz], [hx, hy, hz], [hx, -hy, hz],
      [v(-hy), v(-hz)], [v(hy), v(-hz)], [v(hy), v(hz)], [v(-hy), v(hz)]);
    mb.quad([xe, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [xe, hy, -hz],
      [u(xe), v(-hy)], [u(hx), v(-hy)], [u(hx), v(hy)], [u(xe), v(hy)]);
    mb.quad([hx, hy, hz], [xe, hy, -hz], [hx, hy, -hz], [hx, hy, -hz],
      [u(hx), v(hz)], [u(xe), v(-hz)], [u(hx), v(-hz)], [u(hx), v(-hz)]);
    mb.quad([hx, -hy, hz], [hx, -hy, -hz], [xe, -hy, -hz], [xe, -hy, -hz],
      [u(hx), v(hz)], [u(hx), v(-hz)], [u(xe), v(-hz)], [u(xe), v(-hz)]);
  }
  return mb.build();
}

/**
 * Slab with rounded front (+Y) corners — tambour console tops and bottoms.
 * Extruded flat through its thickness. `edge` rounds the top and bottom
 * arrises: the outline insets by the edge radius and circular extrude
 * bevels (bevelSize = bevelThickness) carry it back out, so the overall
 * W × D × T stays exact. The caller applies engine box UVs
 * (ExtrudeGeometry's own UVs are unusable).
 */
export function roundedSlabGeometry(
  size: V3,
  radius: number,
  edge = 0,
  corners: 'front' | 'all' = 'front',
  /** 'both' rounds top and bottom arrises; 'top' leaves the bottom square. */
  edgeMode: 'both' | 'top' = 'both',
): THREE.BufferGeometry {
  const [w, d, t] = size;
  const reMax = edgeMode === 'top' ? t - 0.2 : t / 2 - 0.1;
  const re = Math.max(0, Math.min(edge, reMax, w / 4, d / 4));
  const outline = (ww: number, dd: number, r: number) => {
    const shape = new THREE.Shape();
    if (corners === 'all') {
      shape.moveTo(-ww / 2 + r, -dd / 2);
      shape.lineTo(ww / 2 - r, -dd / 2);
      shape.absarc(ww / 2 - r, -dd / 2 + r, r, -Math.PI / 2, 0, false);
      shape.lineTo(ww / 2, dd / 2 - r);
      shape.absarc(ww / 2 - r, dd / 2 - r, r, 0, Math.PI / 2, false);
      shape.lineTo(-ww / 2 + r, dd / 2);
      shape.absarc(-ww / 2 + r, dd / 2 - r, r, Math.PI / 2, Math.PI, false);
      shape.lineTo(-ww / 2, -dd / 2 + r);
      shape.absarc(-ww / 2 + r, -dd / 2 + r, r, Math.PI, Math.PI * 1.5, false);
      return shape;
    }
    shape.moveTo(-ww / 2, -dd / 2);
    shape.lineTo(ww / 2, -dd / 2);
    shape.lineTo(ww / 2, dd / 2 - r);
    shape.absarc(ww / 2 - r, dd / 2 - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-ww / 2 + r, dd / 2);
    shape.absarc(-ww / 2 + r, dd / 2 - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-ww / 2, -dd / 2);
    return shape;
  };
  if (re < 0.5) {
    const r = Math.min(radius, w / 2 - 0.1, d - 0.1);
    const geometry = new THREE.ExtrudeGeometry(outline(w, d, r), {
      depth: t,
      bevelEnabled: false,
      curveSegments: ARC_SEGMENTS,
    });
    geometry.translate(0, 0, -t / 2);
    return geometry;
  }
  const r = Math.min(Math.max(radius - re, 0.5), (w - 2 * re) / 2 - 0.1, d - 2 * re - 0.1);
  if (edgeMode === 'top') {
    // Half bullnose, built explicitly: a square body carries the bottom
    // arris, and a quarter-round band sweeps from the full outline at the
    // body's top straight up and inward, landing flush in the inset top
    // face — one arc, no under-curl. (The extrude-bevel trick can't do
    // this: its mirror half pokes out once the radius nears the
    // thickness.)
    const reT = Math.min(re, t - 0.6); // keep a hair of square wall below
    const rcFull = Math.min(radius, w / 2 - 0.1, d - 0.1);
    const rIns = Math.max(rcFull - reT, 0.5);
    const body = new THREE.ExtrudeGeometry(outline(w, d, rcFull), {
      depth: t - reT,
      bevelEnabled: false,
      curveSegments: ARC_SEGMENTS,
    });
    body.translate(0, 0, -t / 2);
    // Quarter-round band: rings between the inset top outline and the full
    // outline, offset re·sinθ outward and re·(1−cosθ) down from the top.
    const RING_DIVS = 12;
    const STEPS = 10;
    const rings: THREE.Vector2[][] = [];
    const zs: number[] = [];
    for (let k = 0; k <= STEPS; k++) {
      const th = (k / STEPS) * (Math.PI / 2);
      const s = reT * Math.sin(th);
      rings.push(outline(w - 2 * reT + 2 * s, d - 2 * reT + 2 * s, rIns + s).getPoints(RING_DIVS));
      zs.push(t / 2 - reT * (1 - Math.cos(th)));
    }
    const pos: number[] = [];
    for (let k = 0; k < STEPS; k++) {
      const upper = rings[k];
      const lower = rings[k + 1];
      const n = Math.min(upper.length, lower.length);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        // CCW outline, lower ring wider: wind for outward-facing normals.
        pos.push(lower[i].x, lower[i].y, zs[k + 1], lower[j].x, lower[j].y, zs[k + 1], upper[j].x, upper[j].y, zs[k]);
        pos.push(lower[i].x, lower[i].y, zs[k + 1], upper[j].x, upper[j].y, zs[k], upper[i].x, upper[i].y, zs[k]);
      }
    }
    const bandGeo = new THREE.BufferGeometry();
    bandGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    bandGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    bandGeo.computeVertexNormals();
    const cap = new THREE.ShapeGeometry(outline(w - 2 * reT, d - 2 * reT, rIns), RING_DIVS)
      .toNonIndexed();
    cap.translate(0, 0, t / 2);
    const merged = mergeGeometries([body, bandGeo, cap], false)!;
    body.dispose();
    bandGeo.dispose();
    cap.dispose();
    return merged;
  }
  const band = t - 2 * re;
  const geometry = new THREE.ExtrudeGeometry(outline(w - 2 * re, d - 2 * re, r), {
    depth: band,
    bevelEnabled: true,
    bevelThickness: re,
    bevelSize: re,
    bevelOffset: 0,
    bevelSegments: 8,
    curveSegments: ARC_SEGMENTS,
  });
  geometry.translate(0, 0, -band / 2);
  return geometry;
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
  uvOrigin: V3 = [0, 0, 0],
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
        (p[uAxis] + uvOrigin[uAxis]) / GRAIN_MM_U + uvOffset[0],
        (p[vAxis] + uvOrigin[vAxis]) / GRAIN_MM_V + uvOffset[1],
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
 * outer faces stay straight while the inner faces taper). `shift` offsets the bottom
 * face further — a sheared prism for raked legs with level end cuts. Grain runs along
 * Z (legs). Model space, Z-up.
 */
export function taperedBoxGeometry(
  top: [number, number],
  bottom: [number, number],
  height: number,
  align: [number, number],
  shift: UV = [0, 0],
  uvOffset: UV = [0, 0],
  uvOrigin: V3 = [0, 0, 0],
  axis: 'x' | 'y' | 'z' = 'z',
): THREE.BufferGeometry {
  const [tw, td] = top;
  const [bw, bd] = bottom;
  const hz = height / 2;
  const ox = (align[0] * (tw - bw)) / 2 + shift[0];
  const oy = (align[1] * (td - bd)) / 2 + shift[1];

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
    (p[2] + uvOrigin[2]) / GRAIN_MM_U + uvOffset[0],
    (p[0] + uvOrigin[0] + p[1] + uvOrigin[1]) / GRAIN_MM_V + uvOffset[1],
  ];
  const cap = (p: V3): UV => [
    (p[0] + uvOrigin[0]) / GRAIN_MM_U + uvOffset[0],
    (p[1] + uvOrigin[1]) / GRAIN_MM_V + uvOffset[1],
  ];

  const mb = new MeshBuilder();
  mb.quad(t[0], t[1], t[2], t[3], cap(t[0]), cap(t[1]), cap(t[2]), cap(t[3])); // top (+Z)
  mb.quad(b[0], b[3], b[2], b[1], cap(b[0]), cap(b[3]), cap(b[2]), cap(b[1])); // bottom (−Z)
  mb.quad(b[0], b[1], t[1], t[0], side(b[0]), side(b[1]), side(t[1]), side(t[0])); // −Y
  mb.quad(b[1], b[2], t[2], t[1], side(b[1]), side(b[2]), side(t[2]), side(t[1])); // +X
  mb.quad(b[2], b[3], t[3], t[2], side(b[2]), side(b[3]), side(t[3]), side(t[2])); // +Y
  mb.quad(b[3], b[0], t[0], t[3], side(b[3]), side(b[0]), side(t[0]), side(t[3])); // −X
  const geo = mb.build();
  // Horizontal taper axes (dovetail tails/pins): build along Z, then lie down.
  if (axis === 'y') geo.rotateX(-Math.PI / 2);
  else if (axis === 'x') geo.rotateY(Math.PI / 2);
  return geo;
}
