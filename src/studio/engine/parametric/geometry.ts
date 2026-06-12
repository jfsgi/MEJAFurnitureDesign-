import * as THREE from 'three';
import { applyBoxUVs } from '../materials/uv.js';
import type { FurnitureLayout, Part } from './layout.js';
import {
  caseSideTailsGeometry,
  pinsBoardGeometry,
  scoopedBoardGeometry,
  tailsBoardGeometry,
} from './joinery.js';
import { profiledBoardGeometry } from './profiledBoard.js';
import { raisedPanelGeometry } from './raisedPanel.js';
import { fingerPullFrontGeometry } from './fingerPull.js';

const MM_TO_M = 0.001;

/**
 * One texture tile covers this many meters of surface — larger than most
 * furniture parts, so the pattern never visibly repeats on a tabletop.
 */
const TEXTURE_TILE_M = 2.4;

/** Shared glass material for glass-panel parts (never user-overridden). */
const GLASS_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: 0xdfeee8,
  transparent: true,
  opacity: 0.26,
  roughness: 0.05,
  metalness: 0,
  side: THREE.DoubleSide,
});

/**
 * Builds renderable geometry from a furniture layout. Each part becomes a
 * mesh named after the part (so materials can target part names), grouped
 * under a single THREE.Group sitting on the floor at the origin.
 */
export function buildGroup(layout: FurnitureLayout, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = layout.spec.name ?? layout.spec.kind;
  let partIndex = 0;
  for (const part of layout.parts) {
    const geometry = partGeometry(part);
    // Unique per-part UV offset (golden-ratio sequence) so identical parts —
    // four legs, two doors — don't sample the same patch of grain.
    const offsetU = (partIndex * 0.618033988749) % 1;
    const offsetV = (partIndex * 0.754877666247) % 1;
    applyBoxUVs(geometry, TEXTURE_TILE_M, part.grainAxis, offsetU, offsetV, recessAO(part));
    partIndex += 1;
    const mesh = new THREE.Mesh(geometry, part.role === 'glass' ? GLASS_MATERIAL : material);
    if (part.role === 'glass') {
      mesh.castShadow = false;
      mesh.userData.isGlass = true;
    }
    mesh.name = part.name;
    mesh.position.set(
      part.positionMm[0] * MM_TO_M,
      part.positionMm[1] * MM_TO_M,
      part.positionMm[2] * MM_TO_M,
    );
    if (part.rotationRad) {
      mesh.rotation.set(...part.rotationRad);
    }
    mesh.castShadow = part.role !== 'glass';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/**
 * Baked contact shading for panels recessed in frames: darkens smoothly
 * toward the surrounding frame on all four sides, which is what reads as
 * depth in a shaker or raised-panel door.
 */
function recessAO(part: Part): ((x: number, y: number, z: number) => number) | undefined {
  if (!part.frameRecess) return undefined;
  const hx = (part.sizeMm[0] / 2) * MM_TO_M;
  const hy = (part.sizeMm[1] / 2) * MM_TO_M;
  const overlap = part.frameRecess.overlapMm * MM_TO_M;
  const reach = part.frameRecess.reachMm * MM_TO_M;
  return (x, y) => {
    const edge = Math.min(hx - Math.abs(x), hy - Math.abs(y)) - overlap;
    const t = Math.min(1, Math.max(0, edge / reach));
    const eased = t * (2 - t);
    return 0.52 + 0.48 * eased;
  };
}

/**
 * Builds the geometry for a part with edge details, dispatching to the
 * profiled-board builder with the right orientation:
 * - rails run along x (board space matches world space),
 * - stiles run along y (board built along its length, then rotated),
 * - slabs get the outer detail around all four edges.
 */
function edgeProfiledGeometry(
  sx: number,
  sy: number,
  sz: number,
  edge: NonNullable<Part['edgeProfile']>,
): THREE.BufferGeometry | null {
  // Catalog-scale cuts: Freeborn pattern and door-edge cutters detail a
  // band ~7/16" wide. Matching the inner band to the 10mm groove depth
  // also keeps a coped rail's visible body exactly at its cut length.
  const depth = Math.min(0.005, sz * 0.35);
  const outerWidth = 0.011;
  const innerWidth = 0.01;

  if (edge.axis === 'slab') {
    if (!edge.outer) return null;
    // An exact 45° bevel uses its own band width and depth.
    const bw = edge.bevelMm ? edge.bevelMm * MM_TO_M : outerWidth;
    const bd = edge.bevelMm ? Math.min(edge.bevelMm * MM_TO_M, sz * 0.45) : depth;
    return profiledBoardGeometry(sx, sy, sz, {
      depth: bd,
      outer: { profile: edge.outer, width: bw, uMin: true, uMax: true, vMin: true, vMax: true },
    });
  }

  const alongY = edge.axis === 'y';
  let L = alongY ? sy : sx;
  let W = alongY ? sx : sy;
  // Coped rails are cut long (stub tenons buried in the stile grooves);
  // the visible body extends only to the stick band's field edge. A
  // paint-thickness of proudness on the rail's edges prevents hairline
  // cracks where its walls and the stile caps tessellate the same curve.
  if (!alongY && edge.copeTenonMm && !edge.miterEnds) {
    const visible = edge.inner ? innerWidth : 0;
    L = Math.max(0.05, L - 2 * (edge.copeTenonMm * MM_TO_M - visible));
    W += 0.0003;
  }
  // Stiles rotate board space by +90° about z, mapping board-v to world −x,
  // so the inner side flips; rails map directly.
  const innerOnVMax = alongY ? edge.innerSide === 'x-' : edge.innerSide === 'y+';
  const innerSide = innerOnVMax ? ('vMax' as const) : ('vMin' as const);
  const geometry = profiledBoardGeometry(L, W, sz, {
    depth,
    miterEnds: edge.miterEnds
      ? { outerSide: innerSide === 'vMax' ? 'vMin' : 'vMax' }
      : undefined,
    stickCaps:
      edge.stickGroove && alongY && !edge.miterEnds
        ? { grooveWidth: 0.006, grooveDepth: 0.01, capDepth: 0.0012, innerSide }
        : undefined,
    inner: edge.inner
      ? {
          profile: edge.inner,
          width: innerWidth,
          side: innerSide,
          endInset: (edge.innerInsetMm ?? 0) * MM_TO_M,
          // Rails carry the inverse profile across their ends (the cope).
          copeEnds: !alongY && !edge.miterEnds,
        }
      : undefined,
    outer: edge.outer
      ? {
          profile: edge.outer,
          // Exact 45° opening bevels override the standard band size.
          width: edge.bevelMm ? edge.bevelMm * MM_TO_M : outerWidth,
          depth: edge.bevelMm ? Math.min(edge.bevelMm * MM_TO_M, sz * 0.45) : undefined,
          // Door-edge detail wraps the board ends on stiles so it runs
          // continuously around the assembled door.
          uMin: alongY,
          uMax: alongY,
          vMin: innerSide === 'vMax',
          vMax: innerSide === 'vMin',
        }
      : undefined,
  });
  if (alongY) geometry.rotateZ(Math.PI / 2);
  return geometry;
}

/**
 * Plain box with 45° chamfers between the front (+z) face and the listed
 * side faces — beveled opening edges on rails and dividers. All listed
 * sides must share an axis (x± or y±).
 */
function chamferedFrontPrism(
  w: number,
  h: number,
  d: number,
  bevel: number,
  sides: Array<'x+' | 'x-' | 'y+' | 'y-'>,
): THREE.BufferGeometry {
  const alongY = sides[0].startsWith('x');
  if (alongY) {
    // Cross-section in (x, z), extruded along y.
    const pts: THREE.Vector2[] = [new THREE.Vector2(-w / 2, -d / 2), new THREE.Vector2(w / 2, -d / 2)];
    if (sides.includes('x+')) {
      pts.push(new THREE.Vector2(w / 2, d / 2 - bevel), new THREE.Vector2(w / 2 - bevel, d / 2));
    } else {
      pts.push(new THREE.Vector2(w / 2, d / 2));
    }
    if (sides.includes('x-')) {
      pts.push(new THREE.Vector2(-w / 2 + bevel, d / 2), new THREE.Vector2(-w / 2, d / 2 - bevel));
    } else {
      pts.push(new THREE.Vector2(-w / 2, d / 2));
    }
    const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
      depth: h,
      bevelEnabled: false,
    });
    geometry.translate(0, 0, -h / 2);
    geometry.rotateX(Math.PI / 2);
    return geometry;
  }
  // Cross-section in (−z, y), extruded along x (the pins-prism convention).
  const pts: THREE.Vector2[] = [new THREE.Vector2(d / 2, -h / 2), new THREE.Vector2(d / 2, h / 2)];
  if (sides.includes('y+')) {
    pts.push(new THREE.Vector2(-d / 2 + bevel, h / 2), new THREE.Vector2(-d / 2, h / 2 - bevel));
  } else {
    pts.push(new THREE.Vector2(-d / 2, h / 2));
  }
  if (sides.includes('y-')) {
    pts.push(new THREE.Vector2(-d / 2, -h / 2 + bevel), new THREE.Vector2(-d / 2 + bevel, -h / 2));
  } else {
    pts.push(new THREE.Vector2(-d / 2, -h / 2));
  }
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
    depth: w,
    bevelEnabled: false,
  });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-w / 2, 0, 0);
  return geometry;
}

function partGeometry(part: Part): THREE.BufferGeometry {
  const [w, h, d] = part.sizeMm.map((v) => v * MM_TO_M) as [number, number, number];
  if (part.fingerPullTop && part.shape === 'box') {
    return fingerPullFrontGeometry(
      w,
      h,
      d,
      part.edgeProfile?.outer,
      part.edgeProfile?.bevelMm ? part.edgeProfile.bevelMm * MM_TO_M : undefined,
    );
  }
  if (part.frontBevel && part.shape === 'box') {
    return chamferedFrontPrism(
      w,
      h,
      d,
      part.frontBevel.bevelMm * MM_TO_M,
      part.frontBevel.sides,
    );
  }
  if (part.raisedPanel && part.shape === 'box') {
    return raisedPanelGeometry(
      w,
      h,
      d,
      part.raisedPanel.raiseWidthMm * MM_TO_M,
      part.raisedPanel.tongueThicknessMm * MM_TO_M,
      part.raisedPanel.profile,
    );
  }
  const scoop = part.scoop
    ? { width: part.scoop.widthMm * MM_TO_M, depth: part.scoop.depthMm * MM_TO_M }
    : undefined;
  if (part.joinery && part.shape === 'box') {
    const joint = { type: part.joinery.type, depth: part.joinery.matingThicknessMm * MM_TO_M };
    if (part.joinery.orient === 'case') {
      // Carcass framing: a side panel toothed at its top/bottom ends
      // (tails run along y), or a top/bottom panel with pins at its ends
      // (along x). Pattern runs along the depth. Built in the drawer-box
      // frame, then rotated about x so the box's z-pattern lands on world
      // z and the board length lands on its world axis.
      const caseBevel = (part.joinery.frontBevelMm ?? 0) * MM_TO_M;
      if (part.joinery.role === 'tails') {
        // Half-blind case corners lap at BOTH ends of the side.
        const lapped = part.joinery.frontLipMm
          ? joint.depth - part.joinery.frontLipMm * MM_TO_M
          : undefined;
        const jointed = caseBevel
          ? caseSideTailsGeometry(
              w,
              d,
              h,
              joint,
              caseBevel,
              // Builder extrusion sign of the inner face: world x = −extrude.
              (-(part.joinery.bevelInnerSign ?? 1)) as 1 | -1,
            )
          : tailsBoardGeometry(w, d, h, joint, lapped, lapped);
        if (jointed) {
          jointed.rotateX(-Math.PI / 2);
          return jointed;
        }
      } else {
        const jointed = pinsBoardGeometry(
          w,
          d,
          h,
          joint,
          part.joinery.pinsOuterSign ?? 1,
          undefined,
          (part.joinery.lipMm ?? 0) * MM_TO_M,
          caseBevel,
        );
        if (jointed) {
          jointed.rotateX(-Math.PI / 2);
          return jointed;
        }
      }
    }
    const jointed =
      part.joinery.role === 'tails'
        ? tailsBoardGeometry(
            w,
            h,
            d,
            joint,
            part.joinery.frontLipMm ? joint.depth - part.joinery.frontLipMm * MM_TO_M : undefined,
          )
        : pinsBoardGeometry(
            w,
            h,
            d,
            joint,
            part.joinery.pinsOuterSign ?? 1,
            scoop,
            (part.joinery.lipMm ?? 0) * MM_TO_M,
          );
    if (jointed) return jointed;
  }
  if (scoop && part.shape === 'box') {
    return scoopedBoardGeometry(w, h, d, scoop);
  }
  if (part.edgeProfile && part.shape === 'box') {
    const profiled = edgeProfiledGeometry(w, h, d, part.edgeProfile);
    if (profiled) return profiled;
  }
  switch (part.shape) {
    case 'box':
      return new THREE.BoxGeometry(w, h, d);
    case 'cylinder':
      return new THREE.CylinderGeometry(w / 2, w / 2, h, 32);
    case 'taperedLeg': {
      // Square leg tapering to ~60% at the foot: a 4-sided cylinder rotated 45°.
      const geometry = new THREE.CylinderGeometry(w / 2, w * 0.3, h, 4, 1);
      geometry.rotateY(Math.PI / 4);
      // A 4-sided cylinder inscribes the radius, so scale up to match the
      // requested face-to-face thickness.
      geometry.scale(Math.SQRT2, 1, Math.SQRT2);
      return geometry;
    }
  }
}
