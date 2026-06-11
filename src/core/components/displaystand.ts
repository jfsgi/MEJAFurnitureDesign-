// Parametric tiered display stand, per the shop's frame drawing: rectangular legs
// (1-1/2" x 3"), a raked front pair, side rails tying each leg pair top and bottom,
// arched front/back rails (modeled straight until a curve primitive exists), a
// full-width top cap, and lower shelves that notch around the legs, deepening with
// the rake. Reference envelope: 36 x 20 x 38 with a 14" top.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';
import { maxShelfSpan } from '../materials';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

const RAIL_T = inch(1);
const TOP_RAIL_H = inch(2.5);
const BOTTOM_RAIL_H = inch(2.5);
const SIDE_TOP_RAIL_H = inch(2.75);
const SIDE_BOTTOM_RAIL_H = inch(2.25);
const BOTTOM_RAIL_Z = inch(2.4375); // floor to the bottom rails' lower edge
const SHELF_RAIL_H = inch(1.25);

export const displayStand: ComponentDef = {
  id: 'display-stand',
  name: 'Tiered stand',
  category: 'Storage',
  description: 'Display stand with raked front legs; shelves deepen toward the floor.',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(36), min: inch(18), max: inch(48), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(20), min: inch(12), max: inch(30), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Height', default: inch(38), min: inch(24), max: inch(60), tier: 'basic' },
    { kind: 'count', key: 'shelfCount', label: 'Shelves', default: 4, min: 2, max: 6, tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'white-oak', tier: 'basic' },
    { kind: 'length', key: 'topDepth', label: 'Top depth', default: inch(14), min: inch(8), max: inch(24), tier: 'advanced' },
    { kind: 'length', key: 'legWidth', label: 'Leg width', default: inch(1.5), min: inch(1), max: inch(2.5), tier: 'advanced' },
    { kind: 'length', key: 'legDepth', label: 'Leg depth', default: inch(3), min: inch(1.5), max: inch(4), tier: 'advanced' },
    { kind: 'length', key: 'thickness', label: 'Shelf thickness', default: inch(0.75), min: inch(0.5), max: inch(1), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const n = num(p, 'shelfCount');
    const legW = num(p, 'legWidth');
    const legD = num(p, 'legDepth');
    const t = num(p, 'thickness');
    const topD = Math.max(Math.min(num(p, 'topDepth'), D - inch(2)), 2 * legD + inch(2));
    const mat = str(p, 'material');

    const innerW = W - 2 * legW;
    const backY = -D / 2;
    const legH = H - t; // legs stop under the full-width top cap
    const legX = W / 2 - legW / 2;
    /** Outer (front) face of the raked leg at height z. */
    const outerAt = (z: number) => topD + ((D - topD) * (H - z)) / H;

    const parts: Part[] = [];
    const findings: Finding[] = [];

    for (const sx of [-1, 1]) {
      parts.push({
        id: `leg-back-${sx}`,
        name: 'Leg (back)',
        material: mat,
        primitives: [
          { shape: 'box', size: [legW, legD, legH], at: [sx * legX, backY + legD / 2, legH / 2] },
        ],
        cut: { length: legH, width: legD, thickness: legW },
      });
    }

    // Raked front legs: sheared prisms — level top and foot cuts, slanted faces —
    // outer face landing at the top depth up high and the full base depth on the floor.
    const shearY = D - outerAt(legH);
    const rakeLen = Math.hypot(legH, shearY);
    for (const sx of [-1, 1]) {
      parts.push({
        id: `leg-front-${sx}`,
        name: 'Leg (raked)',
        material: mat,
        primitives: [
          {
            shape: 'taperedBox',
            top: [legW, legD],
            bottom: [legW, legD],
            height: legH,
            at: [sx * legX, backY + outerAt(legH) - legD / 2, legH / 2],
            align: [0, 0],
            shift: [0, shearY],
          },
        ],
        cut: { length: rakeLen, width: legD, thickness: legW },
      });
    }

    // Side rails tie each back leg to its raked leg, top and bottom. Lengths are
    // measured at the rail's lower edge — the longest gap — so the front end runs
    // inside the raked leg like a tenon instead of leaving a wedge of daylight.
    const sideTopLen = outerAt(legH - SIDE_TOP_RAIL_H) - 2 * legD;
    for (const sx of [-1, 1]) {
      parts.push({
        id: `side-rail-top-${sx}`,
        name: 'Side rail (top)',
        material: mat,
        primitives: [
          {
            shape: 'box',
            size: [RAIL_T, sideTopLen, SIDE_TOP_RAIL_H],
            at: [sx * legX, backY + legD + sideTopLen / 2, legH - SIDE_TOP_RAIL_H / 2],
          },
        ],
        cut: { length: sideTopLen, width: SIDE_TOP_RAIL_H, thickness: RAIL_T },
      });
    }
    const botRailZ = BOTTOM_RAIL_Z + SIDE_BOTTOM_RAIL_H / 2;
    const sideBotLen = outerAt(BOTTOM_RAIL_Z) - 2 * legD;
    for (const sx of [-1, 1]) {
      parts.push({
        id: `side-rail-bottom-${sx}`,
        name: 'Side rail (bottom)',
        material: mat,
        primitives: [
          {
            shape: 'box',
            size: [RAIL_T, sideBotLen, SIDE_BOTTOM_RAIL_H],
            at: [sx * legX, backY + legD + sideBotLen / 2, botRailZ],
          },
        ],
        cut: { length: sideBotLen, width: SIDE_BOTTOM_RAIL_H, thickness: RAIL_T },
      });
    }

    // Long rails between the leg pairs: under the top, and just above the floor.
    // The shop pieces carry a 2" arch on the lower edges; straight until curves land.
    const longRail = (id: string, name: string, y: number, z: number, h: number): Part => ({
      id,
      name,
      material: mat,
      primitives: [{ shape: 'box', size: [innerW, RAIL_T, h], at: [0, y, z] }],
      cut: { length: innerW, width: h, thickness: RAIL_T },
    });
    const topRailZ = legH - TOP_RAIL_H / 2;
    parts.push(longRail('rail-top-front', 'Top rail', backY + topD - legD / 2, topRailZ, TOP_RAIL_H));
    parts.push(longRail('rail-top-back', 'Top rail', backY + legD / 2, topRailZ, TOP_RAIL_H));
    const botZ = BOTTOM_RAIL_Z + BOTTOM_RAIL_H / 2;
    parts.push(
      longRail('rail-bottom-front', 'Bottom rail', backY + outerAt(botZ) - legD / 2, botZ, BOTTOM_RAIL_H),
    );
    parts.push(longRail('rail-bottom-back', 'Bottom rail', backY + legD / 2, botZ, BOTTOM_RAIL_H));

    // Full-width top cap, then lower shelves notched around the legs, each deeper
    // than the one above and carrying a rail under its front edge.
    parts.push({
      id: 'top',
      name: 'Top',
      material: mat,
      primitives: [{ shape: 'box', size: [W, topD, t], at: [0, backY + topD / 2, H - t / 2] }],
      cut: { length: W, width: topD, thickness: t },
    });
    const spacing = H / n;
    for (let i = 1; i < n; i++) {
      const z = H - i * spacing;
      const depth = outerAt(z) - legD;
      parts.push({
        id: `shelf-${i}`,
        name: 'Shelf',
        material: mat,
        primitives: [
          { shape: 'box', size: [innerW, depth, t], at: [0, backY + legD + depth / 2, z - t / 2] },
        ],
        cut: { length: innerW, width: depth, thickness: t },
      });
      parts.push({
        id: `shelf-rail-${i}`,
        name: 'Shelf rail',
        material: mat,
        primitives: [
          {
            shape: 'box',
            size: [innerW, t, SHELF_RAIL_H],
            at: [0, backY + legD + depth - t / 2, z - t - SHELF_RAIL_H / 2],
          },
        ],
        cut: { length: innerW, width: SHELF_RAIL_H, thickness: t },
      });
    }

    if (innerW > maxShelfSpan(t)) {
      findings.push({
        severity: 'warning',
        message: `Shelves span ${formatLength(innerW, 'imperial')} at ${formatLength(t, 'imperial')} thick and may sag. Thicken the shelves or reduce the width.`,
      });
    }
    if (H > inch(48)) {
      findings.push({
        severity: 'warning',
        message: 'Tall stands should be anchored to the wall (anti-tip).',
      });
    }

    return { parts, findings };
  },
};
