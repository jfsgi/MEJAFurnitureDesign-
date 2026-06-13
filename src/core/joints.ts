// Joinery engine: a post-process over a generated part list that re-cuts the
// joint between two user-picked parts into the chosen style. Works on the
// parts' geometry (not the component generator), so any two touching parts
// can be jointed. Conservative by design — if a pair or style can't be
// applied to the geometry at hand, the parts are returned unchanged.

import type { BBox } from './evaluate';
import type { JointStyle, Part, Primitive } from './types';
import { inch } from './units';

const TOL = 1; // mm, faces within this are "touching"

export interface DetectedJoint {
  kind: 'end-face' | 'corner';
  aId: string;
  bId: string;
  /** Interface axis (0=x,1=y,2=z) — the normal of the shared face. */
  axis: 0 | 1 | 2;
  /** end-face: which part is the rail (tenoned) vs the leg (mortised). */
  railId?: string;
  legId?: string;
  styles: JointStyle[];
}

/** Stable key for a joint, independent of pick order. */
export function jointKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

const size = (b: BBox, i: number) => b.max[i] - b.min[i];
const center = (b: BBox, i: number) => (b.min[i] + b.max[i]) / 2;
const longest = (b: BBox): 0 | 1 | 2 => {
  const s = [size(b, 0), size(b, 1), size(b, 2)];
  if (s[0] >= s[1] && s[0] >= s[2]) return 0;
  return s[1] >= s[2] ? 1 : 2;
};

/** Classifies the joint between two parts from their bounding boxes, or null
 * if they don't touch. */
export function detectJoint(a: Part, b: Part, ba: BBox, bb: BBox): DetectedJoint | null {
  const overlap = [0, 1, 2].map((i) => Math.min(ba.max[i], bb.max[i]) - Math.max(ba.min[i], bb.min[i]));
  if (overlap.some((o) => o < -TOL)) return null; // separated on some axis → not touching
  // Interface axis = the one where they barely overlap (meet face-to-face).
  let axis: 0 | 1 | 2 = 0;
  for (const i of [1, 2] as const) if (overlap[i] < overlap[axis]) axis = i;
  const longA = longest(ba);
  const longB = longest(bb);
  const cornerStyles: JointStyle[] = [
    'through-dovetail',
    'half-blind-dovetail',
    'french-dovetail',
    'box-joint',
    'butt',
  ];
  const endStyles: JointStyle[] = ['mortise-tenon', 'dowel', 'butt'];
  // A rail runs along the interface axis (its end meets the other's face).
  if (longA === axis && longB !== axis)
    return { kind: 'end-face', aId: a.id, bId: b.id, axis, railId: a.id, legId: b.id, styles: endStyles };
  if (longB === axis && longA !== axis)
    return { kind: 'end-face', aId: a.id, bId: b.id, axis, railId: b.id, legId: a.id, styles: endStyles };
  return { kind: 'corner', aId: a.id, bId: b.id, axis, styles: cornerStyles };
}

/** The largest box primitive of a part (the body we cut joints into). */
function bodyBox(part: Part): Extract<Primitive, { shape: 'box' }> | null {
  let best: Extract<Primitive, { shape: 'box' }> | null = null;
  let vol = 0;
  for (const p of part.primitives) {
    if (p.shape !== 'box') continue;
    const v = p.size[0] * p.size[1] * p.size[2];
    if (v > vol) {
      vol = v;
      best = p;
    }
  }
  return best;
}

const TENON_FRACTION = 1 / 3;
const SHOULDER = inch(0.375);

/** Adds a centered tenon to the rail, projecting from its end into the leg. */
function tenonPrims(rail: Part, ra: BBox, la: BBox, axis: number, tenonLen: number): Primitive[] {
  const body = bodyBox(rail);
  if (!body) return [];
  const perp = [0, 1, 2].filter((i) => i !== axis);
  const dims: [number, number, number] = [...body.size];
  const at: [number, number, number] = [...body.at];
  // The rail end on the leg side.
  const dir = Math.sign(center(la, axis) - center(ra, axis)) || 1;
  const railEnd = center(ra, axis) + (dir * size(ra, axis)) / 2;
  // Thickness = smaller perpendicular dim; width = larger.
  const [pThin, pWide] = size(ra, perp[0]) <= size(ra, perp[1]) ? perp : [perp[1], perp[0]];
  dims[axis] = tenonLen;
  dims[pThin] = size(ra, pThin) * TENON_FRACTION;
  dims[pWide] = Math.max(size(ra, pWide) - 2 * SHOULDER, size(ra, pWide) * 0.4);
  at[axis] = railEnd + (dir * tenonLen) / 2;
  at[pThin] = center(ra, pThin);
  at[pWide] = center(ra, pWide);
  const grain = (['x', 'y', 'z'] as const)[axis];
  return [{ shape: 'box', size: dims, at, grain }];
}

/** Rebuilds a box leg with a blind mortise pocket cut into one face: a back
 * slab plus a four-piece frame around the opening (CSG-free, real void). */
function mortiseLeg(leg: Part, la: BBox, ra: BBox, axis: number, depth: number): Part | null {
  const body = bodyBox(leg);
  if (!body) return null;
  const perp = [0, 1, 2].filter((i) => i !== axis);
  const dir = Math.sign(center(ra, axis) - center(la, axis)) || 1; // toward the rail
  const face = center(la, axis) + (dir * body.size[axis]) / 2;
  // Pocket cross-section = the tenon's (thickness × width), centered on the
  // overlap with the rail.
  const pocket: Record<number, [number, number]> = {}; // axis → [center, half]
  for (const i of perp) {
    const c = (Math.max(la.min[i], ra.min[i]) + Math.min(la.max[i], ra.max[i])) / 2;
    const railSize = ra.max[i] - ra.min[i];
    const isThin = railSize <= ra.max[perp[0] === i ? perp[1] : perp[0]] - ra.min[perp[0] === i ? perp[1] : perp[0]];
    const half = (isThin ? railSize * TENON_FRACTION : Math.max(railSize - 2 * SHOULDER, railSize * 0.4)) / 2;
    pocket[i] = [c, half];
  }
  const box = (sz: [number, number, number], at: [number, number, number]): Primitive => ({
    shape: 'box',
    size: sz,
    at,
    grain: body.grain,
  });
  const prims: Primitive[] = [];
  // Back slab: the leg minus the pocket-depth layer on the rail side.
  const backSize: [number, number, number] = [...body.size];
  const backAt: [number, number, number] = [...body.at];
  backSize[axis] = body.size[axis] - depth;
  backAt[axis] = body.at[axis] - (dir * depth) / 2;
  prims.push(box(backSize, backAt));
  // Front layer (thickness = depth), framed around the pocket on perp axes.
  const layerAt = face - (dir * depth) / 2;
  const [p, q] = perp;
  const lp = body.at[p] - body.size[p] / 2;
  const hp = body.at[p] + body.size[p] / 2;
  const lq = body.at[q] - body.size[q] / 2;
  const hq = body.at[q] + body.size[q] / 2;
  const [pc, ph] = pocket[p];
  const [qc, qh] = pocket[q];
  const frame: Array<[number, number, number, number]> = [
    [lp, pc - ph, lq, hq], // p-low strip (full q)
    [pc + ph, hp, lq, hq], // p-high strip (full q)
    [pc - ph, pc + ph, lq, qc - qh], // q-low between
    [pc - ph, pc + ph, qc + qh, hq], // q-high between
  ];
  for (const [p0, p1, q0, q1] of frame) {
    if (p1 - p0 < 0.5 || q1 - q0 < 0.5) continue;
    const sz: [number, number, number] = [0, 0, 0];
    const at: [number, number, number] = [0, 0, 0];
    sz[axis] = depth;
    at[axis] = layerAt;
    sz[p] = p1 - p0;
    at[p] = (p0 + p1) / 2;
    sz[q] = q1 - q0;
    at[q] = (q0 + q1) / 2;
    prims.push(box(sz, at));
  }
  const others = leg.primitives.filter((pr) => pr !== body);
  return { ...leg, primitives: [...prims, ...others] };
}

/** Two dowels spanning the interface, set in from the rail's edges. */
function dowelPrims(ra: BBox, la: BBox, axis: number): Primitive[] {
  const perp = [0, 1, 2].filter((i) => i !== axis);
  const [pWide, pThin] = size(ra, perp[0]) >= size(ra, perp[1]) ? perp : [perp[1], perp[0]];
  const dir = Math.sign(center(la, axis) - center(ra, axis)) || 1;
  const railEnd = center(ra, axis) + (dir * size(ra, axis)) / 2;
  const r = Math.min(inch(0.1875), size(ra, pThin) * 0.3);
  const len = inch(1.25);
  const inset = size(ra, pWide) * 0.25;
  return [-1, 1].map((s) => {
    const at: [number, number, number] = [0, 0, 0];
    at[axis] = railEnd + (dir * len) / 2 - dir * (len / 2);
    at[axis] = railEnd; // dowel centered on the interface
    at[pWide] = center(ra, pWide) + s * inset;
    at[pThin] = center(ra, pThin);
    // cylinder axis is Z pre-rotation; we approximate with a thin box dowel
    // so it follows the interface axis without extra rotation plumbing.
    const sz: [number, number, number] = [0, 0, 0];
    sz[axis] = len;
    sz[pWide] = 2 * r;
    sz[pThin] = 2 * r;
    return { shape: 'box', size: sz, at, grain: (['x', 'y', 'z'] as const)[axis] } as Primitive;
  });
}

/**
 * Applies the instance's joint overrides to a generated part list.
 * `bbox` supplies each part's bounding box (the caller has primCorners).
 */
export function applyJoints(
  parts: Part[],
  joints: Record<string, JointStyle> | undefined,
  bbox: (p: Part) => BBox | null,
): Part[] {
  if (!joints || Object.keys(joints).length === 0) return parts;
  const byId = new Map(parts.map((p) => [p.id, p]));
  const boxes = new Map<string, BBox>();
  for (const p of parts) {
    const b = bbox(p);
    if (b) boxes.set(p.id, b);
  }
  // Work on a shallow-cloned, replaceable map so a leg can be rebuilt.
  const result = new Map(byId);

  for (const [key, style] of Object.entries(joints)) {
    const [idA, idB] = key.split('|');
    const a = result.get(idA);
    const b = result.get(idB);
    const ba = boxes.get(idA);
    const bb = boxes.get(idB);
    if (!a || !b || !ba || !bb) continue;
    const joint = detectJoint(a, b, ba, bb);
    if (!joint || !joint.styles.includes(style) || style === 'butt') continue;

    if (joint.kind === 'end-face' && joint.railId && joint.legId) {
      const rail = result.get(joint.railId)!;
      const leg = result.get(joint.legId)!;
      const ra = boxes.get(joint.railId)!;
      const la = boxes.get(joint.legId)!;
      const tenonLen = Math.min(inch(0.875), size(la, joint.axis) * 0.6);
      if (style === 'mortise-tenon') {
        result.set(joint.railId, { ...rail, primitives: [...rail.primitives, ...tenonPrims(rail, ra, la, joint.axis, tenonLen)] });
        const mortised = mortiseLeg(leg, la, ra, joint.axis, tenonLen);
        if (mortised) result.set(joint.legId, mortised);
      } else if (style === 'dowel') {
        result.set(joint.railId, { ...rail, primitives: [...rail.primitives, ...dowelPrims(ra, la, joint.axis)] });
      }
    }
    // Corner dovetail/box styles are recorded but applied by the component
    // generators that own those boards (drawer/case corners); the generic
    // post-process leaves them unchanged here.
  }
  return [...result.values()];
}
