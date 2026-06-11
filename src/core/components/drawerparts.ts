// Shared drawer-box construction used by every component that builds drawers
// (chest of drawers, drawer unit): two sides, two ends, and a recessed bottom,
// sized for side-mount slides.

import type { Part } from '../types';
import { inch } from '../units';

const BOTTOM_RECESS = inch(0.25); // drawer bottom sits up in its groove

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
}): Part[] {
  const { idPrefix, boxW, boxD, boxH, centerY, bottomZ, sideT, bottomT, material } = opts;
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
    parts.push({
      id: `${idPrefix}-end-${sy}`,
      name: 'Drawer end',
      material,
      primitives: [
        { shape: 'box', size: [endW, sideT, boxH], at: [0, centerY + sy * (boxD / 2 - sideT / 2), boxZ] },
      ],
      cut: { length: endW, width: boxH, thickness: sideT },
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
        at: [0, centerY, bottomZ + BOTTOM_RECESS + bottomT / 2],
      },
    ],
    cut: { length: endW, width: boxD - 2 * sideT, thickness: bottomT },
  });
  return parts;
}
