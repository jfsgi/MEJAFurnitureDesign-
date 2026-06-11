// Single-part library components: legs, boards, panels, shelves.

import type { ComponentDef, GeneratedModel, ParamValues } from '../types';
import { inch } from '../units';
import { maxShelfSpan } from '../materials';
import { formatLength } from '../units';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

export const taperedLeg: ComponentDef = {
  id: 'tapered-leg',
  name: 'Tapered leg',
  category: 'Legs',
  description: 'Square leg with a straight shoulder and tapered lower section.',
  params: [
    { kind: 'length', key: 'height', label: 'Height', default: inch(29), min: inch(4), max: inch(60), tier: 'basic' },
    { kind: 'length', key: 'width', label: 'Width', default: inch(2.25), min: inch(0.75), max: inch(6), tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'walnut', tier: 'basic' },
    { kind: 'enum', key: 'taper', label: 'Taper', default: 'two', tier: 'advanced',
      options: [
        { value: 'two', label: '2-side' },
        { value: 'four', label: '4-side' },
      ] },
    { kind: 'length', key: 'footWidth', label: 'Foot width', default: inch(1.375), min: inch(0.375), max: inch(6), tier: 'advanced' },
    { kind: 'length', key: 'shoulder', label: 'Shoulder', default: inch(5), min: 0, max: inch(40), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const H = num(p, 'height');
    const W = num(p, 'width');
    const foot = Math.min(num(p, 'footWidth'), W);
    const shoulder = Math.min(num(p, 'shoulder'), H);
    const taper = str(p, 'taper');
    const align: [number, number] = taper === 'four' ? [0, 0] : [1, 1];
    return {
      parts: [
        {
          id: 'leg',
          name: 'Leg',
          material: str(p, 'material'),
          primitives: [
            { shape: 'box', size: [W, W, shoulder], at: [0, 0, H - shoulder / 2] },
            {
              shape: 'taperedBox',
              top: [W, W],
              bottom: [foot, taper === 'four' ? foot : foot],
              height: H - shoulder,
              at: [0, 0, (H - shoulder) / 2],
              align,
            },
          ],
          cut: { length: H, width: W, thickness: W },
        },
      ],
      findings: [],
    };
  },
};

export const straightLeg: ComponentDef = {
  id: 'straight-leg',
  name: 'Straight leg',
  category: 'Legs',
  description: 'Square-section leg.',
  params: [
    { kind: 'length', key: 'height', label: 'Height', default: inch(29), min: inch(4), max: inch(60), tier: 'basic' },
    { kind: 'length', key: 'width', label: 'Width', default: inch(2), min: inch(0.75), max: inch(6), tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'walnut', tier: 'basic' },
  ],
  generate(p): GeneratedModel {
    const H = num(p, 'height');
    const W = num(p, 'width');
    return {
      parts: [
        {
          id: 'leg',
          name: 'Leg',
          material: str(p, 'material'),
          primitives: [{ shape: 'box', size: [W, W, H], at: [0, 0, H / 2] }],
          cut: { length: H, width: W, thickness: W },
        },
      ],
      findings: [],
    };
  },
};

export const roundLeg: ComponentDef = {
  id: 'round-leg',
  name: 'Round leg',
  category: 'Legs',
  description: 'Turned round leg, optionally tapered toward the foot.',
  params: [
    { kind: 'length', key: 'height', label: 'Height', default: inch(29), min: inch(4), max: inch(60), tier: 'basic' },
    { kind: 'length', key: 'diameter', label: 'Diameter', default: inch(2), min: inch(0.75), max: inch(5), tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'walnut', tier: 'basic' },
    { kind: 'boolean', key: 'tapered', label: 'Tapered', default: true, tier: 'advanced' },
    { kind: 'length', key: 'footDiameter', label: 'Foot diameter', default: inch(1.25), min: inch(0.375), max: inch(5), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const H = num(p, 'height');
    const D = num(p, 'diameter');
    const foot = (p['tapered'] as boolean) ? Math.min(num(p, 'footDiameter'), D) : D;
    return {
      parts: [
        {
          id: 'leg',
          name: 'Leg (round)',
          material: str(p, 'material'),
          primitives: [
            { shape: 'cylinder', radiusTop: D / 2, radiusBottom: foot / 2, height: H, at: [0, 0, H / 2] },
          ],
          cut: { length: H, width: D, thickness: D },
        },
      ],
      findings: [],
    };
  },
};

export const board: ComponentDef = {
  id: 'board',
  name: 'Board',
  category: 'Boards & panels',
  description: 'Dimensioned lumber, lying flat. The general-purpose building block.',
  params: [
    { kind: 'length', key: 'length', label: 'Length', default: inch(36), min: inch(1), max: inch(192), tier: 'basic' },
    { kind: 'length', key: 'width', label: 'Width', default: inch(5.5), min: inch(0.5), max: inch(48), tier: 'basic' },
    { kind: 'length', key: 'thickness', label: 'Thickness', default: inch(0.75), min: inch(0.125), max: inch(4), tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'white-oak', tier: 'basic' },
  ],
  generate(p): GeneratedModel {
    const L = num(p, 'length');
    const W = num(p, 'width');
    const T = num(p, 'thickness');
    return {
      parts: [
        {
          id: 'board',
          name: 'Board',
          material: str(p, 'material'),
          primitives: [{ shape: 'box', size: [L, W, T], at: [0, 0, T / 2] }],
          cut: { length: L, width: W, thickness: T },
        },
      ],
      findings: [],
    };
  },
};

export const panel: ComponentDef = {
  id: 'panel',
  name: 'Panel',
  category: 'Boards & panels',
  description: 'Sheet-good panel, standing upright.',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(24), min: inch(2), max: inch(96), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Height', default: inch(30), min: inch(2), max: inch(96), tier: 'basic' },
    { kind: 'length', key: 'thickness', label: 'Thickness', default: inch(0.75), min: inch(0.125), max: inch(1.5), tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'maple', tier: 'basic' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const H = num(p, 'height');
    const T = num(p, 'thickness');
    return {
      parts: [
        {
          id: 'panel',
          name: 'Panel',
          material: str(p, 'material'),
          primitives: [{ shape: 'box', size: [W, T, H], at: [0, 0, H / 2] }],
          cut: { length: H, width: W, thickness: T },
        },
      ],
      findings: [],
    };
  },
};

export const shelf: ComponentDef = {
  id: 'shelf',
  name: 'Shelf',
  category: 'Boards & panels',
  description: 'Shelf board with a sag check for its span.',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(30), min: inch(4), max: inch(96), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(11.25), min: inch(3), max: inch(30), tier: 'basic' },
    { kind: 'length', key: 'thickness', label: 'Thickness', default: inch(0.75), min: inch(0.25), max: inch(2), tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'white-oak', tier: 'basic' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const T = num(p, 'thickness');
    const findings = [];
    if (W > maxShelfSpan(T)) {
      findings.push({
        severity: 'warning' as const,
        message: `A ${formatLength(W, 'imperial')} span may sag at ${formatLength(T, 'imperial')} thick. Thicken the shelf or add a support.`,
      });
    }
    return {
      parts: [
        {
          id: 'shelf',
          name: 'Shelf',
          material: str(p, 'material'),
          primitives: [{ shape: 'box', size: [W, D, T], at: [0, 0, T / 2] }],
          cut: { length: W, width: D, thickness: T },
        },
      ],
      findings,
    };
  },
};
