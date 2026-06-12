// Jointed boards rendered straight from the 4K engine's joinery generator:
// one-piece tails boards with toothed ends, pins boards with complementary
// prisms (and the elliptical finger scoop). The engine works in meters with
// fixed native orientations; this wrapper converts to model millimeters and
// the axes a primitive asks for.

import * as THREE from 'three';
import type { Primitive } from '../core/types';
import {
  pinsBoardGeometry,
  tailsBoardGeometry,
} from '../studio/engine/parametric/joinery';

type JointedBoard = Extract<Primitive, { shape: 'jointedBoard' }>;

const M = 0.001;

function heightAxis(prim: JointedBoard): 'x' | 'y' | 'z' {
  return (['x', 'y', 'z'] as const).find(
    (a) => a !== prim.lengthAxis && a !== prim.thicknessAxis,
  )!;
}

/** Plain stock fallback for boards too small to carry the joint. */
function plainBoard(prim: JointedBoard): THREE.BufferGeometry {
  const size = { x: 0, y: 0, z: 0 };
  size[prim.lengthAxis] = prim.length;
  size[prim.thicknessAxis] = prim.thickness;
  size[heightAxis(prim)] = prim.height;
  return new THREE.BoxGeometry(size.x, size.y, size.z);
}

export function jointedBoardGeometry(prim: JointedBoard): THREE.BufferGeometry {
  const spec = {
    type: prim.joint === 'dovetail' ? ('dovetail' as const) : ('boxjoint' as const),
    depth: prim.jointDepth * M,
  };

  // Half-blind: tails shorten their engagement to the socket bottoms; pins
  // boards carry blind sockets and the solid lap plate on the show face.
  const engagement = prim.lip ? spec.depth - prim.lip * M : undefined;

  if (prim.role === 'tails') {
    // Native axes: x = thickness, y = height, z = length. Model ends map
    // onto the native ±z ends: (z, x) keeps native +z on model +length;
    // the (y, x) drawer orientation's rotation flips it (native +z lands
    // on model −y).
    const positiveIsNativeFront = prim.lengthAxis === 'z';
    let frontDepth = engagement;
    let backDepth = engagement;
    if (engagement !== undefined && prim.lipEnd) {
      // Lap one end only; the other stays a through joint.
      const lipIsFront = (prim.lipEnd === 'positive') === positiveIsNativeFront;
      if (lipIsFront) backDepth = undefined;
      else frontDepth = undefined;
    }
    if (prim.plainEnd) {
      const plainIsFront = (prim.plainEnd === 'positive') === positiveIsNativeFront;
      if (plainIsFront) frontDepth = 0;
      else backDepth = 0;
    }
    const geo = tailsBoardGeometry(
      prim.thickness * M,
      prim.height * M,
      prim.length * M,
      spec,
      frontDepth,
      backDepth,
    );
    if (!geo) return plainBoard(prim);
    geo.scale(1000, 1000, 1000);
    if (prim.lengthAxis === 'z' && prim.thicknessAxis === 'x') {
      // native orientation
    } else if (prim.lengthAxis === 'y' && prim.thicknessAxis === 'x') {
      geo.rotateX(Math.PI / 2);
    } else {
      geo.dispose();
      return plainBoard(prim);
    }
    return geo;
  }

  // Native axes: x = length, y = height, z = thickness; outer face at ±z.
  const identity = prim.lengthAxis === 'x' && prim.thicknessAxis === 'z';
  const toY = prim.lengthAxis === 'x' && prim.thicknessAxis === 'y';
  if (!identity && !toY) return plainBoard(prim);
  // rotateX(π/2) maps native +z to model −y, so the requested outer sign flips.
  const engineSign = (identity ? (prim.outerSign ?? 1) : -(prim.outerSign ?? 1)) as 1 | -1;
  const geo = pinsBoardGeometry(
    prim.length * M,
    prim.height * M,
    prim.thickness * M,
    spec,
    engineSign,
    prim.scoop ? { width: prim.scoop.width * M, depth: prim.scoop.depth * M } : undefined,
    (prim.lip ?? 0) * M,
  );
  if (!geo) return plainBoard(prim);
  geo.scale(1000, 1000, 1000);
  if (toY) geo.rotateX(Math.PI / 2);
  return geo;
}
