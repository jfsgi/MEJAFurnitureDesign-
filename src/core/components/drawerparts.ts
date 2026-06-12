// Shared drawer-box construction used by every component that builds drawers
// (chest of drawers, drawer unit, tower, wine cube): jointed sides and ends
// rendered by the 4K engine's joinery generator, plus a recessed bottom,
// sized for side-mount slides.

import type { Part } from '../types';
import { inch } from '../units';

const BOTTOM_RECESS = inch(0.25); // drawer bottom sits up in its groove

const PULL_WIDTH_MAX = inch(4.5);
const PULL_DEPTH_MAX = inch(1.125);

/** Half-blind sockets stop this short of the mating board's show face — the
 * engine's lip: tails bury into a plain solid cap instead of meeting pins. */
export const HALF_BLIND_LIP = 6;

export type BoxJoinery = 'dovetail' | 'box-joint';

export type CaseJoinery = 'half-blind-dovetail' | 'through-dovetail' | 'box-joint';

export function drawerBoxParts(opts: {
  idPrefix: string;
  boxW: number;
  boxD: number;
  boxH: number;
  centerY: number;
  bottomZ: number;
  sideT: number;
  bottomT: number;
  material: string;
  /** Scoop a finger pull into the top edge of the front. */
  pull?: boolean;
  /** Column offset for multi-bank cases. */
  centerX?: number;
  /** Corner joint rendered at all four corners. */
  joinery?: BoxJoinery;
}): Part[] {
  const { idPrefix, boxW, boxD, boxH, centerY, bottomZ, sideT, bottomT, material, pull } = opts;
  const cx = opts.centerX ?? 0;
  const joinery = opts.joinery ?? 'box-joint';
  const boxZ = bottomZ + boxH / 2;
  const endW = boxW - 2 * sideT;
  const parts: Part[] = [];

  // Sides: tails boards, toothed at both ends, running front to back.
  for (const sx of [-1, 1]) {
    parts.push({
      id: `${idPrefix}-side-${sx}`,
      name: 'Drawer side',
      material,
      primitives: [
        {
          shape: 'jointedBoard',
          role: 'tails',
          length: boxD,
          height: boxH,
          thickness: sideT,
          at: [cx + sx * (boxW / 2 - sideT / 2), centerY, boxZ],
          lengthAxis: 'y',
          thicknessAxis: 'x',
          joint: joinery === 'dovetail' ? 'dovetail' : 'box-joint',
          jointDepth: sideT,
        },
      ],
      cut: { length: boxD, width: boxH, thickness: sideT },
    });
  }
  // Ends: pins boards spanning the full width, the front optionally scooped.
  for (const sy of [-1, 1] as const) {
    const isFront = sy > 0;
    const scooped = isFront && pull;
    parts.push({
      id: `${idPrefix}-end-${sy}`,
      name: scooped ? 'Drawer end (pull)' : 'Drawer end',
      material,
      primitives: [
        {
          shape: 'jointedBoard',
          role: 'pins',
          length: boxW,
          height: boxH,
          thickness: sideT,
          at: [cx, centerY + sy * (boxD / 2 - sideT / 2), boxZ],
          lengthAxis: 'x',
          thicknessAxis: 'y',
          outerSign: sy,
          joint: joinery === 'dovetail' ? 'dovetail' : 'box-joint',
          jointDepth: sideT,
          scoop: scooped
            ? {
                width: Math.min(PULL_WIDTH_MAX, endW * 0.4),
                depth: Math.min(PULL_DEPTH_MAX, boxH * 0.4),
              }
            : undefined,
        },
      ],
      cut: { length: boxW, width: boxH, thickness: sideT },
    });
  }
  parts.push({
    id: `${idPrefix}-bottom`,
    name: 'Drawer bottom',
    material,
    primitives: [
      {
        shape: 'box',
        size: [endW, boxD - 2 * sideT, bottomT],
        at: [cx, centerY, bottomZ + BOTTOM_RECESS + bottomT / 2],
      },
    ],
    cut: { length: endW, width: boxD - 2 * sideT, thickness: bottomT },
  });
  return parts;
}
