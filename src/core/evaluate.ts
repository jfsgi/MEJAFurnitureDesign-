// Deterministic evaluation: instance (component id + sparse params) → parts + findings.
// Pure data in, pure data out — no three.js — so this can move to a Web Worker later.

import type {
  ComponentDef,
  GeneratedModel,
  Instance,
  ParamValues,
  Primitive,
  ProjectDoc,
} from './types';
import { REGISTRY } from './components/registry';

export function defaultParams(def: ComponentDef): ParamValues {
  return Object.fromEntries(def.params.map((p) => [p.key, p.default]));
}

export function effectiveParams(inst: Instance): ParamValues {
  const def = REGISTRY[inst.componentId];
  if (!def) return { ...inst.params };
  return { ...defaultParams(def), ...inst.params };
}

export function evaluateInstance(inst: Instance): GeneratedModel {
  const def = REGISTRY[inst.componentId];
  if (!def) {
    return { parts: [], findings: [{ severity: 'warning', message: `Unknown component "${inst.componentId}".` }] };
  }
  try {
    return def.generate(effectiveParams(inst));
  } catch (err) {
    return {
      parts: [],
      findings: [{ severity: 'warning', message: `Could not build this component: ${String(err)}` }],
    };
  }
}

export interface BBox {
  min: [number, number, number];
  max: [number, number, number];
}

function primCorners(prim: Primitive): [number, number, number][] {
  const [cx, cy, cz] = prim.at;
  let hx: number, hy: number, hz: number;
  if (prim.shape === 'box') {
    [hx, hy, hz] = [prim.size[0] / 2, prim.size[1] / 2, prim.size[2] / 2];
    if (prim.tilt || prim.tiltX) {
      // Rotate the corner offsets like three.js does: about X, then about Y.
      const cosX = Math.cos(prim.tiltX ?? 0);
      const sinX = Math.sin(prim.tiltX ?? 0);
      const cosY = Math.cos(prim.tilt ?? 0);
      const sinY = Math.sin(prim.tilt ?? 0);
      const corners: [number, number, number][] = [];
      for (const sx of [-1, 1])
        for (const sy of [-1, 1])
          for (const sz of [-1, 1]) {
            const x = sx * hx;
            const y = sy * hy * cosX - sz * hz * sinX;
            const z = sy * hy * sinX + sz * hz * cosX;
            corners.push([cx + x * cosY + z * sinY, cy + y, cz - x * sinY + z * cosY]);
          }
      return corners;
    }
  } else if (prim.shape === 'taperedBox') {
    // The top face is centered on `at`; align shifts the bottom face — take the
    // union of both faces' extents (a back-flush wedge reaches well past center).
    const [tw, td] = prim.top;
    const [bw, bd] = prim.bottom;
    const ox = (prim.align[0] * (tw - bw)) / 2 + (prim.shift?.[0] ?? 0);
    const oy = (prim.align[1] * (td - bd)) / 2 + (prim.shift?.[1] ?? 0);
    const xs = [Math.min(-tw / 2, ox - bw / 2), Math.max(tw / 2, ox + bw / 2)];
    const ys = [Math.min(-td / 2, oy - bd / 2), Math.max(td / 2, oy + bd / 2)];
    const corners: [number, number, number][] = [];
    for (const x of xs)
      for (const y of ys)
        for (const sz of [-1, 1]) corners.push([cx + x, cy + y, cz + (sz * prim.height) / 2]);
    return corners;
  } else if (prim.shape === 'archedBoard') {
    // Stock extents; a front bulge reaches past the +Y face by its rise.
    [hx, hy, hz] = [prim.size[0] / 2, prim.size[1] / 2, prim.size[2] / 2];
    const bulge = prim.arch === 'front' ? prim.rise : 0;
    const corners: [number, number, number][] = [];
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        corners.push([cx + sx * hx, cy - hy, cz + sz * hz]);
        corners.push([cx + sx * hx, cy + hy + bulge, cz + sz * hz]);
      }
    return corners;
  } else {
    const r = Math.max(prim.radiusTop, prim.radiusBottom);
    [hx, hy, hz] = [r, r, prim.height / 2];
  }
  const corners: [number, number, number][] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) corners.push([cx + sx * hx, cy + sy * hy, cz + sz * hz]);
  return corners;
}

/** Instance-local bbox of a generated model (no position/rotation applied). */
export function modelBBox(model: GeneratedModel): BBox | null {
  let box: BBox | null = null;
  for (const part of model.parts) {
    for (const prim of part.primitives) {
      for (const c of primCorners(prim)) {
        if (!box) {
          box = { min: [...c], max: [...c] };
        } else {
          for (let i = 0; i < 3; i++) {
            box.min[i] = Math.min(box.min[i], c[i]);
            box.max[i] = Math.max(box.max[i], c[i]);
          }
        }
      }
    }
  }
  return box;
}

/** World-placed (model-space) bbox of one instance, including position and Z rotation. */
export function instanceBBox(inst: Instance): BBox | null {
  const local = modelBBox(evaluateInstance(inst));
  if (!local) return null;
  const cos = Math.cos(inst.rotationZ);
  const sin = Math.sin(inst.rotationZ);
  let box: BBox | null = null;
  for (const x of [local.min[0], local.max[0]])
    for (const y of [local.min[1], local.max[1]])
      for (const z of [local.min[2], local.max[2]]) {
        const wx = x * cos - y * sin + inst.position[0];
        const wy = x * sin + y * cos + inst.position[1];
        const c: [number, number, number] = [wx, wy, z];
        if (!box) {
          box = { min: [...c], max: [...c] };
        } else {
          for (let i = 0; i < 3; i++) {
            box.min[i] = Math.min(box.min[i], c[i]);
            box.max[i] = Math.max(box.max[i], c[i]);
          }
        }
      }
  return box;
}

export function docBBox(doc: ProjectDoc): BBox | null {
  let box: BBox | null = null;
  for (const inst of doc.instances) {
    const b = instanceBBox(inst);
    if (!b) continue;
    if (!box) {
      box = { min: [...b.min], max: [...b.max] };
    } else {
      for (let i = 0; i < 3; i++) {
        box.min[i] = Math.min(box.min[i], b.min[i]);
        box.max[i] = Math.max(box.max[i], b.max[i]);
      }
    }
  }
  return box;
}
