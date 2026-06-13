// 3D model export: the evaluated document → a watertight-per-part triangle
// mesh, written as STL (single solid, for CNC/CAM and 3D printing) or OBJ
// (per-part objects, for other CAD/render tools). Geometry is built with the
// same builders the viewport and Studio bridge use, in model space — Z-up,
// millimeters — which is the convention slicers and CAM expect.

import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import type { Primitive, ProjectDoc } from '../core/types';
import { evaluateInstance } from '../core/evaluate';
import { archedBoardGeometry, frenchDovetailGeometry, mortisedPostGeometry, roundedSlabGeometry, taperedBoxGeometry } from '../viewport/geometry';
import { jointedBoardGeometry } from '../viewport/jointBoards';

/** Geometry for one primitive, centered at the origin, with the local
 * rotation it needs (model space, mm). Mirrors the Studio bridge's mapping,
 * minus the UV/grain work an export doesn't need. */
function primitiveGeometry(prim: Primitive): { geometry: THREE.BufferGeometry; rotation: THREE.Euler } {
  const rotation = new THREE.Euler();
  let geometry: THREE.BufferGeometry;
  if (prim.shape === 'box') {
    geometry = new THREE.BoxGeometry(...prim.size);
    rotation.set(prim.tiltX ?? 0, prim.tilt ?? 0, 0);
  } else if (prim.shape === 'jointedBoard') {
    geometry = jointedBoardGeometry(prim);
  } else if (prim.shape === 'taperedBox') {
    geometry = taperedBoxGeometry(prim.top, prim.bottom, prim.height, prim.align, prim.shift ?? [0, 0]);
  } else if (prim.shape === 'archedBoard') {
    geometry = archedBoardGeometry(prim.size, prim.arch, prim.rise, prim.shoulder ?? 0, prim.endSkew ?? 0);
  } else if (prim.shape === 'roundedSlab') {
    const vertical = prim.axis === 'y';
    geometry = roundedSlabGeometry(
      vertical ? [prim.size[0], prim.size[2], prim.size[1]] : prim.size,
      prim.radius,
      prim.edge ?? 0,
      prim.corners ?? 'front',
      prim.edgeMode ?? 'both',
      prim.squareBack ?? false,
    );
    if (vertical) geometry.rotateX(-Math.PI / 2);
  } else if (prim.shape === 'mortisedPost') {
    geometry = mortisedPostGeometry(prim.size[0], prim.size[1], prim.size[2], prim.radius, prim.mortises);
  } else if (prim.shape === 'frenchDovetail') {
    geometry = frenchDovetailGeometry(prim.depth, prim.rootThin, prim.tipThin, prim.runH, prim.dir);
    if (prim.interfaceAxis === 'y') geometry.rotateZ(Math.PI / 2);
  } else {
    geometry = new THREE.CylinderGeometry(prim.radiusTop, prim.radiusBottom, prim.height, 48);
    rotation.x = Math.PI / 2;
  }
  return { geometry, rotation };
}

/** The whole document as one THREE.Group, every part a named mesh, in model
 * space (Z-up, mm). Each instance's placement and rotation are baked in. */
export function buildExportGroup(doc: ProjectDoc): THREE.Group {
  const root = new THREE.Group();
  root.name = doc.name || 'Atelier3D';
  for (const inst of doc.instances) {
    const model = evaluateInstance(inst);
    const instGroup = new THREE.Group();
    instGroup.name = inst.name;
    instGroup.position.set(inst.position[0], inst.position[1], 0);
    instGroup.rotation.z = inst.rotationZ;
    for (const part of model.parts) {
      for (let i = 0; i < part.primitives.length; i++) {
        const prim = part.primitives[i];
        const { geometry, rotation } = primitiveGeometry(prim);
        const mesh = new THREE.Mesh(geometry);
        // OBJ uses mesh names; keep them unique and shop-readable.
        mesh.name = part.primitives.length > 1 ? `${part.name}-${i + 1}` : part.name;
        mesh.position.set(...prim.at);
        mesh.rotation.copy(rotation);
        instGroup.add(mesh);
      }
    }
    root.add(instGroup);
  }
  return root;
}

export type ModelFormat = 'stl' | 'obj';

/** Serializes the document to STL (binary) or OBJ text. */
export function exportModel(doc: ProjectDoc, format: ModelFormat): Blob {
  const group = buildExportGroup(doc);
  try {
    if (format === 'obj') {
      const text = new OBJExporter().parse(group);
      return new Blob([text], { type: 'model/obj' });
    }
    const data = new STLExporter().parse(group, { binary: true }) as unknown as DataView;
    return new Blob([new Uint8Array(data.buffer as ArrayBuffer)], { type: 'model/stl' });
  } finally {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}
