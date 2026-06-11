// Shared drawer-box construction used by every component that builds drawers
// (chest of drawers, drawer unit): two sides, two ends, and a recessed bottom,
// sized for side-mount slides.

import type { Part, Primitive } from '../types';
import { inch } from '../units';

const BOTTOM_RECESS = inch(0.25); // drawer bottom sits up in its groove

const PULL_WIDTH_MAX = inch(4.5);
const PULL_DEPTH_MAX = inch(1.125);

export type BoxJoinery = 'dovetail' | 'box-joint';

/**
 * One corner column of interlocking fingers: tails belong to the side board,
 * pins to the end board, alternating up the joint. Dovetails flare the tails
 * (and complement the pins) via horizontal-axis tapered boxes; box joints are
 * square fingers. Both stacks fill the column exactly.
 */
export function cornerFingerPrims(opts: {
  x: number;
  outerSign: 1 | -1; // which Y direction faces out of the joint
  yCenter: number;
  bottomZ: number;
  boxH: number;
  sideT: number;
  joinery: BoxJoinery;
}): { tails: Primitive[]; pins: Primitive[] } {
  const { x, yCenter, bottomZ, boxH, sideT, joinery } = opts;
  const n = Math.max(3, 2 * Math.round(boxH / (sideT * 3)) + 1); // odd: tails cap both ends
  const fh = boxH / n;
  const flare = joinery === 'dovetail' ? Math.min(fh * 0.2, sideT * 0.4) : 0;
  const tails: Primitive[] = [];
  const pins: Primitive[] = [];
  for (let k = 0; k < n; k++) {
    const z = bottomZ + (k + 0.5) * fh;
    const isTail = k % 2 === 0;
    // End fingers stay square (half-pins) so the joint ends flush at the edges.
    if (flare === 0 || k === 0 || k === n - 1) {
      (isTail ? tails : pins).push({
        shape: 'box',
        size: [sideT, sideT, fh],
        at: [x, yCenter, z],
      });
      continue;
    }
    const wide: [number, number] = [sideT, fh + 2 * flare];
    const narrow: [number, number] = [sideT, fh - 2 * flare];
    // Tails widen toward the outside of the joint; pins are their complement.
    const outerEndIsTop = opts.outerSign > 0;
    const grows = isTail === outerEndIsTop;
    (isTail ? tails : pins).push({
      shape: 'taperedBox',
      top: grows ? wide : narrow,
      bottom: grows ? narrow : wide,
      height: sideT,
      at: [x, yCenter, z],
      align: [0, 0],
      axis: 'y',
    });
  }
  return { tails, pins };
}

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

  // Sides vacate the corner columns; the joint fingers fill them below.
  const sideParts: Record<number, Part> = {};
  for (const sx of [-1, 1]) {
    const part: Part = {
      id: `${idPrefix}-side-${sx}`,
      name: 'Drawer side',
      material,
      primitives: [
        {
          shape: 'box',
          size: [sideT, boxD - 2 * sideT, boxH],
          at: [cx + sx * (boxW / 2 - sideT / 2), centerY, boxZ],
        },
      ],
      cut: { length: boxD, width: boxH, thickness: sideT },
    };
    sideParts[sx] = part;
    parts.push(part);
  }
  const endParts: Record<number, Part> = {};
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
        at: [cx, y, boxZ],
        arch: 'scoop',
        rise: pullD,
        shoulder: (endW - pullW) / 2,
      });
    } else {
      part.primitives.push({ shape: 'box', size: [endW, sideT, boxH], at: [cx, y, boxZ] });
    }
    endParts[sy] = part;
    parts.push(part);
  }

  // Interlocking corner joints: tails on the sides, pins on the ends.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1] as const) {
      const { tails, pins } = cornerFingerPrims({
        x: cx + sx * (boxW / 2 - sideT / 2),
        outerSign: sy,
        yCenter: centerY + sy * (boxD / 2 - sideT / 2),
        bottomZ,
        boxH,
        sideT,
        joinery,
      });
      sideParts[sx].primitives.push(...tails);
      endParts[sy].primitives.push(...pins);
    }
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
