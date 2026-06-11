// Parametric tiered display stand, from the shop drawing: vertical back legs,
// raked front legs, and shelves that deepen toward the floor (14" at the top of
// the 20" base in the reference). Each shelf carries a front rail beneath it.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';
import { maxShelfSpan } from '../materials';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

const RAIL_HEIGHT = inch(1.25);

export const displayStand: ComponentDef = {
  id: 'display-stand',
  name: 'Tiered stand',
  category: 'Storage',
  description: 'Display stand with raked front legs; shelves deepen toward the floor.',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(36), min: inch(18), max: inch(48), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(20), min: inch(12), max: inch(30), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Height', default: inch(38), min: inch(24), max: inch(60), tier: 'basic' },
    { kind: 'count', key: 'shelfCount', label: 'Shelves', default: 4, min: 2, max: 6, tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'white-oak', tier: 'basic' },
    { kind: 'length', key: 'topDepth', label: 'Top shelf depth', default: inch(14), min: inch(8), max: inch(24), tier: 'advanced' },
    { kind: 'length', key: 'legWidth', label: 'Leg width', default: inch(1.5), min: inch(1), max: inch(2.5), tier: 'advanced' },
    { kind: 'length', key: 'thickness', label: 'Shelf thickness', default: inch(0.75), min: inch(0.5), max: inch(1), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const n = num(p, 'shelfCount');
    const topD = Math.min(num(p, 'topDepth'), D - inch(2));
    const legW = num(p, 'legWidth');
    const t = num(p, 'thickness');
    const mat = str(p, 'material');

    const innerW = W - 2 * legW;
    const backY = -D / 2;

    const parts: Part[] = [];
    const findings: Finding[] = [];

    for (const sx of [-1, 1]) {
      parts.push({
        id: `leg-back-${sx}`,
        name: 'Leg (back)',
        material: mat,
        primitives: [
          { shape: 'box', size: [legW, legW, H], at: [sx * (W / 2 - legW / 2), backY + legW / 2, H / 2] },
        ],
        cut: { length: H, width: legW, thickness: legW },
      });
    }

    // Raked front legs: tilted about the width axis so the top lands at the top
    // shelf's front edge and the foot at the full base depth. The length is chosen
    // so the rotated box spans exactly floor to top.
    const rake = Math.atan2(D - topD, H);
    const legL = (H - legW * Math.sin(rake)) / Math.cos(rake);
    const topAxisY = backY + topD - legW / 2;
    for (const sx of [-1, 1]) {
      parts.push({
        id: `leg-front-${sx}`,
        name: 'Leg (raked)',
        material: mat,
        primitives: [
          {
            shape: 'box',
            size: [legW, legW, legL],
            at: [sx * (W / 2 - legW / 2), topAxisY + (legL / 2) * Math.sin(rake), H / 2],
            tiltX: rake,
          },
        ],
        cut: { length: legL, width: legW, thickness: legW },
      });
    }

    // Shelves from the top down, each deeper than the one above, following the rake.
    const spacing = H / n;
    for (let i = 0; i < n; i++) {
      const z = H - i * spacing;
      const depth = topD - legW + ((D - topD) * i) / n;
      parts.push({
        id: `shelf-${i}`,
        name: 'Shelf',
        material: mat,
        primitives: [
          { shape: 'box', size: [innerW, depth, t], at: [0, backY + legW + depth / 2, z - t / 2] },
        ],
        cut: { length: innerW, width: depth, thickness: t },
      });
      parts.push({
        id: `rail-${i}`,
        name: 'Shelf rail',
        material: mat,
        primitives: [
          {
            shape: 'box',
            size: [innerW, t, RAIL_HEIGHT],
            at: [0, backY + legW + depth - t / 2, z - t - RAIL_HEIGHT / 2],
          },
        ],
        cut: { length: innerW, width: RAIL_HEIGHT, thickness: t },
      });
    }

    if (innerW > maxShelfSpan(t)) {
      findings.push({
        severity: 'warning',
        message: `Shelves span ${formatLength(innerW, 'imperial')} at ${formatLength(t, 'imperial')} thick and may sag. Thicken the shelves or reduce the width.`,
      });
    }
    if (H > inch(48)) {
      findings.push({
        severity: 'warning',
        message: 'Tall stands should be anchored to the wall (anti-tip).',
      });
    }

    return { parts, findings };
  },
};
