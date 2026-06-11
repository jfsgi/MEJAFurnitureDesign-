// Shared drawer-box construction used by every component that builds drawers
// (chest of drawers, drawer unit): two sides, two ends, and a recessed bottom,
// sized for side-mount slides.

import type { Part } from '../types';
import { inch } from '../units';

const BOTTOM_RECESS = inch(0.25); // drawer bottom sits up in its groove

const PULL_WIDTH_MAX = inch(4.5);
const PULL_DEPTH_MAX = inch(1.125);

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
  /** Notch a finger-pull cutout into the top edge of the front. */
  pull?: boolean;
}): Part[] {
  const { idPrefix, boxW, boxD, boxH, centerY, bottomZ, sideT, bottomT, material, pull } = opts;
  const boxZ = bottomZ + boxH / 2;
  const endW = boxW - 2 * sideT;
  const parts: Part[] = [];

  for (const sx of [-1, 1]) {
    parts.push({
      id: `${idPrefix}-side-${sx}`,
      name: 'Drawer side',
      material,
      primitives: [
        { shape: 'box', size: [sideT, boxD, boxH], at: [sx * (boxW / 2 - sideT / 2), centerY, boxZ] },
      ],
      cut: { length: boxD, width: boxH, thickness: sideT },
    });
  }
  for (const sy of [-1, 1]) {
    const y = centerY + sy * (boxD / 2 - sideT / 2);
    const isFront = sy > 0;
    // The cut entry stays the full board either way — the pull is notched out of it.
    const part: Part = {
      id: `${idPrefix}-end-${sy}`,
      name: isFront && pull ? 'Drawer end (pull)' : 'Drawer end',
      material,
      primitives: [],
      cut: { length: endW, width: boxH, thickness: sideT },
    };
    if (isFront && pull) {
      // Smooth shaper-cutter scoop, to the shop pattern's scale.
      const pullW = Math.min(PULL_WIDTH_MAX, endW * 0.4);
      const pullD = Math.min(PULL_DEPTH_MAX, boxH * 0.4);
      part.primitives.push({
        shape: 'archedBoard',
        size: [endW, sideT, boxH],
        at: [0, y, boxZ],
        arch: 'scoop',
        rise: pullD,
        shoulder: (endW - pullW) / 2,
      });
    } else {
      part.primitives.push({ shape: 'box', size: [endW, sideT, boxH], at: [0, y, boxZ] });
    }
    parts.push(part);
  }
  parts.push({
    id: `${idPrefix}-bottom`,
    name: 'Drawer bottom',
    material,
    primitives: [
      {
        shape: 'box',
        size: [endW, boxD - 2 * sideT, bottomT],
        at: [0, centerY, bottomZ + BOTTOM_RECESS + bottomT / 2],
      },
    ],
    cut: { length: endW, width: boxD - 2 * sideT, thickness: bottomT },
  });
  return parts;
}
