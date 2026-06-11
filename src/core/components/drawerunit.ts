// Parametric drawer unit, MEJA's countertop/desktop product: an outer case split
// into columns by case-stock dividers, each column carrying a bank of drawers —
// full boxes behind inset or overlay fronts. Reveals follow the shop standard:
// inset fronts sit in their openings with a reveal all around (1/8" typical);
// overlay fronts sit on the box face with a reveal at the case's outer edges
// (1/16" typical); stacked fronts are spaced by that same reveal. The back panel
// insets 1/4" from the rear of the box.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';
import { drawerBoxParts } from './drawerparts';
import { slideFitWarning } from './drawerbox';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

const SLIDE_CLEARANCE = inch(0.5); // per side, standard side-mount slides
const BOX_HEIGHT_CLEARANCE = inch(1);
const BACK_OFFSET = inch(0.25); // back panel inset from the rear of the box
const DRAWER_BACK_GAP = inch(0.25); // box to back panel
const MIN_OPENING = inch(2);

export const drawerUnit: ComponentDef = {
  id: 'drawer-unit',
  name: 'Drawer unit',
  category: 'Drawers',
  description: 'Countertop case with sliding drawers, inset or overlay fronts.',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(24), min: inch(10), max: inch(60), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(14), min: inch(8), max: inch(30), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Height', default: inch(8), min: inch(3), max: inch(24), tier: 'basic' },
    { kind: 'count', key: 'drawerCount', label: 'Drawers per column', default: 2, min: 1, max: 6, tier: 'basic' },
    { kind: 'count', key: 'columns', label: 'Columns', default: 1, min: 1, max: 4, tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'walnut', tier: 'basic' },
    { kind: 'enum', key: 'frontStyle', label: 'Front style', default: 'inset', tier: 'advanced',
      options: [
        { value: 'inset', label: 'Inset' },
        { value: 'overlay', label: 'Overlay' },
      ] },
    { kind: 'boolean', key: 'pulls', label: 'Finger pull cutouts', default: true, tier: 'advanced' },
    { kind: 'material', key: 'boxMaterial', label: 'Drawer box material', default: 'maple', tier: 'advanced' },
    { kind: 'enum', key: 'caseJoinery', label: 'Case joinery', default: 'half-blind-dovetail', tier: 'advanced',
      options: [
        { value: 'half-blind-dovetail', label: 'Dovetail' },
        { value: 'butt', label: 'Screwed' },
      ] },
    { kind: 'length', key: 'thickness', label: 'Case thickness', default: inch(0.625), min: inch(0.5), max: inch(1), tier: 'advanced' },
    { kind: 'length', key: 'backThickness', label: 'Back thickness', default: inch(0.25), min: inch(0.125), max: inch(0.5), tier: 'advanced' },
    { kind: 'length', key: 'boxSideThickness', label: 'Box side thickness', default: inch(0.5), min: inch(0.375), max: inch(0.75), tier: 'advanced' },
    { kind: 'length', key: 'insetReveal', label: 'Inset reveal', default: inch(0.125), min: inch(0.0625), max: inch(0.25), tier: 'advanced' },
    { kind: 'length', key: 'overlayReveal', label: 'Overlay reveal', default: inch(0.0625), min: inch(0.03125), max: inch(0.25), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const n = num(p, 'drawerCount');
    const t = num(p, 'thickness');
    const backT = num(p, 'backThickness');
    const sideT = num(p, 'boxSideThickness');
    const rIns = num(p, 'insetReveal');
    const rOv = num(p, 'overlayReveal');
    const overlayFronts = str(p, 'frontStyle') === 'overlay';
    const pulls = p['pulls'] as boolean;
    const mat = str(p, 'material');
    const boxMat = str(p, 'boxMaterial');

    const innerW = W - 2 * t;
    const innerH = H - 2 * t;

    const parts: Part[] = [];
    const findings: Finding[] = [];

    // Half-blind dovetails join the sides to the top and bottom: the sides carry
    // the tails over their full height, and the top/bottom stock runs into the
    // sockets — half the side thickness deep at each end — so their cut length is
    // longer than the clear interior span. (Joint geometry renders square until
    // the joinery system lands.)
    const dovetailed = str(p, 'caseJoinery') === 'half-blind-dovetail';
    const jointTag = dovetailed ? ' (half-blind DT)' : '';
    const capLen = dovetailed ? innerW + t : innerW;
    for (const sx of [-1, 1]) {
      parts.push({
        id: `side-${sx}`,
        name: `Side${jointTag}`,
        material: mat,
        primitives: [{ shape: 'box', size: [t, D, H], at: [sx * (W / 2 - t / 2), 0, H / 2] }],
        cut: { length: H, width: D, thickness: t },
      });
    }
    parts.push({
      id: 'bottom',
      name: `Bottom${jointTag}`,
      material: mat,
      primitives: [{ shape: 'box', size: [innerW, D, t], at: [0, 0, t / 2] }],
      cut: { length: capLen, width: D, thickness: t },
    });
    parts.push({
      id: 'top',
      name: `Top${jointTag}`,
      material: mat,
      primitives: [{ shape: 'box', size: [innerW, D, t], at: [0, 0, H - t / 2] }],
      cut: { length: capLen, width: D, thickness: t },
    });
    // Back panel, inset from the rear of the box per the shop standard.
    parts.push({
      id: 'back',
      name: 'Back panel',
      material: mat,
      primitives: [
        {
          shape: 'box',
          size: [innerW, backT, innerH],
          at: [0, -D / 2 + BACK_OFFSET + backT / 2, H / 2],
        },
      ],
      cut: { length: innerH, width: innerW, thickness: backT },
    });

    // Columns split the interior with full dividers of case stock; each column
    // carries its own bank of drawers riding the case sides and the dividers.
    const nCol = num(p, 'columns');
    const colW = (innerW - (nCol - 1) * t) / nCol;
    const dividerD = D - BACK_OFFSET - backT;
    for (let c = 1; c < nCol; c++) {
      parts.push({
        id: `divider-${c}`,
        name: 'Divider',
        material: mat,
        primitives: [
          {
            shape: 'box',
            size: [t, dividerD, innerH],
            at: [-innerW / 2 + c * (colW + t) - t / 2, (BACK_OFFSET + backT) / 2, H / 2],
          },
        ],
        cut: { length: innerH, width: dividerD, thickness: t },
      });
    }

    // Interior openings: inset fronts live inside them with the reveal above,
    // below, and between; overlay construction splits the interior evenly and
    // the reveals live on the case face instead.
    const opening = overlayFronts ? innerH / n : (innerH - (n + 1) * rIns) / n;
    const boxW = colW - 2 * SLIDE_CLEARANCE;
    const boxD = D - BACK_OFFSET - backT - DRAWER_BACK_GAP - t;
    const boxY = D / 2 - t - boxD / 2;

    // Front grid. Inset: within each opening, reveal all around. Overlay: fronts
    // sit on the box face, covering it to within the reveal of the outer edges,
    // spaced from each other by the same reveal (splitting dividers and rails).
    const frontW = overlayFronts ? (W - (nCol + 1) * rOv) / nCol : colW - 2 * rIns;
    const frontH = overlayFronts ? (H - (n + 1) * rOv) / n : opening;
    const frontY = overlayFronts ? D / 2 + t / 2 : D / 2 - t / 2;

    for (let c = 0; c < nCol; c++) {
      const colX = -innerW / 2 + c * (colW + t) + colW / 2;
      const frontX = overlayFronts ? -W / 2 + rOv + c * (frontW + rOv) + frontW / 2 : colX;
      for (let i = 0; i < n; i++) {
        const openingTop = overlayFronts
          ? H - t - i * opening
          : H - t - rIns - i * (opening + rIns);
        const frontTop = overlayFronts ? H - rOv - i * (frontH + rOv) : openingTop;

        // Finger pull scooped from the top middle of the front, to the shop pattern.
        const pullW = Math.min(inch(4.5), frontW * 0.4);
        const pullD = Math.min(inch(1.125), frontH * 0.4);
        parts.push({
          id: `drawer-front-${c}-${i}`,
          name: pulls ? 'Drawer front (pull)' : 'Drawer front',
          material: mat,
          primitives: [
            pulls
              ? {
                  shape: 'archedBoard',
                  size: [frontW, t, frontH],
                  at: [frontX, frontY, frontTop - frontH / 2],
                  arch: 'scoop',
                  rise: pullD,
                  shoulder: (frontW - pullW) / 2,
                }
              : { shape: 'box', size: [frontW, t, frontH], at: [frontX, frontY, frontTop - frontH / 2] },
          ],
          cut: { length: frontW, width: frontH, thickness: t },
        });

        parts.push(
          ...drawerBoxParts({
            idPrefix: `drawer-${c}-${i}`,
            boxW,
            boxD,
            boxH: Math.max(opening - BOX_HEIGHT_CLEARANCE, inch(0.75)),
            centerY: boxY,
            bottomZ: openingTop - opening + inch(0.25),
            sideT,
            bottomT: inch(0.25),
            material: boxMat,
            centerX: colX,
          }),
        );
      }
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
        message: `Drawers ${formatLength(boxW, 'imperial')} wide tend to rack. Add a column to split the bank.`,
      });
    }
    const slideWarning = slideFitWarning(boxD);
    if (slideWarning) findings.push(slideWarning);

    return { parts, findings };
  },
};
