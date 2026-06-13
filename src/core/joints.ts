// Joinery engine: a post-process over a generated part list that re-cuts the
// joint between two user-picked parts into the chosen style. Works on the
// parts' geometry (not the component generator), so any two touching parts
// can be jointed. Conservative by design — if a pair or style can't be
// applied to the geometry at hand, the parts are returned unchanged.

import type { BBox } from './evaluate';
import type { JointStyle, Part, Primitive } from './types';
import { inch } from './units';

const TOL = 1; // mm, faces within this are "touching"

type PostMortiseFace = 'x+' | 'x-' | 'y+' | 'y-';

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
  const endStyles: JointStyle[] = ['mortise-tenon', 'french-dovetail', 'dowel', 'butt'];
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

/** The tenon's perpendicular cross-section for a rail meeting a leg along
 * `axis`: which perp axis is thickness vs width, and each one's size. */
function tenonCrossSection(ra: BBox, axis: number) {
  const perp = [0, 1, 2].filter((i) => i !== axis);
  const [thinAxis, wideAxis] = size(ra, perp[0]) <= size(ra, perp[1]) ? perp : [perp[1], perp[0]];
  const thin = size(ra, thinAxis) * TENON_FRACTION;
  const wide = Math.max(size(ra, wideAxis) - 2 * SHOULDER, size(ra, wideAxis) * 0.4);
  return { thinAxis, wideAxis, thin, wide };
}

/** Adds a centered tenon to the rail, projecting from its end into the leg. */
function tenonPrims(rail: Part, ra: BBox, la: BBox, axis: number, tenonLen: number): Primitive[] {
  const body = bodyBox(rail);
  if (!body) return [];
  const { thinAxis, wideAxis, thin, wide } = tenonCrossSection(ra, axis);
  const dims: [number, number, number] = [...body.size];
  const at: [number, number, number] = [...body.at];
  const dir = Math.sign(center(la, axis) - center(ra, axis)) || 1;
  const railEnd = center(ra, axis) + (dir * size(ra, axis)) / 2;
  dims[axis] = tenonLen;
  dims[thinAxis] = thin;
  dims[wideAxis] = wide;
  at[axis] = railEnd + (dir * tenonLen) / 2;
  at[thinAxis] = center(ra, thinAxis);
  at[wideAxis] = center(ra, wideAxis);
  const grain = (['x', 'y', 'z'] as const)[axis];
  return [{ shape: 'box', size: dims, at, grain }];
}

/** Maps a tapered tongue's perpendicular axes to taperedBox's [first, second]
 * cross-section slots for a given projection axis (verified empirically). */
const TAPER_ORDER: Record<number, [number, number]> = { 0: [2, 1], 1: [0, 2], 2: [0, 1] };

/** Adds a French (sliding) dovetail tongue to the rail: a key projecting from
 * the rail end that flares wider toward its tip, in the board's wide axis —
 * the male half digitized from MEJA's drawing. The mating socket is cut by
 * the same mortise routine (it holds the tongue's tip section). */
function dovetailTonguePrims(ra: BBox, la: BBox, axis: number, proj: number): Primitive[] {
  const { thinAxis, wideAxis, thin, wide } = tenonCrossSection(ra, axis);
  const flare = Math.min(proj * 0.19, ((wide - thin) / 2) * 0.6); // ~10.7° dovetail
  const tipWide = wide;
  const rootWide = Math.max(wide - 2 * flare, thin * 1.2);
  const dir = Math.sign(center(la, axis) - center(ra, axis)) || 1;
  const railEnd = center(ra, axis) + (dir * size(ra, axis)) / 2;
  const [f, s] = TAPER_ORDER[axis];
  const dim = (perpAxis: number, wideVal: number): number => (perpAxis === wideAxis ? wideVal : thin);
  const tip: [number, number] = [dim(f, tipWide), dim(s, tipWide)];
  const root: [number, number] = [dim(f, rootWide), dim(s, rootWide)];
  const at: [number, number, number] = [0, 0, 0];
  at[axis] = railEnd + (dir * proj) / 2;
  at[thinAxis] = center(ra, thinAxis);
  at[wideAxis] = center(ra, wideAxis);
  return [
    {
      shape: 'taperedBox',
      top: dir > 0 ? tip : root, // taperedBox 'top' is the +axis end
      bottom: dir > 0 ? root : tip,
      height: proj,
      at,
      align: [0, 0],
      axis: (['x', 'y', 'z'] as const)[axis],
    },
  ];
}

/**
 * Cuts a blind mortise into the leg, matching the rail's tenon. The leg
 * becomes a `mortisedPost` (preserving a roundedSlab's corner radius, or a
 * square post for a box leg). Multiple joints on one leg accumulate into the
 * same post. Legs that aren't post-shaped (tapered, etc.) return null.
 */
function mortiseLeg(leg: Part, la: BBox, ra: BBox, axis: number, depth: number): Part | null {
  if (axis === 2) return null; // mortise on a post's end face — not supported
  const { thinAxis, wideAxis, thin, wide } = tenonCrossSection(ra, axis);
  // In-face horizontal axis = the perp axis that isn't the post length (Z=2).
  const horiz = axis === 0 ? 1 : 0;
  const horizSize = horiz === thinAxis ? thin : wide;
  const vertSize = 2 === thinAxis ? thin : wide; // along the post length (Z)
  void wideAxis;
  const dir = Math.sign(center(ra, axis) - center(la, axis)) || 1; // toward the rail
  const face = (['x', 'y'] as const)[axis] + (dir > 0 ? '+' : '-');

  // Find an existing post to extend, or convert the leg's body primitive.
  const existing = leg.primitives.find((p) => p.shape === 'mortisedPost') as
    | Extract<Primitive, { shape: 'mortisedPost' }>
    | undefined;
  const zLocalCenter = (Math.max(la.min[2], ra.min[2]) + Math.min(la.max[2], ra.max[2])) / 2;

  if (existing) {
    const zLocal = zLocalCenter - existing.at[2];
    const mortises = [
      ...existing.mortises,
      { face: face as PostMortiseFace, z: zLocal, width: horizSize, height: vertSize, depth },
    ];
    const updated: Primitive = { ...existing, mortises };
    return { ...leg, primitives: leg.primitives.map((p) => (p === existing ? updated : p)) };
  }

  // Convert a roundedSlab or box body to a mortised post.
  const slab = leg.primitives.find((p) => p.shape === 'roundedSlab') as
    | Extract<Primitive, { shape: 'roundedSlab' }>
    | undefined;
  const box = bodyBox(leg);
  const src = slab ?? box;
  if (!src) return null;
  const sz: [number, number, number] = slab ? slab.size : box!.size;
  const at: [number, number, number] = slab ? slab.at : box!.at;
  const radius = slab ? slab.radius : 0;
  const post: Primitive = {
    shape: 'mortisedPost',
    size: sz,
    at,
    radius,
    grain: 'z',
    mortises: [{ face: face as PostMortiseFace, z: zLocalCenter - at[2], width: horizSize, height: vertSize, depth }],
  };
  const others = leg.primitives.filter((p) => p !== src);
  return { ...leg, primitives: [post, ...others] };
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
      if (style === 'mortise-tenon' || style === 'french-dovetail') {
        const male =
          style === 'french-dovetail'
            ? dovetailTonguePrims(ra, la, joint.axis, tenonLen)
            : tenonPrims(rail, ra, la, joint.axis, tenonLen);
        result.set(joint.railId, { ...rail, primitives: [...rail.primitives, ...male] });
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
