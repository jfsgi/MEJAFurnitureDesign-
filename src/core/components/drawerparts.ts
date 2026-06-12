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
 * Classic dovetail layout along a joint line: slim pins at an even pitch
 * (half-pins at both ends), wide tails filling between — the proportions a
 * dovetail jig or hand layout produces, not 50/50 fingers. `wOuter` is the
 * width at the outer (cap/end-grain) face, `wInner` at the joint root.
 */
function dovetailSlots(length: number, t: number) {
  const pw = Math.min(t * 0.6, length / 4); // pin width at the outer face
  const tip = pw * 0.35; // pin width at the root
  const np = Math.max(2, Math.round(length / (t * 1.9)));
  const span = length - pw;
  const pins = Array.from({ length: np }, (_, i) => ({
    c: -length / 2 + pw / 2 + (np === 1 ? span / 2 : (i * span) / (np - 1)),
    wOuter: pw,
    wInner: tip,
  }));
  const tails = [];
  for (let i = 0; i < np - 1; i++) {
    const c = (pins[i].c + pins[i + 1].c) / 2;
    const gap = pins[i + 1].c - pins[i].c;
    tails.push({ c, wOuter: gap - pw, wInner: gap - tip });
  }
  return { pins, tails };
}

/** Pins render a hair proud of the joint faces so they never z-fight the column. */
const PIN_PROUD = 0.4;

export type CaseJoinery = 'half-blind-dovetail' | 'through-dovetail' | 'box-joint';

/**
 * One case corner where a side meets the top or bottom: a row of fingers along
 * the depth. Through dovetails and box joints pierce the cap (visible from the
 * cap face); half-blind dovetails stop a lap short — tails and pins show on the
 * side face with the cap's lap strip above them, and the cap face stays clean.
 */
export function caseCornerFingers(opts: {
  zEdge: 'top' | 'bottom';
  sx: 1 | -1;
  W: number;
  D: number;
  H: number;
  t: number;
  style: CaseJoinery;
}): { sideFingers: Primitive[]; capFingers: Primitive[] } {
  const { sx, W, D, H, t, style } = opts;
  const x = sx * (W / 2 - t / 2);
  const top = opts.zEdge === 'top';
  const lap = style === 'half-blind-dovetail' ? t / 3 : 0;
  const bandH = t - lap;
  const zc = top ? H - t + bandH / 2 : t - bandH / 2;
  const sideFingers: Primitive[] = [];
  const capFingers: Primitive[] = [];

  // Solid band of side material fills the corner; the cap's pins render a hair
  // proud over it — no complementary-face math, so no voids and no z-fighting.
  sideFingers.push({ shape: 'box', size: [t, D, bandH], at: [x, 0, zc] });

  if (style === 'box-joint') {
    const n = Math.max(3, 2 * Math.round(D / (t * 3)) + 1);
    const fy = D / n;
    for (let k = 1; k < n; k += 2) {
      capFingers.push({
        shape: 'box',
        size: [t + PIN_PROUD, fy, bandH + PIN_PROUD],
        at: [x, -D / 2 + (k + 0.5) * fy, zc],
        endGrain: true,
      });
    }
  } else {
    // Dovetail pins: slim, widest at the cap face, slightly proud of the band.
    for (const pin of dovetailSlots(D, t).pins) {
      capFingers.push({
        shape: 'taperedBox',
        top: top ? [t + PIN_PROUD, pin.wOuter] : [t + PIN_PROUD, pin.wInner],
        bottom: top ? [t + PIN_PROUD, pin.wInner] : [t + PIN_PROUD, pin.wOuter],
        height: bandH + PIN_PROUD,
        at: [x, pin.c, zc],
        align: [0, 0],
        endGrain: true,
      });
    }
  }
  if (lap > 0) {
    // The half-blind lap: cap material covering the joint from the cap face.
    capFingers.push({
      shape: 'box',
      size: [t, D, lap],
      at: [x, 0, top ? H - lap / 2 : lap / 2],
    });
  }
  return { sideFingers, capFingers };
}

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
  const zMid = bottomZ + boxH / 2;
  const tails: Primitive[] = [];
  const pins: Primitive[] = [];

  // Solid corner column of side material; the end board's pins render a hair
  // proud over it — no complementary-face math, so no voids and no z-fighting.
  tails.push({
    shape: 'box',
    size: [sideT, sideT, boxH],
    at: [x, yCenter, zMid],
  });

  if (joinery === 'box-joint') {
    const n = Math.max(3, 2 * Math.round(boxH / (sideT * 3)) + 1);
    const fh = boxH / n;
    for (let k = 1; k < n; k += 2) {
      pins.push({
        shape: 'box',
        size: [sideT + PIN_PROUD, sideT + PIN_PROUD, fh],
        at: [x, yCenter, bottomZ + (k + 0.5) * fh],
        endGrain: true,
      });
    }
    return { tails, pins };
  }

  // Dovetail: slim pins at an even pitch, wide at the outer (end-grain) face.
  const grows = opts.outerSign > 0; // outer face of the joint sits at +Y
  for (const pin of dovetailSlots(boxH, sideT).pins) {
    pins.push({
      shape: 'taperedBox',
      top: grows ? [sideT + PIN_PROUD, pin.wOuter] : [sideT + PIN_PROUD, pin.wInner],
      bottom: grows ? [sideT + PIN_PROUD, pin.wInner] : [sideT + PIN_PROUD, pin.wOuter],
      height: sideT + PIN_PROUD,
      at: [x, yCenter, zMid + pin.c],
      align: [0, 0],
      axis: 'y',
      endGrain: true,
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
