// Bridge: Atelier3D's evaluated model → a three.js group the 4K engine renders.
// Geometry is built in model space (Z-up, mm) with the same builders the design
// viewport uses, UV-mapped with the engine's box projection at its texture tile,
// then the root group converts to the engine's world (Y-up, meters).

import * as THREE from 'three';
import type { Primitive, ProjectDoc } from '../core/types';
import { evaluateInstance, partBBox } from '../core/evaluate';
import { MATERIAL_BY_ID } from '../core/materials';
import {
  archedBoardGeometry,
  longestAxis,
  roundedSlabGeometry,
  taperedBoxGeometry,
} from '../viewport/geometry';
import { jointedBoardGeometry } from '../viewport/jointBoards';
import { grainOffset } from '../viewport/woodTexture';
import { applyBoxUVs } from './engine/materials/uv';
import type { MaterialLibrary } from './engine/materials/MaterialLibrary';

const AXIS = ['x', 'y', 'z'] as const;

/** Atelier3D material id → 4K engine material id. */
export const ENGINE_MATERIAL_MAP: Record<string, string> = {
  walnut: 'walnut',
  'white-oak': 'oak',
  maple: 'maple',
  cherry: 'cherry',
  ash: 'redoak',
  cedar: 'cedar',
  'baltic-birch': 'birchply',
  'painted-white': 'paint-white',
  'painted-black': 'paint-black',
  'steel-black': 'steel',
  brass: 'brass',
};

export function engineMaterialFor(designMaterialId: string): string {
  return ENGINE_MATERIAL_MAP[designMaterialId] ?? 'oak';
}

/** Engine texture tile in model millimeters (2.4 m of wood per repeat). */
const ENGINE_TILE_MM = 2400;

/**
 * The engine's single-board rule: parts narrower than this across the grain
 * are one board — their across-grain texture offset snaps to a plank-safe
 * position so the simulated glue lines never cross a face mid-board.
 * Mirrors buildGroup in the engine's parametric/geometry.ts.
 */
const PLANK_SAFE_OFFSETS = [5 / 120, 55 / 120, 65 / 120, 115 / 120];
const PLANK_FIT_MM = 165;

/** Model-space grain axis of a primitive (for the across-grain extent). */
function modelGrainAxis(prim: Primitive): 'x' | 'y' | 'z' {
  switch (prim.shape) {
    case 'box':
      return prim.grain ?? AXIS[longestAxis(prim.size)];
    case 'jointedBoard':
      return prim.lengthAxis;
    case 'taperedBox':
      return prim.axis ?? 'z';
    case 'archedBoard':
      return prim.arch === 'bottom-y' ? 'y' : 'x';
    case 'roundedSlab':
      return prim.axis === 'y' ? 'z' : 'x';
    default:
      return 'z'; // cylinders stand vertical in model space
  }
}

/** Builds the whole document as one engine-ready group (Y-up, meters). */
export function buildStudioGroup(doc: ProjectDoc, materials: MaterialLibrary): THREE.Group {
  const root = new THREE.Group();
  root.name = doc.name;
  // Model space (Z-up, mm) → engine world (Y-up, m), turned so the design's
  // front (+Y model) faces the engine's front camera (+Z world).
  root.rotation.set(-Math.PI / 2, 0, Math.PI);
  root.scale.setScalar(0.001);

  for (const inst of doc.instances) {
    const model = evaluateInstance(inst);
    const instGroup = new THREE.Group();
    instGroup.position.set(inst.position[0], inst.position[1], 0);
    instGroup.rotation.z = inst.rotationZ;

    for (const part of model.parts) {
      const material = materials.get(engineMaterialFor(part.material));
      // The engine's own pipeline end to end: its joinery geometry where parts
      // are jointed, and its box UV projection everywhere — grain along each
      // board, per-face end-grain shading baked into vertex colors, and a
      // stable per-part offset so neighboring boards vary.
      const offset = grainOffset(`${inst.id}/${part.id}`);
      // Narrow parts are single boards: snap the across-grain offset to a
      // plank-safe slot (seed-picked) so no glue line crosses the face.
      let offsetU = offset[0];
      const box = partBBox(part);
      if (box && part.primitives.length > 0) {
        const gi = { x: 0, y: 1, z: 2 }[modelGrainAxis(part.primitives[0])];
        const ext = [0, 1, 2].map((i) => box.max[i] - box.min[i]);
        const acrossMax = Math.max(...ext.filter((_, i) => i !== gi));
        if (acrossMax <= PLANK_FIT_MM) {
          offsetU =
            PLANK_SAFE_OFFSETS[
              Math.floor(offset[0] * PLANK_SAFE_OFFSETS.length) % PLANK_SAFE_OFFSETS.length
            ];
        }
      }
      for (const prim of part.primitives) {
        let geometry: THREE.BufferGeometry;
        let grain: 'x' | 'y' | 'z' = 'x';
        const rotation = new THREE.Euler();
        if (prim.shape === 'box') {
          geometry = new THREE.BoxGeometry(...prim.size);
          grain = prim.grain ?? AXIS[longestAxis(prim.size)];
          rotation.set(prim.tiltX ?? 0, prim.tilt ?? 0, 0);
        } else if (prim.shape === 'jointedBoard') {
          geometry = jointedBoardGeometry(prim);
          grain = prim.lengthAxis;
        } else if (prim.shape === 'taperedBox') {
          geometry = taperedBoxGeometry(
            prim.top,
            prim.bottom,
            prim.height,
            prim.align,
            prim.shift ?? [0, 0],
          );
          grain = prim.axis ?? 'z';
        } else if (prim.shape === 'archedBoard') {
          geometry = archedBoardGeometry(
            prim.size,
            prim.arch,
            prim.rise,
            prim.shoulder ?? 0,
            prim.endSkew ?? 0,
          );
          grain = prim.arch === 'bottom-y' ? 'y' : 'x';
        } else if (prim.shape === 'roundedSlab') {
          const vertical = prim.axis === 'y';
          geometry = roundedSlabGeometry(
            vertical ? [prim.size[0], prim.size[2], prim.size[1]] : prim.size,
            prim.radius,
            prim.edge ?? 0,
            prim.corners ?? 'front',
            prim.edgeMode ?? 'both',
          );
          if (vertical) geometry.rotateX(-Math.PI / 2);
          grain = vertical ? 'z' : 'x';
        } else {
          geometry = new THREE.CylinderGeometry(
            prim.radiusTop,
            prim.radiusBottom,
            prim.height,
            48,
          );
          rotation.x = Math.PI / 2;
          grain = 'y'; // along the cylinder axis pre-rotation
        }
        applyBoxUVs(geometry, ENGINE_TILE_MM, grain, offsetU, offset[1]);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${inst.name} · ${part.name}`;
        // Sheet-goods parts (a drawer's ply bottom, a ply back) keep their
        // own stock when a whole-scene material is applied — the engine
        // skips hinted meshes unless they're targeted by name.
        if (MATERIAL_BY_ID[part.material]?.sheet) {
          mesh.userData.materialHint = 'ply';
        }
        mesh.position.set(...prim.at);
        mesh.rotation.copy(rotation);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        instGroup.add(mesh);
      }
    }
    root.add(instGroup);
  }
  return root;
}
