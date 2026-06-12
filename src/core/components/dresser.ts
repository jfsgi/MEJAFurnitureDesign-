// Parametric chest of drawers: carcase + N drawers, each an inset front with a full
// drawer box behind it (sides, ends, bottom — sized for side-mount slides). Drawer
// heights optionally graduate, shallowest at the top, the classic dresser proportion.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';
import { HALF_BLIND_LIP, drawerBoxParts } from './drawerparts';
import { caseBoardPrims } from './drawerunit';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

const SLIDE_CLEARANCE = inch(0.5); // per side, standard side-mount slides
const BOX_HEIGHT_CLEARANCE = inch(1);
const BOX_DEPTH_CLEARANCE = inch(1);
const MIN_OPENING = inch(2.5);

export const dresser: ComponentDef = {
  id: 'dresser',
  name: 'Chest of drawers',
  category: 'Storage',
  description: 'Drawer chest with inset fronts. Heights graduate toward the top.',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(36), min: inch(16), max: inch(72), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(18), min: inch(12), max: inch(30), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Height', default: inch(34), min: inch(16), max: inch(60), tier: 'basic' },
    { kind: 'count', key: 'drawerCount', label: 'Drawers', default: 4, min: 1, max: 8, tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'walnut', tier: 'basic' },
    { kind: 'boolean', key: 'graduated', label: 'Graduated heights', default: true, tier: 'advanced' },
    { kind: 'enum', key: 'caseJoinery', label: 'Case joinery', default: 'half-blind-dovetail', tier: 'advanced',
      options: [
        { value: 'half-blind-dovetail', label: 'Half-blind dovetail' },
        { value: 'through-dovetail', label: 'Through dovetail' },
        { value: 'box-joint', label: 'Box joint' },
        { value: 'butt', label: 'Butt / screwed' },
      ] },
    { kind: 'material', key: 'boxMaterial', label: 'Drawer box material', default: 'maple', tier: 'advanced' },
    { kind: 'length', key: 'thickness', label: 'Board thickness', default: inch(0.75), min: inch(0.5), max: inch(1.5), tier: 'advanced' },
    { kind: 'length', key: 'backThickness', label: 'Back thickness', default: inch(0.25), min: inch(0.125), max: inch(0.75), tier: 'advanced' },
    { kind: 'length', key: 'boxSideThickness', label: 'Box side thickness', default: inch(0.5), min: inch(0.375), max: inch(0.75), tier: 'advanced' },
    { kind: 'length', key: 'reveal', label: 'Front reveal', default: inch(0.125), min: inch(0.0625), max: inch(0.25), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const n = num(p, 'drawerCount');
    const t = num(p, 'thickness');
    const backT = num(p, 'backThickness');
    const sideT = num(p, 'boxSideThickness');
    const reveal = num(p, 'reveal');
    const graduated = p['graduated'] as boolean;
    const mat = str(p, 'material');
    const boxMat = str(p, 'boxMaterial');

    const innerW = W - 2 * t;
    const innerH = H - 2 * t;

    const parts: Part[] = [];
    const findings: Finding[] = [];

    // Case joinery: sides join the top and bottom with rendered corner fingers
    // (half-blind shows on the side faces only, stopped a lip short of the
    // clean cap face; through styles pierce the cap face). Cut lengths book
    // the stock the joint consumes.
    const caseJoinery = str(p, 'caseJoinery');
    const halfBlindCase = caseJoinery === 'half-blind-dovetail';
    const jointed = caseJoinery !== 'butt';
    const jointTag = halfBlindCase
      ? ' (half-blind DT)'
      : caseJoinery === 'through-dovetail'
        ? ' (dovetail)'
        : caseJoinery === 'box-joint'
          ? ' (box joint)'
          : '';
    const capLen = halfBlindCase
      ? innerW + 2 * (t - HALF_BLIND_LIP)
      : jointed
        ? innerW + 2 * t
        : innerW;
    const sideLen = halfBlindCase ? H - 2 * HALF_BLIND_LIP : H;
    const caseBoards = caseBoardPrims({ W, D, H, t, joinery: caseJoinery });
    for (const sx of [-1, 1]) {
      parts.push({
        id: `side-${sx}`,
        name: `Side${jointTag}`,
        material: mat,
        primitives: [caseBoards.side(sx)],
        cut: { length: sideLen, width: D, thickness: t },
      });
    }
    parts.push({
      id: 'bottom',
      name: `Bottom${jointTag}`,
      material: mat,
      primitives: caseBoards.cap(false),
      cut: { length: capLen, width: D, thickness: t },
    });
    parts.push({
      id: 'top',
      name: `Top${jointTag}`,
      material: mat,
      primitives: caseBoards.cap(true),
      cut: { length: capLen, width: D, thickness: t },
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

    // Split the interior into n openings with a reveal above, below, and between fronts.
    // Graduated: heights form an arithmetic series, shallowest on top, capped so the
    // top drawer never drops below the minimum useful opening.
    const available = innerH - (n + 1) * reveal;
    const equal = available / n;
    let step = 0;
    if (graduated && n > 1) {
      step = Math.min(equal * 0.25, Math.max(0, ((equal - MIN_OPENING) * 2) / (n - 1)));
    }
    const heights = Array.from({ length: n }, (_, i) => equal - step * ((n - 1) / 2 - i));

    const frontW = innerW - 2 * reveal;
    const boxW = innerW - 2 * SLIDE_CLEARANCE;
    const boxD = D - backT - t - BOX_DEPTH_CLEARANCE;
    const boxY = D / 2 - t - boxD / 2;

    let zCursor = H - t;
    for (let i = 0; i < n; i++) {
      const h = heights[i];
      zCursor -= reveal;
      const frontZ = zCursor - h / 2;
      zCursor -= h;

      parts.push({
        id: `drawer-front-${i}`,
        name: 'Drawer front',
        material: mat,
        primitives: [{ shape: 'box', size: [frontW, t, h], at: [0, D / 2 - t / 2, frontZ] }],
        cut: { length: frontW, width: h, thickness: t },
      });

      parts.push(
        ...drawerBoxParts({
          idPrefix: `drawer-${i}`,
          boxW,
          boxD,
          boxH: Math.max(h - BOX_HEIGHT_CLEARANCE, inch(0.75)),
          centerY: boxY,
          bottomZ: frontZ - h / 2 + inch(0.25),
          sideT,
          bottomT: inch(0.25),
          material: boxMat,
        }),
      );
    }

    if (equal < MIN_OPENING) {
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
    if (H > inch(48)) {
      findings.push({
        severity: 'warning',
        message: 'Tall chests should be anchored to the wall (anti-tip).',
      });
    }

    return { parts, findings };
  },
};
