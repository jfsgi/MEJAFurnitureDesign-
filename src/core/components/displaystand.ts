// Parametric tiered display stand, per the shop's drawings: rectangular legs
// (1-1/2" x 3") standing 3/4" proud of the top shelf, a raked front pair with level
// cuts, side rails with arched lower edges tying each pair, an arched front rail at
// the floor, and uniform-depth shelves running to the rear leg plane — each with a
// bowed front edge, a short backsplash, the bottom one seated on the cross supports.
// Still pending a fillet profile: the bullnose on the shelf fronts.

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
const LEG_PROUD = inch(0.75); // leg tops stand this far above the top shelf
const FRONT_BULGE = inch(0.75); // shelf front edge bow
const BACKSPLASH_H = inch(1.75);
const ARCH_RISE_FRONT = inch(2);
const ARCH_RISE_SIDE = inch(1);

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
          { shape: 'box', size: [legW, legD, H], at: [sx * legX, backY + legD / 2, H / 2] },
        ],
        cut: { length: H, width: legD, thickness: legW },
      });
    }

    // Raked front legs: sheared prisms — level top and foot cuts, slanted faces.
    const shearY = D - topD;
    const rakeLen = Math.hypot(H, shearY);
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
            height: H,
            at: [sx * legX, backY + topD - legD / 2, H / 2],
            align: [0, 0],
            shift: [0, shearY],
          },
        ],
        cut: { length: rakeLen, width: legD, thickness: legW },
      });
    }

    // Shelf surfaces: the top shelf sits 3/4" below the proud leg tops; the bottom
    // shelf is seated on the bottom cross supports; the rest space out evenly.
    const sTop = H - LEG_PROUD;
    const sBottom = BOTTOM_RAIL_Z + BOTTOM_RAIL_H + t;
    const surfaces = Array.from(
      { length: n },
      (_, i) => sTop - ((sTop - sBottom) * i) / (n - 1),
    );

    // Side rails tie each back leg to its raked leg and enclose the shelf ends:
    // the top pair runs flush with the proud leg tops (a gallery with the
    // backsplash), the bottom pair flush with the bottom shelf's top surface.
    // Lower edges arched; lengths measured at the lower edge so the front end
    // runs inside the raked leg like a tenon.
    const sideTopZ = H - SIDE_TOP_RAIL_H / 2;
    const sideTopLen = outerAt(H - SIDE_TOP_RAIL_H) - 2 * legD;
    for (const sx of [-1, 1]) {
      parts.push({
        id: `side-rail-top-${sx}`,
        name: 'Side rail (top)',
        material: mat,
        primitives: [
          {
            shape: 'archedBoard',
            size: [RAIL_T, sideTopLen, SIDE_TOP_RAIL_H],
            at: [sx * legX, backY + legD + sideTopLen / 2, sideTopZ],
            arch: 'bottom-y',
            rise: ARCH_RISE_SIDE,
            shoulder: inch(1),
          },
        ],
        cut: { length: sideTopLen, width: SIDE_TOP_RAIL_H, thickness: RAIL_T },
      });
    }
    const sideBotLen = outerAt(sBottom - SIDE_BOTTOM_RAIL_H) - 2 * legD;
    for (const sx of [-1, 1]) {
      parts.push({
        id: `side-rail-bottom-${sx}`,
        name: 'Side rail (bottom)',
        material: mat,
        primitives: [
          {
            shape: 'archedBoard',
            size: [RAIL_T, sideBotLen, SIDE_BOTTOM_RAIL_H],
            at: [sx * legX, backY + legD + sideBotLen / 2, sBottom - SIDE_BOTTOM_RAIL_H / 2],
            arch: 'bottom-y',
            rise: inch(0.75),
            shoulder: inch(1),
          },
        ],
        cut: { length: sideBotLen, width: SIDE_BOTTOM_RAIL_H, thickness: RAIL_T },
      });
    }

    // Long rails: a pair under the top shelf, and a pair at the floor carrying the
    // bottom shelf — the front one arched, per the drawing.
    const topRailZ = sTop - t - TOP_RAIL_H / 2;
    const botRailZ = BOTTOM_RAIL_Z + BOTTOM_RAIL_H / 2;
    parts.push({
      id: 'rail-top-front',
      name: 'Top rail',
      material: mat,
      primitives: [
        { shape: 'box', size: [innerW, RAIL_T, TOP_RAIL_H], at: [0, backY + topD - legD / 2, topRailZ] },
      ],
      cut: { length: innerW, width: TOP_RAIL_H, thickness: RAIL_T },
    });
    parts.push({
      id: 'rail-top-back',
      name: 'Top rail',
      material: mat,
      primitives: [
        { shape: 'box', size: [innerW, RAIL_T, TOP_RAIL_H], at: [0, backY + legD / 2, topRailZ] },
      ],
      cut: { length: innerW, width: TOP_RAIL_H, thickness: RAIL_T },
    });
    parts.push({
      id: 'rail-bottom-front',
      name: 'Bottom rail',
      material: mat,
      primitives: [
        {
          shape: 'archedBoard',
          size: [innerW, RAIL_T, BOTTOM_RAIL_H],
          at: [0, backY + outerAt(botRailZ) - legD / 2, botRailZ],
          arch: 'bottom-x',
          rise: ARCH_RISE_FRONT,
          shoulder: inch(1.5),
        },
      ],
      cut: { length: innerW, width: BOTTOM_RAIL_H, thickness: RAIL_T },
    });
    parts.push({
      id: 'rail-bottom-back',
      name: 'Bottom rail',
      material: mat,
      primitives: [
        { shape: 'box', size: [innerW, RAIL_T, BOTTOM_RAIL_H], at: [0, backY + legD / 2, botRailZ] },
      ],
      cut: { length: innerW, width: BOTTOM_RAIL_H, thickness: RAIL_T },
    });

    // Shelves: all the same depth as the top, back edges flush with the back of the
    // legs (the boards run between the legs to the rear plane). Bowed front edge,
    // short backsplash at the back; middles carry a rail under the front edge (the
    // top shelf rides the top rails, the bottom shelf the bottom cross supports).
    for (let i = 0; i < n; i++) {
      const s = surfaces[i];
      const isTop = i === 0;
      const isBottom = i === n - 1;
      parts.push({
        id: `shelf-${i}`,
        name: isTop ? 'Top shelf' : 'Shelf',
        material: mat,
        primitives: [
          {
            shape: 'archedBoard',
            size: [innerW, topD, t],
            at: [0, backY + topD / 2, s - t / 2],
            arch: 'front',
            rise: FRONT_BULGE,
          },
        ],
        cut: { length: innerW, width: topD + FRONT_BULGE, thickness: t },
      });
      const splashH = isTop ? LEG_PROUD : BACKSPLASH_H;
      parts.push({
        id: `backsplash-${i}`,
        name: 'Shelf backsplash',
        material: mat,
        primitives: [
          { shape: 'box', size: [innerW, t, splashH], at: [0, backY + t / 2, s + splashH / 2] },
        ],
        cut: { length: innerW, width: splashH, thickness: t },
      });
      if (!isTop && !isBottom) {
        parts.push({
          id: `shelf-rail-${i}`,
          name: 'Shelf rail',
          material: mat,
          primitives: [
            {
              shape: 'box',
              size: [innerW, t, SHELF_RAIL_H],
              at: [0, backY + topD - t / 2, s - t - SHELF_RAIL_H / 2],
            },
          ],
          cut: { length: innerW, width: SHELF_RAIL_H, thickness: t },
        });
      }
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
