// Standalone drawer box, MEJA's core quoted product: two sides, front, back, and a
// recessed captured bottom, with the corner joinery — dovetail or box joint —
// rendered as interlocking fingers at all four corners.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';
import { HALF_BLIND_LIP } from './drawerparts';

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
    { kind: 'enum', key: 'joinery', label: 'Joinery', default: 'half-blind', tier: 'basic',
      options: [
        { value: 'half-blind', label: 'Half-blind dovetail' },
        { value: 'dovetail', label: 'Through dovetail' },
        { value: 'box-joint', label: 'Box joint' },
      ] },
    { kind: 'material', key: 'material', label: 'Material', default: 'maple', tier: 'basic' },
    { kind: 'boolean', key: 'pull', label: 'Finger pull cutout', default: false, tier: 'advanced' },
    { kind: 'material', key: 'bottomMaterial', label: 'Bottom material', default: 'baltic-birch', tier: 'advanced' },
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
    const joinery = str(p, 'joinery');
    const halfBlind = joinery === 'half-blind';
    const label = halfBlind
      ? 'half-blind dovetailed'
      : joinery === 'dovetail'
        ? 'dovetailed'
        : 'box-jointed';
    const jointType = joinery === 'box-joint' ? ('box-joint' as const) : ('dovetail' as const);

    const endW = W - 2 * sideT;

    const parts: Part[] = [];
    const findings: Finding[] = [];

    // Engine joinery end to end: tails boards for the sides, pins boards for
    // the front and back (the front optionally scooped for the pull).
    // Half-blind is the engine construction: the front carries blind sockets
    // and the lap; the sides stop a lip short of it; the back stays through.
    const sideLen = halfBlind ? D - HALF_BLIND_LIP : D;
    for (const sx of [-1, 1]) {
      parts.push({
        id: `side-${sx}`,
        name: `Side (${label})`,
        material: mat,
        primitives: [
          {
            shape: 'jointedBoard',
            role: 'tails',
            length: sideLen,
            height: H,
            thickness: sideT,
            at: [sx * (W / 2 - sideT / 2), halfBlind ? -HALF_BLIND_LIP / 2 : 0, H / 2],
            lengthAxis: 'y',
            thicknessAxis: 'x',
            joint: jointType,
            jointDepth: sideT,
            lip: halfBlind ? HALF_BLIND_LIP : undefined,
            lipEnd: halfBlind ? 'positive' : undefined,
          },
        ],
        cut: { length: sideLen, width: H, thickness: sideT },
      });
    }
    for (const sy of [-1, 1] as const) {
      const isFront = sy > 0;
      const scooped = isFront && (p['pull'] as boolean);
      parts.push({
        id: isFront ? 'front' : 'back',
        name: isFront ? `Front (${label})` : `Back (${halfBlind ? 'dovetailed' : label})`,
        material: mat,
        primitives: [
          {
            shape: 'jointedBoard',
            role: 'pins',
            length: W,
            height: H,
            thickness: sideT,
            at: [0, sy * (D / 2 - sideT / 2), H / 2],
            lengthAxis: 'x',
            thicknessAxis: 'y',
            outerSign: sy,
            joint: jointType,
            jointDepth: sideT,
            lip: halfBlind && isFront ? HALF_BLIND_LIP : undefined,
            scoop: scooped
              ? { width: Math.min(inch(4.5), endW * 0.4), depth: Math.min(inch(1.125), H * 0.4) }
              : undefined,
          },
        ],
        cut: { length: W, width: H, thickness: sideT },
      });
    }

    parts.push({
      id: 'bottom',
      name: 'Bottom',
      material: str(p, 'bottomMaterial'),
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
