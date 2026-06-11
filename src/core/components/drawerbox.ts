// Standalone drawer box, MEJA's core quoted product: two sides, front, back, and a
// recessed captured bottom. Joinery is half-blind dovetail or box joint — recorded on
// the part for the cut list and the (future) joinery system; v1 renders square corners.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

/** Side-mount slides come in 3" steps; a box between sizes wastes travel. */
const SLIDE_LENGTHS = [inch(9), inch(12), inch(15), inch(18), inch(21), inch(24)];
const SLIDE_FIT_TOLERANCE = inch(0.75);

/** Warn when a box depth strands a standard slide length; null when it fits. */
export function slideFitWarning(depth: number): Finding | null {
  const fit = SLIDE_LENGTHS.filter((s) => s <= depth).pop();
  if (depth >= SLIDE_LENGTHS[0] && fit !== undefined && depth - fit > SLIDE_FIT_TOLERANCE) {
    return {
      severity: 'warning',
      message: `A ${formatLength(depth, 'imperial')} deep box only fits a ${formatLength(fit, 'imperial')} slide. Size the depth to a standard slide length (12", 15", 18", 21", 24").`,
    };
  }
  return null;
}

export const drawerBox: ComponentDef = {
  id: 'drawer-box',
  name: 'Drawer box',
  category: 'Drawers',
  description: 'Dovetailed or box-jointed drawer box with a captured bottom.',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(18), min: inch(4), max: inch(42), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(21), min: inch(6), max: inch(30), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Height', default: inch(4), min: inch(1.5), max: inch(12), tier: 'basic' },
    { kind: 'enum', key: 'joinery', label: 'Joinery', default: 'dovetail', tier: 'basic',
      options: [
        { value: 'dovetail', label: 'Half-blind dovetail' },
        { value: 'box-joint', label: 'Box joint' },
      ] },
    { kind: 'material', key: 'material', label: 'Material', default: 'maple', tier: 'basic' },
    { kind: 'length', key: 'sideThickness', label: 'Side thickness', default: inch(0.5), min: inch(0.375), max: inch(0.75), tier: 'advanced' },
    { kind: 'length', key: 'bottomThickness', label: 'Bottom thickness', default: inch(0.25), min: inch(0.125), max: inch(0.5), tier: 'advanced' },
    { kind: 'length', key: 'bottomRecess', label: 'Bottom recess', default: inch(0.25), min: inch(0.125), max: inch(0.75), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const sideT = num(p, 'sideThickness');
    const bottomT = num(p, 'bottomThickness');
    const recess = num(p, 'bottomRecess');
    const mat = str(p, 'material');
    const joinery = str(p, 'joinery') === 'dovetail' ? 'dovetailed' : 'box-jointed';

    const endW = W - 2 * sideT;

    const parts: Part[] = [];
    const findings: Finding[] = [];

    for (const sx of [-1, 1]) {
      parts.push({
        id: `side-${sx}`,
        name: `Side (${joinery})`,
        material: mat,
        primitives: [{ shape: 'box', size: [sideT, D, H], at: [sx * (W / 2 - sideT / 2), 0, H / 2] }],
        cut: { length: D, width: H, thickness: sideT },
      });
    }
    for (const sy of [-1, 1]) {
      parts.push({
        id: sy > 0 ? 'front' : 'back',
        name: sy > 0 ? `Front (${joinery})` : `Back (${joinery})`,
        material: mat,
        primitives: [{ shape: 'box', size: [endW, sideT, H], at: [0, sy * (D / 2 - sideT / 2), H / 2] }],
        cut: { length: endW, width: H, thickness: sideT },
      });
    }
    parts.push({
      id: 'bottom',
      name: 'Bottom',
      material: mat,
      primitives: [
        { shape: 'box', size: [endW, D - 2 * sideT, bottomT], at: [0, 0, recess + bottomT / 2] },
      ],
      cut: { length: endW, width: D - 2 * sideT, thickness: bottomT },
    });

    const slideWarning = slideFitWarning(D);
    if (slideWarning) findings.push(slideWarning);
    if (endW > inch(36)) {
      findings.push({
        severity: 'warning',
        message: `Drawers ${formatLength(W, 'imperial')} wide tend to rack. Consider two narrower boxes.`,
      });
    }

    return { parts, findings };
  },
};
