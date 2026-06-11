// Parametric cabinet: sides, captured top/bottom, inset back, inset door(s), and
// adjustable shelves. Works as a nightstand at small sizes and a pantry at large ones.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';
import { maxShelfSpan } from '../materials';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

/** Single doors wider than this sag on their hinges; suggest a pair instead. */
const MAX_SINGLE_DOOR = inch(22);

export const cabinet: ComponentDef = {
  id: 'cabinet',
  name: 'Cabinet',
  category: 'Storage',
  description: 'Closed cabinet with inset doors and adjustable shelves.',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(20), min: inch(10), max: inch(60), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(16), min: inch(8), max: inch(30), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Height', default: inch(24), min: inch(12), max: inch(84), tier: 'basic' },
    { kind: 'enum', key: 'doors', label: 'Doors', default: 'left', tier: 'basic',
      options: [
        { value: 'left', label: 'Single, hinge left' },
        { value: 'right', label: 'Single, hinge right' },
        { value: 'double', label: 'Double' },
      ] },
    { kind: 'material', key: 'material', label: 'Material', default: 'walnut', tier: 'basic' },
    { kind: 'count', key: 'shelfCount', label: 'Shelves', default: 1, min: 0, max: 5, tier: 'advanced' },
    { kind: 'length', key: 'thickness', label: 'Board thickness', default: inch(0.75), min: inch(0.5), max: inch(1.5), tier: 'advanced' },
    { kind: 'length', key: 'backThickness', label: 'Back thickness', default: inch(0.25), min: inch(0.125), max: inch(0.75), tier: 'advanced' },
    { kind: 'length', key: 'reveal', label: 'Door reveal', default: inch(0.125), min: inch(0.0625), max: inch(0.25), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const t = num(p, 'thickness');
    const backT = num(p, 'backThickness');
    const reveal = num(p, 'reveal');
    const doors = str(p, 'doors');
    const shelfCount = num(p, 'shelfCount');
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
    // Back, inset between the sides; the front of the case faces +Y.
    parts.push({
      id: 'back',
      name: 'Back panel',
      material: mat,
      primitives: [
        { shape: 'box', size: [innerW, backT, innerH], at: [0, -(D / 2 - backT / 2), H / 2] },
      ],
      cut: { length: innerH, width: innerW, thickness: backT },
    });

    // Inset door(s) fill the front opening minus the reveal on every edge.
    const doorH = innerH - 2 * reveal;
    const doorY = D / 2 - t / 2;
    if (doors === 'double') {
      const leafW = (innerW - 3 * reveal) / 2;
      for (const sx of [-1, 1]) {
        parts.push({
          id: `door-${sx}`,
          name: 'Door',
          material: mat,
          primitives: [
            {
              shape: 'box',
              size: [leafW, t, doorH],
              at: [sx * (innerW / 2 - reveal - leafW / 2), doorY, H / 2],
            },
          ],
          cut: { length: doorH, width: leafW, thickness: t },
        });
      }
    } else {
      const doorW = innerW - 2 * reveal;
      parts.push({
        id: 'door',
        name: 'Door',
        material: mat,
        primitives: [{ shape: 'box', size: [doorW, t, doorH], at: [0, doorY, H / 2] }],
        cut: { length: doorH, width: doorW, thickness: t },
      });
      if (doorW > MAX_SINGLE_DOOR) {
        findings.push({
          severity: 'warning',
          message: `A ${formatLength(doorW, 'imperial')} single door is heavy on its hinges. Use double doors over ${formatLength(MAX_SINGLE_DOOR, 'imperial')}.`,
        });
      }
    }

    // Shelves split the interior evenly, set behind the door with working clearance.
    const clearance = inch(0.125);
    const shelfD = D - backT - t - clearance;
    const spacing = innerH / (shelfCount + 1);
    for (let i = 0; i < shelfCount; i++) {
      parts.push({
        id: `shelf-${i}`,
        name: 'Shelf',
        material: mat,
        primitives: [
          {
            shape: 'box',
            size: [innerW, shelfD, t],
            at: [0, (backT - t - clearance) / 2, t + spacing * (i + 1)],
          },
        ],
        cut: { length: innerW, width: shelfD, thickness: t },
      });
    }

    if (shelfCount > 0 && innerW > maxShelfSpan(t)) {
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
