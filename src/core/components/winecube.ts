// Parametric wine cube, after the MEJA white-oak piece: a case with X dividers
// (the first tilted parts in the library) and an optional exposed drawer below.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';
import { drawerBoxParts } from './drawerparts';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

const SLIDE_CLEARANCE = inch(0.5);
const BOTTLE_LENGTH = inch(11.5); // a 750 ml Bordeaux bottle, give or take
const MIN_QUADRANT = inch(14); // X opening below this pinches standard bottles

export const wineCube: ComponentDef = {
  id: 'wine-cube',
  name: 'Wine cube',
  category: 'Storage',
  description: 'Cubby with X dividers for bottles, optional drawer below.',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(20), min: inch(12), max: inch(36), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(12), min: inch(8), max: inch(18), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Height', default: inch(28), min: inch(14), max: inch(48), tier: 'basic' },
    { kind: 'boolean', key: 'drawer', label: 'Drawer below', default: true, tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'white-oak', tier: 'basic' },
    { kind: 'length', key: 'drawerHeight', label: 'Drawer height', default: inch(6), min: inch(3), max: inch(12), tier: 'advanced' },
    { kind: 'boolean', key: 'pull', label: 'Finger pull cutout', default: false, tier: 'advanced' },
    { kind: 'length', key: 'thickness', label: 'Board thickness', default: inch(0.75), min: inch(0.5), max: inch(1.25), tier: 'advanced' },
    { kind: 'length', key: 'backThickness', label: 'Back thickness', default: inch(0.25), min: inch(0.125), max: inch(0.5), tier: 'advanced' },
    { kind: 'length', key: 'boxSideThickness', label: 'Box side thickness', default: inch(0.5), min: inch(0.375), max: inch(0.75), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const t = num(p, 'thickness');
    const backT = num(p, 'backThickness');
    const sideT = num(p, 'boxSideThickness');
    const hasDrawer = p['drawer'] as boolean;
    const drawerH = hasDrawer ? Math.min(num(p, 'drawerHeight'), H / 3) : 0;
    const mat = str(p, 'material');

    const innerW = W - 2 * t;
    const innerH = H - 2 * t;
    // X region sits above the drawer (and its shelf when present).
    const xBottom = t + (hasDrawer ? drawerH + t : 0);
    const xTop = H - t;
    const xH = xTop - xBottom;
    const panelD = D - backT;

    const parts: Part[] = [];
    const findings: Finding[] = [];

    for (const sx of [-1, 1]) {
      parts.push({
        id: `side-${sx}`,
        name: 'Side',
        material: mat,
        primitives: [{ shape: 'box', size: [t, D, H], at: [sx * (W / 2 - t / 2), 0, H / 2] }],
        cut: { length: H, width: D, thickness: t },
      });
    }
    parts.push({
      id: 'bottom',
      name: 'Bottom',
      material: mat,
      primitives: [{ shape: 'box', size: [innerW, D, t], at: [0, 0, t / 2] }],
      cut: { length: innerW, width: D, thickness: t },
    });
    parts.push({
      id: 'top',
      name: 'Top',
      material: mat,
      primitives: [{ shape: 'box', size: [innerW, D, t], at: [0, 0, H - t / 2] }],
      cut: { length: innerW, width: D, thickness: t },
    });
    parts.push({
      id: 'back',
      name: 'Back panel',
      material: mat,
      primitives: [
        { shape: 'box', size: [innerW, backT, innerH], at: [0, -(D / 2 - backT / 2), H / 2] },
      ],
      cut: { length: innerH, width: innerW, thickness: backT },
    });

    // X dividers: two crossing diagonals, pulled in from the corners so the tilted
    // ends stay inside the case. They lap through each other at the center.
    const angle = Math.atan2(xH, innerW);
    const panelL = Math.hypot(innerW, xH) - 2 * t;
    const xCenter: [number, number, number] = [0, backT / 2, xBottom + xH / 2];
    for (const dir of [-1, 1]) {
      parts.push({
        id: `divider-${dir}`,
        name: 'Divider (diagonal)',
        material: mat,
        primitives: [
          { shape: 'box', size: [panelL, panelD, t], at: xCenter, tilt: dir * angle },
        ],
        cut: { length: panelL, width: panelD, thickness: t },
      });
    }

    if (hasDrawer) {
      const shelfD = D - backT;
      parts.push({
        id: 'drawer-shelf',
        name: 'Fixed shelf',
        material: mat,
        primitives: [
          { shape: 'box', size: [innerW, shelfD, t], at: [0, backT / 2, t + drawerH + t / 2] },
        ],
        cut: { length: innerW, width: shelfD, thickness: t },
      });
      const boxD = D - backT - inch(0.5);
      parts.push(
        ...drawerBoxParts({
          idPrefix: 'drawer',
          boxW: innerW - 2 * SLIDE_CLEARANCE,
          boxD,
          boxH: drawerH - inch(0.25),
          centerY: D / 2 - boxD / 2,
          bottomZ: t + inch(0.125),
          sideT,
          bottomT: inch(0.25),
          material: mat,
          pull: p['pull'] as boolean,
        }),
      );
    }

    if (Math.min(innerW, xH) < MIN_QUADRANT) {
      findings.push({
        severity: 'warning',
        message: `The X openings are tight for standard bottles. Keep the cubby at least ${formatLength(MIN_QUADRANT + 2 * t, 'imperial')} square.`,
      });
    }
    if (panelD < BOTTLE_LENGTH) {
      findings.push({
        severity: 'warning',
        message: `Bottles are ~${formatLength(BOTTLE_LENGTH, 'imperial')} long; at ${formatLength(D, 'imperial')} deep they will overhang the front.`,
      });
    }

    return { parts, findings };
  },
};
