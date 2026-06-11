// Parametric bookcase: sides, captured top/bottom, inset back, and shelves that follow a
// `repeat` rule — shelf count recomputes from height and target spacing (docs/05 §4).

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';
import { maxShelfSpan } from '../materials';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

export const bookcase: ComponentDef = {
  id: 'bookcase',
  name: 'Bookcase',
  category: 'Storage',
  description: 'Open bookcase. Shelves re-space themselves as the height changes.',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(36), min: inch(12), max: inch(72), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(12), min: inch(6), max: inch(24), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Height', default: inch(72), min: inch(18), max: inch(96), tier: 'basic' },
    { kind: 'length', key: 'shelfSpacing', label: 'Shelf spacing', default: inch(12), min: inch(6), max: inch(24), tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'white-oak', tier: 'basic' },
    { kind: 'length', key: 'thickness', label: 'Board thickness', default: inch(0.75), min: inch(0.5), max: inch(1.5), tier: 'advanced' },
    { kind: 'length', key: 'backThickness', label: 'Back thickness', default: inch(0.25), min: inch(0.125), max: inch(0.75), tier: 'advanced' },
    { kind: 'length', key: 'shelfSetback', label: 'Shelf setback', default: inch(0.25), min: 0, max: inch(2), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const t = num(p, 'thickness');
    const backT = num(p, 'backThickness');
    const setback = num(p, 'shelfSetback');
    const spacing = num(p, 'shelfSpacing');
    const mat = str(p, 'material');

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
    // Back, inset between the sides; front of the case faces +Y.
    parts.push({
      id: 'back',
      name: 'Back panel',
      material: mat,
      primitives: [
        { shape: 'box', size: [innerW, backT, innerH], at: [0, -(D / 2 - backT / 2), H / 2] },
      ],
      cut: { length: innerH, width: innerW, thickness: backT },
    });

    // Repeat rule: choose the count nearest the target spacing, then distribute evenly.
    const shelfCount = Math.max(0, Math.round(innerH / spacing) - 1);
    const actualSpacing = innerH / (shelfCount + 1);
    const shelfD = D - backT - setback;
    for (let i = 0; i < shelfCount; i++) {
      parts.push({
        id: `shelf-${i}`,
        name: 'Shelf',
        material: mat,
        primitives: [
          {
            shape: 'box',
            size: [innerW, shelfD, t],
            at: [0, (backT - setback) / 2, t + actualSpacing * (i + 1)],
          },
        ],
        cut: { length: innerW, width: shelfD, thickness: t },
      });
    }

    if (innerW > maxShelfSpan(t)) {
      findings.push({
        severity: 'warning',
        message: `Shelves span ${formatLength(innerW, 'imperial')} at ${formatLength(t, 'imperial')} thick and may sag. Thicken the boards or reduce the width.`,
      });
    }
    if (H > inch(84)) {
      findings.push({
        severity: 'warning',
        message: 'Cases over 84" tall should be anchored to the wall (anti-tip).',
      });
    }

    return { parts, findings };
  },
};
