// Standalone drawer box, MEJA's core quoted product: two sides, front, back, and a
// recessed captured bottom, with the corner joinery — dovetail or box joint —
// rendered as interlocking fingers at all four corners.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';
import { BOTTOM_GROOVE, HALF_BLIND_LIP, drawerBottomPrims } from './drawerparts';

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
    { kind: 'boolean', key: 'scoopedSides', label: 'Scooped sides (low front)', default: false, tier: 'advanced' },
    { kind: 'length', key: 'frontHeight', label: 'Scoop front height', default: inch(1.75), min: inch(0.75), max: inch(6), tier: 'advanced' },
    { kind: 'length', key: 'scoopRun', label: 'Scoop length (from front)', default: inch(4), min: inch(1.5), max: inch(18), tier: 'advanced' },
    { kind: 'material', key: 'bottomMaterial', label: 'Bottom material', default: 'baltic-birch', tier: 'advanced' },
    { kind: 'enum', key: 'slideType', label: 'Slides', default: 'side-mount', tier: 'advanced',
      options: [
        { value: 'side-mount', label: 'Side-mount' },
        { value: 'undermount', label: 'Undermount' },
      ] },
    { kind: 'length', key: 'sideThickness', label: 'Side thickness', default: inch(0.5), min: inch(0.375), max: inch(0.75), tier: 'advanced' },
    { kind: 'length', key: 'bottomThickness', label: 'Bottom thickness', default: inch(0.25), min: inch(0.125), max: inch(0.5), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const sideT = num(p, 'sideThickness');
    const bottomT = num(p, 'bottomThickness');
    // The bottom groove height follows the slides: undermounts need 1/2"
    // under the bottom for the slide body, side-mounts 1/4".
    const undermount = str(p, 'slideType') === 'undermount';
    const recess = undermount ? inch(0.5) : inch(0.25);
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

    const scoopedSides = p['scoopedSides'] as boolean;
    if (scoopedSides) {
      // Low-front "waterfall" box: a low front, a full back, and sides that ramp
      // from the front height up to the back. Butt-jointed — the engine's
      // finger-joint boards are uniform height, so they can't carry the ramped
      // top + the front/back joints at two different heights.
      const frontH = Math.min(Math.max(num(p, 'frontHeight'), inch(0.75)), H - inch(0.75));
      const pull = p['pull'] as boolean;
      const pullW = Math.min(inch(5.5877), W * 0.4);
      const pullD = Math.min(inch(0.75), frontH * 0.5);
      const frontAt: [number, number, number] = [0, D / 2 - sideT / 2, frontH / 2];
      parts.push({
        id: 'front',
        name: pull ? 'Front (low, pull)' : 'Front (low)',
        material: mat,
        primitives: [
          pull
            ? { shape: 'archedBoard', size: [W, sideT, frontH], at: frontAt, arch: 'scoop', rise: pullD, shoulder: (W - pullW) / 2 }
            : { shape: 'box', size: [W, sideT, frontH], at: frontAt, grain: 'x' },
        ],
        cut: { length: W, width: frontH, thickness: sideT },
      });
      parts.push({
        id: 'back',
        name: 'Back',
        material: mat,
        primitives: [{ shape: 'box', size: [W, sideT, H], at: [0, -(D / 2 - sideT / 2), H / 2], grain: 'x' }],
        cut: { length: W, width: H, thickness: sideT },
      });
      const scoopSideLen = D - 2 * sideT;
      // How far back from the front the side rises to full height (variable).
      const scoopRun = Math.min(Math.max(num(p, 'scoopRun'), inch(1.5)), scoopSideLen * 0.9);
      for (const sx of [-1, 1]) {
        parts.push({
          id: `side-${sx}`,
          name: 'Side (scooped)',
          material: mat,
          primitives: [
            {
              shape: 'archedBoard',
              size: [sideT, scoopSideLen, H],
              at: [sx * (W / 2 - sideT / 2), 0, H / 2],
              arch: 'waterfall-y',
              rise: H - frontH,
              shoulder: scoopRun,
            },
          ],
          cut: { length: scoopSideLen, width: H, thickness: sideT },
        });
      }
    } else {
      // Engine joinery end to end: tails boards for the sides, pins boards for
      // the front and back (the front optionally scooped for the pull).
      // Half-blind laps BOTH corners: front and back carry blind sockets and
      // the 1/16" lap, so the sides lose a lip at each end — 1/8" total.
      const sideLen = halfBlind ? D - 2 * HALF_BLIND_LIP : D;
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
              at: [sx * (W / 2 - sideT / 2), 0, H / 2],
              lengthAxis: 'y',
              thicknessAxis: 'x',
              joint: jointType,
              jointDepth: sideT,
              lip: halfBlind ? HALF_BLIND_LIP : undefined,
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
          name: isFront ? `Front (${label})` : `Back (${label})`,
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
              lip: halfBlind ? HALF_BLIND_LIP : undefined,
              scoop: scooped
                ? { width: Math.min(inch(5.5877), endW * 0.4), depth: Math.min(inch(0.75), H * 0.4) }
                : undefined,
            },
          ],
          cut: { length: W, width: H, thickness: sideT },
        });
      }
    }

    // The bottom rides in a 1/4"-deep groove all around, so it cuts 1/2"
    // over the inside dimensions; its edges bury into the boards.
    const bottomW = endW + 2 * BOTTOM_GROOVE;
    const bottomD = D - 2 * sideT + 2 * BOTTOM_GROOVE;
    parts.push({
      id: 'bottom',
      name: undermount ? 'Bottom (undermount notches)' : 'Bottom',
      material: str(p, 'bottomMaterial'),
      primitives: drawerBottomPrims(bottomW, bottomD, bottomT, [0, 0, recess + bottomT / 2], undermount),
      cut: { length: bottomW, width: bottomD, thickness: bottomT },
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
