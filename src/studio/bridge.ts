// Bridge: Atelier3D's evaluated model → a three.js group the 4K engine renders.
// Geometry is built in model space (Z-up, mm) with the same builders the design
// viewport uses, UV-mapped with the engine's box projection at its texture tile,
// then the root group converts to the engine's world (Y-up, meters).

import * as THREE from 'three';
import type { ProjectDoc } from '../core/types';
import { evaluateInstance } from '../core/evaluate';
import {
  archedBoardGeometry,
  grainBoxGeometry,
  longestAxis,
  taperedBoxGeometry,
} from '../viewport/geometry';
import { GRAIN_MM_U, grainOffset } from '../viewport/woodTexture';
import { applyBoxUVs } from './engine/materials/uv';
import type { MaterialLibrary } from './engine/materials/MaterialLibrary';

/** Atelier3D material id → 4K engine material id. */
export const ENGINE_MATERIAL_MAP: Record<string, string> = {
  walnut: 'walnut',
  'white-oak': 'oak',
  maple: 'maple',
  cherry: 'cherry',
  ash: 'redoak',
  cedar: 'cedar',
  'baltic-birch': 'maple',
  'painted-white': 'paint-white',
  'painted-black': 'paint-black',
  'steel-black': 'steel',
  brass: 'brass',
};

export function engineMaterialFor(designMaterialId: string): string {
  return ENGINE_MATERIAL_MAP[designMaterialId] ?? 'oak';
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
      // Same grain system as the design viewport: anisotropic UVs aligned to each
      // board's grain, a stable random offset per part, and part-space origins so
      // grain runs solid across a part's boards instead of cutting at seams.
      const offset = grainOffset(`${inst.id}/${part.id}`);
      for (const prim of part.primitives) {
        let geometry: THREE.BufferGeometry;
        const rotation = new THREE.Euler();
        if (prim.shape === 'box') {
          geometry = grainBoxGeometry(prim.size, longestAxis(prim.size), offset, prim.at);
          rotation.set(prim.tiltX ?? 0, prim.tilt ?? 0, 0);
        } else if (prim.shape === 'taperedBox') {
          geometry = taperedBoxGeometry(
            prim.top,
            prim.bottom,
            prim.height,
            prim.align,
            prim.shift ?? [0, 0],
            offset,
            prim.at,
          );
        } else if (prim.shape === 'archedBoard') {
          geometry = archedBoardGeometry(
            prim.size,
            prim.arch,
            prim.rise,
            prim.shoulder ?? 0,
            prim.endSkew ?? 0,
            offset,
          );
        } else {
          geometry = new THREE.CylinderGeometry(
            prim.radiusTop,
            prim.radiusBottom,
            prim.height,
            48,
          );
          rotation.x = Math.PI / 2;
          // Grain along the cylinder axis (pre-rotation Y).
          applyBoxUVs(geometry, GRAIN_MM_U, 'y', offset[0], offset[1]);
        }
        // Engine materials run with vertexColors (applyBoxUVs bakes AO there);
        // our grain-mapped geometries must carry a white color attribute or
        // they render black.
        if (!geometry.getAttribute('color')) {
          const count = geometry.getAttribute('position').count;
          geometry.setAttribute(
            'color',
            new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3),
          );
        }
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${inst.name} · ${part.name}`;
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
