// Parametric storage tower, after the MEJA cedar closet tower: an open cubby up top,
// a fixed shelf, and a bank of exposed box-joint drawers below — the drawer box IS the
// front (no applied front), so the slide gap shows at the sides, shop style.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';
import { drawerBoxParts } from './drawerparts';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

const SLIDE_CLEARANCE = inch(0.5);
const MIN_OPENING = inch(2.5);

export const storageTower: ComponentDef = {
  id: 'storage-tower',
  name: 'Storage tower',
  category: 'Storage',
  description: 'Tall narrow chest: open cubby over a bank of exposed drawers.',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(20), min: inch(12), max: inch(36), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(16), min: inch(10), max: inch(24), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Height', default: inch(48), min: inch(24), max: inch(78), tier: 'basic' },
    { kind: 'count', key: 'drawerCount', label: 'Drawers', default: 6, min: 1, max: 8, tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'cedar', tier: 'basic' },
    { kind: 'boolean', key: 'cubby', label: 'Open cubby on top', default: true, tier: 'advanced' },
    { kind: 'length', key: 'cubbyHeight', label: 'Cubby height', default: inch(12), min: inch(6), max: inch(24), tier: 'advanced' },
    { kind: 'boolean', key: 'graduated', label: 'Graduated heights', default: true, tier: 'advanced' },
    { kind: 'length', key: 'thickness', label: 'Board thickness', default: inch(0.75), min: inch(0.5), max: inch(1.25), tier: 'advanced' },
    { kind: 'length', key: 'backThickness', label: 'Back thickness', default: inch(0.25), min: inch(0.125), max: inch(0.75), tier: 'advanced' },
    { kind: 'length', key: 'boxSideThickness', label: 'Box side thickness', default: inch(0.5), min: inch(0.375), max: inch(0.75), tier: 'advanced' },
    { kind: 'length', key: 'gap', label: 'Drawer gap', default: inch(0.125), min: inch(0.0625), max: inch(0.25), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const n = num(p, 'drawerCount');
    const t = num(p, 'thickness');
    const backT = num(p, 'backThickness');
    const sideT = num(p, 'boxSideThickness');
    const gap = num(p, 'gap');
    const hasCubby = p['cubby'] as boolean;
    const graduated = p['graduated'] as boolean;
    const mat = str(p, 'material');

    const innerW = W - 2 * t;
    const innerH = H - 2 * t;
    // The cubby and its shelf come off the top of the interior; drawers fill the rest.
    const cubbyH = hasCubby ? Math.min(num(p, 'cubbyHeight'), innerH - n * MIN_OPENING - t) : 0;
    const drawerRegionTop = H - t - (hasCubby ? cubbyH + t : 0);
    const drawerRegionH = drawerRegionTop - t;

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
    if (hasCubby) {
      const shelfD = D - backT;
      parts.push({
        id: 'cubby-shelf',
        name: 'Fixed shelf',
        material: mat,
        primitives: [
          { shape: 'box', size: [innerW, shelfD, t], at: [0, backT / 2, drawerRegionTop + t / 2] },
        ],
        cut: { length: innerW, width: shelfD, thickness: t },
      });
    }

    // Openings split the drawer region; graduated heights shrink toward the top,
    // same series as the chest of drawers.
    const available = drawerRegionH - (n + 1) * gap;
    const equal = available / n;
    let step = 0;
    if (graduated && n > 1) {
      step = Math.min(equal * 0.25, Math.max(0, ((equal - MIN_OPENING) * 2) / (n - 1)));
    }
    const heights = Array.from({ length: n }, (_, i) => equal - step * ((n - 1) / 2 - i));

    const boxW = innerW - 2 * SLIDE_CLEARANCE;
    const boxD = D - backT - inch(0.5);
    const boxY = D / 2 - boxD / 2;

    let zCursor = drawerRegionTop;
    for (let i = 0; i < n; i++) {
      const h = heights[i];
      zCursor -= gap;
      const openingTop = zCursor;
      zCursor -= h;
      // Exposed box: the box front is the show front, nearly filling its opening.
      parts.push(
        ...drawerBoxParts({
          idPrefix: `drawer-${i}`,
          boxW,
          boxD,
          boxH: h - inch(0.25),
          centerY: boxY,
          bottomZ: openingTop - h + inch(0.125),
          sideT,
          bottomT: inch(0.25),
          material: mat,
        }),
      );
    }

    if (equal < MIN_OPENING) {
      findings.push({
        severity: 'warning',
        message: `${n} drawers leave openings under ${formatLength(MIN_OPENING, 'imperial')}. Reduce the count, shrink the cubby, or add height.`,
      });
    }
    if (H > inch(48)) {
      findings.push({
        severity: 'warning',
        message: 'Tall chests should be anchored to the wall (anti-tip).',
      });
    }

    return { parts, findings };
  },
};
