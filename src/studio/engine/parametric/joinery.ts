/**
 * Interlocking corner joinery geometry: through dovetails and box joints.
 *
 * Both boards of a corner share the joint volume; the profile that
 * partitions it is constant through the tails-board thickness, so every
 * piece is an extrusion of a 2D outline:
 *
 * - tails board (drawer sides): one outline — the full board silhouette in
 *   its length/height plane with toothed ends — extruded through its
 *   thickness.
 * - pins board (fronts/backs): a plain central body plus the complementary
 *   pin prisms at each end.
 *
 * All inputs in meters (scene units). Tails flare ~1:6 for dovetails and
 * not at all for box joints.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface JointSpec {
  type: 'dovetail' | 'boxjoint';
  /** Joint depth = mating board thickness (m). */
  depth: number;
}

export interface ScoopSpec {
  /** Full width of the finger scoop (m). */
  width: number;
  /** Depth of the scoop below the top edge (m). */
  depth: number;
}

/**
 * Board outline in the (x, y) plane with an optional elliptical finger
 * scoop in the top edge, as a centered extrusion along z.
 */
export function scoopedBoardGeometry(
  length: number,
  height: number,
  thickness: number,
  scoop: ScoopSpec,
): THREE.BufferGeometry {
  const a = Math.min(scoop.width / 2, length * 0.45);
  const b = Math.min(scoop.depth, height * 0.6);
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(-length / 2, -height / 2),
    new THREE.Vector2(length / 2, -height / 2),
    new THREE.Vector2(length / 2, height / 2),
  ];
  const segments = 18;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI;
    pts.push(new THREE.Vector2(a * Math.cos(theta), height / 2 - b * Math.sin(theta)));
  }
  pts.push(new THREE.Vector2(-length / 2, height / 2));
  const shape = new THREE.Shape(pts);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.translate(0, 0, -thickness / 2);
  return geometry;
}

interface JointLayout {
  /** Pin width at the outer face (m). */
  pinTip: number;
  /** Tail width at the outer face (m). */
  tailWide: number;
  /** Flare per side over the joint depth (m). 0 for box joints. */
  flare: number;
  /** Tail center heights, measured from board bottom (m). */
  tailCenters: number[];
}

function layoutJoint(height: number, spec: JointSpec): JointLayout | null {
  const flare = spec.type === 'dovetail' ? spec.depth * 0.17 : 0;
  const pinTip = Math.min(Math.max(spec.depth * 0.6, 0.006), 0.014);
  let tailCount = Math.max(1, Math.floor(height / 0.045));
  let tailWide = 0;
  while (tailCount >= 1) {
    tailWide = (height - (tailCount + 1) * pinTip) / tailCount;
    if (tailWide >= Math.max(pinTip * 1.2, 2 * flare + 0.004)) break;
    tailCount -= 1;
  }
  if (tailCount < 1) return null; // board too small — caller falls back to a plain box
  const tailCenters: number[] = [];
  for (let k = 0; k < tailCount; k++) {
    tailCenters.push(pinTip + tailWide / 2 + k * (pinTip + tailWide));
  }
  return { pinTip, tailWide, flare, tailCenters };
}

/**
 * Tails board: length along local X of the returned outline, height along Y,
 * extruded along Z by `thickness`, then rotated so length runs along the
 * requested world axis by the caller. Returns a centered geometry with
 * length × height × thickness mapped to (z, y, x) — the drawer-side
 * orientation — or null when the board is too small for the joint.
 */
export function tailsBoardGeometry(
  thickness: number,
  height: number,
  length: number,
  spec: JointSpec,
): THREE.BufferGeometry | null {
  const joint = layoutJoint(height, spec);
  if (!joint) return null;
  const { flare, tailWide, tailCenters } = joint;
  const zo = length / 2;
  const zi = zo - spec.depth;
  const yBottom = -height / 2;

  const points: Array<[number, number]> = [];
  // Bottom edge between the two baselines.
  points.push([-zi, yBottom], [zi, yBottom]);
  // Right toothed end, bottom to top.
  for (const c of tailCenters) {
    const cy = yBottom + c;
    points.push(
      [zi, cy - tailWide / 2 + flare],
      [zo, cy - tailWide / 2],
      [zo, cy + tailWide / 2],
      [zi, cy + tailWide / 2 - flare],
    );
  }
  points.push([zi, height / 2]);
  // Top edge.
  points.push([-zi, height / 2]);
  // Left toothed end, top to bottom (mirror of the right end).
  for (const c of [...tailCenters].reverse()) {
    const cy = yBottom + c;
    points.push(
      [-zi, cy + tailWide / 2 - flare],
      [-zo, cy + tailWide / 2],
      [-zo, cy - tailWide / 2],
      [-zi, cy - tailWide / 2 + flare],
    );
  }

  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.translate(0, 0, -thickness / 2);
  // Shape X was board length: map (shapeX, shapeY, extrude) → (−z, y, x).
  geometry.rotateY(-Math.PI / 2);
  return geometry;
}

/**
 * Pins board: body along local X with complementary pin prisms at each end.
 * Returns a centered geometry with length × height × thickness mapped to
 * (x, y, z) — the drawer front/back orientation.
 */
export function pinsBoardGeometry(
  length: number,
  height: number,
  thickness: number,
  spec: JointSpec,
  /** +1 when the board's outer face is at +Z (a front), −1 for a back. */
  outerSign: 1 | -1,
  scoop?: ScoopSpec,
): THREE.BufferGeometry | null {
  const joint = layoutJoint(height, spec);
  if (!joint) return null;
  const { tailWide, flare, tailCenters } = joint;
  const yBottom = -height / 2;
  const zOuter = (thickness / 2) * outerSign;
  const zInner = -zOuter;

  const body = scoop
    ? scoopedBoardGeometry(length - 2 * spec.depth, height, thickness, scoop)
    : new THREE.BoxGeometry(length - 2 * spec.depth, height, thickness);
  const pieces: THREE.BufferGeometry[] = [body];

  // Pin regions are the y-gaps between/outside the tails: trapezoids in the
  // (z, y) plane — pin tips at the outer face, flaring at the inner face,
  // except along the board edges (half pins stay flush).
  const gaps: Array<[number, number, boolean, boolean]> = [];
  let cursor = yBottom;
  for (const c of tailCenters) {
    const tailBottom = yBottom + c - tailWide / 2;
    gaps.push([cursor, tailBottom, cursor === yBottom, false]);
    cursor = yBottom + c + tailWide / 2;
  }
  gaps.push([cursor, height / 2, false, true]);

  for (const [g0, g1, atBottom, atTop] of gaps) {
    const f0 = atBottom ? 0 : flare;
    const f1 = atTop ? 0 : flare;
    // rotateY(π/2) maps shape (sx, sy, extrude) → world (extrude, sy, −sx),
    // so shape X carries the NEGATED z coordinate.
    const shape = new THREE.Shape([
      new THREE.Vector2(-zOuter, g0),
      new THREE.Vector2(-zOuter, g1),
      new THREE.Vector2(-zInner, g1 + f1),
      new THREE.Vector2(-zInner, g0 - f0),
    ]);
    const prism = new THREE.ExtrudeGeometry(shape, { depth: spec.depth, bevelEnabled: false });
    prism.rotateY(Math.PI / 2);
    // The cross-section is uniform along the board, so both ends use the
    // same prism, just translated into place.
    const right = prism.clone();
    right.translate(length / 2 - spec.depth, 0, 0);
    const left = prism;
    left.translate(-length / 2, 0, 0);
    pieces.push(left, right);
  }

  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  return merged!;
}
