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
  // Atelier3D extension: shop dovetail proportions — slim 1/16" half-pins at
  // the board edges with pins about a stock-thickness wide between the tails.
  // Box joints keep even fingers running from the edges.
  const pinTip =
    spec.type === 'dovetail'
      ? Math.min(Math.max(spec.depth, 0.0095), 0.019)
      : Math.min(Math.max(spec.depth * 0.6, 0.006), 0.014);
  const edgePin = spec.type === 'dovetail' ? 0.0015875 : pinTip;
  let tailCount = Math.max(1, Math.floor(height / 0.045));
  let tailWide = 0;
  while (tailCount >= 1) {
    tailWide = (height - 2 * edgePin - (tailCount - 1) * pinTip) / tailCount;
    if (tailWide >= Math.max(pinTip * 1.2, 2 * flare + 0.004)) break;
    tailCount -= 1;
  }
  if (tailCount < 1) return null; // board too small — caller falls back to a plain box
  const tailCenters: number[] = [];
  for (let k = 0; k < tailCount; k++) {
    tailCenters.push(edgePin + tailWide / 2 + k * (pinTip + tailWide));
  }
  return { pinTip, tailWide, flare, tailCenters };
}

/**
 * Tails board: length along local X of the returned outline, height along Y,
 * extruded along Z by `thickness`, then rotated so length runs along the
 * requested world axis by the caller. Returns a centered geometry with
 * length × height × thickness mapped to (z, y, x) — the drawer-side
 * orientation — or null when the board is too small for the joint.
 * `frontDepth` shortens the +z end's engagement (half-blind: the tails
 * stop at the lap, depth = mating stock − lip); `backDepth` does the same
 * for the −z end (half-blind case corners at both ends).
 */
export function tailsBoardGeometry(
  thickness: number,
  height: number,
  length: number,
  spec: JointSpec,
  frontDepth?: number,
  backDepth?: number,
): THREE.BufferGeometry | null {
  const joint = layoutJoint(height, spec);
  if (!joint) return null;
  const { flare, tailWide, tailCenters } = joint;
  const zo = length / 2;
  const ziFront = zo - (frontDepth ?? spec.depth);
  const ziBack = zo - (backDepth ?? spec.depth);
  const yBottom = -height / 2;

  const points: Array<[number, number]> = [];
  // Bottom edge between the two baselines.
  points.push([-ziBack, yBottom], [ziFront, yBottom]);
  // Front (+z) toothed end, bottom to top.
  for (const c of tailCenters) {
    const cy = yBottom + c;
    points.push(
      [ziFront, cy - tailWide / 2 + flare],
      [zo, cy - tailWide / 2],
      [zo, cy + tailWide / 2],
      [ziFront, cy + tailWide / 2 - flare],
    );
  }
  points.push([ziFront, height / 2]);
  // Top edge.
  points.push([-ziBack, height / 2]);
  // Back toothed end, top to bottom (mirror of the front end).
  for (const c of [...tailCenters].reverse()) {
    const cy = yBottom + c;
    points.push(
      [-ziBack, cy + tailWide / 2 - flare],
      [-zo, cy + tailWide / 2],
      [-zo, cy - tailWide / 2],
      [-ziBack, cy - tailWide / 2 + flare],
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
 * Case side panel with a stopped opening bevel: the toothed joint sections
 * at each end stay square; between them, the board's cross-section loses
 * its inner-front corner to a 45° chamfer (the routed opening edge, stopped
 * at the joints). Built in the tails-board frame — same orientation as
 * tailsBoardGeometry — so callers rotate it identically.
 * `innerEzSign` is the extrusion-axis sign of the board's inner face.
 */
export function caseSideTailsGeometry(
  thickness: number,
  height: number,
  length: number,
  spec: JointSpec,
  frontBevel: number,
  innerEzSign: 1 | -1,
): THREE.BufferGeometry | null {
  const joint = layoutJoint(height, spec);
  if (!joint) return null;
  const { flare, tailWide, tailCenters } = joint;
  const zo = length / 2;
  const zi = zo - spec.depth;
  const yBottom = -height / 2;

  const pieces: THREE.BufferGeometry[] = [];
  // Toothed end blocks (square, full cross-section).
  for (const sign of [1, -1] as const) {
    // Bottom baseline corner, tails ascending, top baseline corner; the
    // shape closes back down the baseline edge.
    const points: Array<[number, number]> = [[sign * zi, yBottom]];
    for (const c of tailCenters) {
      const cy = yBottom + c;
      points.push(
        [sign * zi, cy - tailWide / 2 + flare],
        [sign * zo, cy - tailWide / 2],
        [sign * zo, cy + tailWide / 2],
        [sign * zi, cy + tailWide / 2 - flare],
      );
    }
    points.push([sign * zi, height / 2]);
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const block = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    block.translate(0, 0, -thickness / 2);
    pieces.push(block);
  }
  // Middle prism with the chamfered inner-front corner, spanning between
  // the joint baselines. Shape X carries the extrusion (thickness) axis
  // negated, shape Y the pattern; extruded along the board length.
  const px = -innerEzSign * (thickness / 2);
  const qx = innerEzSign * (thickness / 2);
  const dirX = Math.sign(qx - px);
  const shape = new THREE.Shape([
    new THREE.Vector2(qx, yBottom),
    new THREE.Vector2(qx, height / 2),
    new THREE.Vector2(px, height / 2),
    new THREE.Vector2(px, yBottom + frontBevel),
    new THREE.Vector2(px + dirX * frontBevel, yBottom),
  ]);
  const middle = new THREE.ExtrudeGeometry(shape, { depth: 2 * zi, bevelEnabled: false });
  middle.rotateY(Math.PI / 2);
  middle.translate(-zi, 0, 0);
  // The end blocks live in the silhouette frame (shape X = board length);
  // the middle was built pointing length along world X already — bring the
  // blocks to match: their shape X is the length axis too, so both agree.
  const merged = mergeGeometries(pieces.concat(middle), false);
  for (const piece of pieces) piece.dispose();
  middle.dispose();
  if (!merged) return null;
  // Match tailsBoardGeometry's frame: (shape X, shape Y, extrude) → (z, y, x).
  merged.rotateY(-Math.PI / 2);
  return merged;
}

/**
 * Pins board: body along local X with complementary pin prisms at each end.
 * Returns a centered geometry with length × height × thickness mapped to
 * (x, y, z) — the drawer front/back orientation. With `lip`, the sockets
 * are blind: they stop `lip` short of the outer face, and a solid lap
 * plate carries the show face over the joint (half-blind dovetail front).
 */
export function pinsBoardGeometry(
  length: number,
  height: number,
  thickness: number,
  spec: JointSpec,
  /** +1 when the board's outer face is at +Z (a front), −1 for a back. */
  outerSign: 1 | -1,
  scoop?: ScoopSpec,
  lip = 0,
  /**
   * Stopped 45° chamfer on the body's inner/−y arris (case panels: the
   * opening's inside front edge), ending at the joint baselines.
   */
  frontBevel = 0,
): THREE.BufferGeometry | null {
  const joint = layoutJoint(height, spec);
  if (!joint) return null;
  const { tailWide, flare, tailCenters } = joint;
  const yBottom = -height / 2;
  const zOuter = (thickness / 2) * outerSign;
  const zTip = zOuter - lip * outerSign;
  const zInner = -zOuter;
  const bodyLength = length - 2 * spec.depth;

  // Non-indexed to match the extruded prisms — mergeGeometries refuses to
  // mix indexed and non-indexed buffers (and returns null, silently
  // degrading the joint to a plain box).
  let body: THREE.BufferGeometry;
  if (scoop) {
    body = scoopedBoardGeometry(bodyLength, height, thickness, scoop);
  } else if (frontBevel > 0) {
    // Pentagon cross-section: the inner-front corner cut at 45°.
    const px = -zInner;
    const qx = -zOuter;
    const dirX = Math.sign(qx - px);
    const shape = new THREE.Shape([
      new THREE.Vector2(qx, yBottom),
      new THREE.Vector2(qx, height / 2),
      new THREE.Vector2(px, height / 2),
      new THREE.Vector2(px, yBottom + frontBevel),
      new THREE.Vector2(px + dirX * frontBevel, yBottom),
    ]);
    body = new THREE.ExtrudeGeometry(shape, { depth: bodyLength, bevelEnabled: false });
    body.rotateY(Math.PI / 2);
    body.translate(-bodyLength / 2, 0, 0);
  } else {
    body = new THREE.BoxGeometry(bodyLength, height, thickness).toNonIndexed();
  }
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
    // The opening bevel is cut before assembly, so it runs through the
    // joint: the front gap's prism loses its inner-front corner too,
    // keeping the chamfer continuous around the assembled opening.
    const bevelDir = Math.sign(zInner - zTip);
    const shape =
      atBottom && frontBevel > 0
        ? new THREE.Shape([
            new THREE.Vector2(-zTip, g0),
            new THREE.Vector2(-zTip, g1),
            new THREE.Vector2(-zInner, g1 + f1),
            new THREE.Vector2(-zInner, g0 + frontBevel),
            new THREE.Vector2(-zInner + bevelDir * frontBevel, g0),
          ])
        : new THREE.Shape([
            new THREE.Vector2(-zTip, g0),
            new THREE.Vector2(-zTip, g1),
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

  // Half-blind lap: a solid plate between the socket bottoms and the show
  // face, one per end, so the joint never breaks through the front.
  if (lip > 0) {
    for (const sx of [1, -1]) {
      const plate = new THREE.BoxGeometry(spec.depth, height, lip).toNonIndexed();
      plate.translate(sx * (length / 2 - spec.depth / 2), 0, (zOuter + zTip) / 2);
      pieces.push(plate);
    }
  }

  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  return merged!;
}
