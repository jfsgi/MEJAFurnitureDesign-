// Parametric drawer unit, MEJA's countertop/desktop product: an outer case with N
// drawers — full boxes behind inset or overlay fronts — mirroring the production Box
// Builder's construction (case walls, back gap, slide gaps, front clearances).

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';
import { drawerBoxParts } from './drawerparts';
import { slideFitWarning } from './drawerbox';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

const SLIDE_CLEARANCE = inch(0.5); // per side, standard side-mount slides
const BOX_HEIGHT_CLEARANCE = inch(1);
const BACK_GAP = inch(0.5); // box to back panel (slide stop + back offset)
const MIN_OPENING = inch(2);

export const drawerUnit: ComponentDef = {
  id: 'drawer-unit',
  name: 'Drawer unit',
  category: 'Drawers',
  description: 'Countertop case with sliding drawers, inset or overlay fronts.',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(24), min: inch(10), max: inch(48), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(14), min: inch(8), max: inch(30), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Height', default: inch(8), min: inch(3), max: inch(24), tier: 'basic' },
    { kind: 'count', key: 'drawerCount', label: 'Drawers', default: 2, min: 1, max: 6, tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'walnut', tier: 'basic' },
    { kind: 'enum', key: 'frontStyle', label: 'Front style', default: 'inset', tier: 'advanced',
      options: [
        { value: 'inset', label: 'Inset' },
        { value: 'overlay', label: 'Overlay' },
      ] },
    { kind: 'material', key: 'boxMaterial', label: 'Drawer box material', default: 'maple', tier: 'advanced' },
    { kind: 'length', key: 'thickness', label: 'Case thickness', default: inch(0.625), min: inch(0.5), max: inch(1), tier: 'advanced' },
    { kind: 'length', key: 'backThickness', label: 'Back thickness', default: inch(0.25), min: inch(0.125), max: inch(0.5), tier: 'advanced' },
    { kind: 'length', key: 'boxSideThickness', label: 'Box side thickness', default: inch(0.5), min: inch(0.375), max: inch(0.75), tier: 'advanced' },
    { kind: 'length', key: 'gap', label: 'Front gap', default: inch(0.0625), min: inch(0.03125), max: inch(0.25), tier: 'advanced' },
    { kind: 'length', key: 'overlayAmount', label: 'Overlay amount', default: inch(0.5), min: inch(0.25), max: inch(0.75), tier: 'advanced' },
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
    const overlay = num(p, 'overlayAmount');
    const overlayFronts = str(p, 'frontStyle') === 'overlay';
    const mat = str(p, 'material');
    const boxMat = str(p, 'boxMaterial');

    const innerW = W - 2 * t;
    const innerH = H - 2 * t;

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

    // Openings: equal slices of the interior with a gap above, below, and between.
    const opening = (innerH - (n + 1) * gap) / n;
    const boxW = innerW - 2 * SLIDE_CLEARANCE;
    const boxD = D - backT - t - BACK_GAP;
    const boxY = D / 2 - t - boxD / 2;

    // Overlay fronts cover the case edges; their own stack starts above the top edge.
    const frontW = overlayFronts ? Math.min(innerW + 2 * overlay, W) : innerW - 2 * gap;
    const frontH = overlayFronts ? (innerH + 2 * overlay - (n - 1) * gap) / n : opening;
    const frontY = overlayFronts ? D / 2 + t / 2 : D / 2 - t / 2;

    let openingCursor = H - t;
    let frontCursor = overlayFronts ? H - t + overlay : H - t;
    for (let i = 0; i < n; i++) {
      openingCursor -= gap;
      const openingTop = openingCursor;
      openingCursor -= opening;
      if (!overlayFronts) frontCursor = openingTop;

      parts.push({
        id: `drawer-front-${i}`,
        name: 'Drawer front',
        material: mat,
        primitives: [{ shape: 'box', size: [frontW, t, frontH], at: [0, frontY, frontCursor - frontH / 2] }],
        cut: { length: frontW, width: frontH, thickness: t },
      });
      if (overlayFronts) frontCursor -= frontH + gap;

      parts.push(
        ...drawerBoxParts({
          idPrefix: `drawer-${i}`,
          boxW,
          boxD,
          boxH: Math.max(opening - BOX_HEIGHT_CLEARANCE, inch(0.75)),
          centerY: boxY,
          bottomZ: openingTop - opening + inch(0.25),
          sideT,
          bottomT: inch(0.25),
          material: boxMat,
        }),
      );
    }

    if (opening < MIN_OPENING) {
      findings.push({
        severity: 'warning',
        message: `${n} drawers in ${formatLength(H, 'imperial')} leaves openings under ${formatLength(MIN_OPENING, 'imperial')}. Reduce the count or add height.`,
      });
    }
    if (boxW > inch(36)) {
      findings.push({
        severity: 'warning',
        message: `Drawers ${formatLength(boxW, 'imperial')} wide tend to rack. Consider two banks of drawers.`,
      });
    }
    const slideWarning = slideFitWarning(boxD);
    if (slideWarning) findings.push(slideWarning);

    return { parts, findings };
  },
};
