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
  } else if (prim.shape === 'taperedBox') {
    hx = Math.max(prim.top[0], prim.bottom[0]) / 2;
    hy = Math.max(prim.top[1], prim.bottom[1]) / 2;
    hz = prim.height / 2;
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
