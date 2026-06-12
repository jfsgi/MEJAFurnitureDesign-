// Tambour floating entryway console, after the MEJA white-oak original: a
// wall-hung case between two slabs with rounded front corners, the face
// wrapped in vertical reeds — across the front, around each corner radius,
// and down the ends to the wall. Hangs on a French cleat behind the back
// panel; internal partitions stiffen the span behind the corners.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { inch } from '../units';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

const CLEAT_H = inch(2.5);
const CLEAT_T = inch(0.75);

export const tambourConsole: ComponentDef = {
  id: 'tambour-console',
  name: 'Tambour floating console',
  category: 'Tables',
  description: 'Wall-hung reeded console: rounded slabs wrapped in tambour.',
  mount: 'wall',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(66), min: inch(36), max: inch(96), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(12), min: inch(8), max: inch(16), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Height', default: inch(11), min: inch(8), max: inch(16), tier: 'basic' },
    { kind: 'length', key: 'mountHeight', label: 'Mount height', default: inch(32), min: inch(20), max: inch(44), tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'white-oak', tier: 'basic' },
    { kind: 'length', key: 'cornerRadius', label: 'Corner radius', default: inch(3), min: inch(1.5), max: inch(5), tier: 'advanced' },
    { kind: 'length', key: 'edgeRadius', label: 'Edge roundover', default: inch(0.375), min: 0, max: inch(0.5), tier: 'advanced' },
    { kind: 'length', key: 'slatWidth', label: 'Reed width', default: inch(0.6875), min: inch(0.5), max: inch(1), tier: 'advanced' },
    { kind: 'length', key: 'slabThickness', label: 'Slab thickness', default: inch(1), min: inch(0.75), max: inch(1.5), tier: 'advanced' },
    { kind: 'length', key: 'slatInset', label: 'Reed inset', default: inch(0.125), min: 0, max: inch(0.5), tier: 'advanced' },
    { kind: 'length', key: 'backThickness', label: 'Back thickness', default: inch(0.5), min: inch(0.25), max: inch(0.75), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const mount = num(p, 'mountHeight'); // floor to the top surface
    const rc = num(p, 'cornerRadius');
    // The roundover can't exceed half the stock; leave a hair of flat wall.
    const edge = Math.min(num(p, 'edgeRadius'), num(p, 'slabThickness') / 2 - 0.5);
    const slatW = num(p, 'slatWidth');
    const t = num(p, 'slabThickness');
    const inset = num(p, 'slatInset');
    const backT = num(p, 'backThickness');
    const mat = str(p, 'material');

    const topZ = mount;
    const bottomZ = mount - H;
    const innerH = H - 2 * t;
    const reedZ = bottomZ + t + innerH / 2;
    const reedR = slatW / 2;
    // The reeds' outer tangent plane sits `inset` behind the slab edges; the
    // wrap follows the slab outline at that setback.
    const tangent = inset + reedR;

    const parts: Part[] = [];
    const findings: Finding[] = [];

    for (const [id, name, z] of [
      ['top', 'Top', topZ - t / 2],
      ['bottom', 'Bottom', bottomZ + t / 2],
    ] as const) {
      parts.push({
        id,
        name,
        material: mat,
        primitives: [{ shape: 'roundedSlab', size: [W, D, t], at: [0, 0, z], radius: rc, edge }],
        cut: { length: W, width: D, thickness: t },
      });
    }

    // Reed wrap: front run, corner arcs, end runs to the wall. Counts round
    // to fill each run with evenly spaced reeds at ~one reed width apart.
    let reedIndex = 0;
    const reed = (x: number, y: number) => {
      parts.push({
        id: `reed-${reedIndex++}`,
        name: 'Tambour reed',
        material: mat,
        primitives: [
          { shape: 'cylinder', radiusTop: reedR, radiusBottom: reedR, height: innerH, at: [x, y, reedZ] },
        ],
        cut: { length: innerH, width: slatW, thickness: slatW },
      });
    };
    const frontRun = W - 2 * rc;
    const nFront = Math.max(1, Math.round(frontRun / slatW));
    for (let i = 0; i < nFront; i++) {
      reed(-frontRun / 2 + (frontRun / nFront) * (i + 0.5), D / 2 - tangent);
    }
    const pathR = Math.max(rc - tangent, reedR);
    const arcLen = (pathR * Math.PI) / 2;
    const nArc = Math.max(1, Math.round(arcLen / slatW));
    for (const sx of [-1, 1]) {
      const cx = sx * (W / 2 - rc);
      const cy = D / 2 - rc;
      for (let i = 0; i < nArc; i++) {
        const phi = ((i + 0.5) / nArc) * (Math.PI / 2);
        reed(cx + sx * pathR * Math.sin(phi), cy + pathR * Math.cos(phi));
      }
    }
    const endRun = D - rc;
    const nEnd = Math.max(1, Math.round(endRun / slatW));
    for (const sx of [-1, 1]) {
      for (let i = 0; i < nEnd; i++) {
        reed(sx * (W / 2 - tangent), D / 2 - rc - (endRun / nEnd) * (i + 0.5));
      }
    }

    // Back panel between the slabs, partitions behind the corners, and the
    // French cleat that carries the piece.
    const backW = W - 2 * rc;
    parts.push({
      id: 'back',
      name: 'Back panel',
      material: mat,
      primitives: [
        { shape: 'box', size: [backW, backT, innerH], at: [0, -D / 2 + backT / 2, reedZ] },
      ],
      cut: { length: backW, width: innerH, thickness: backT },
    });
    const partD = D - backT - rc;
    for (const sx of [-1, 1]) {
      parts.push({
        id: `partition-${sx}`,
        name: 'Partition',
        material: mat,
        primitives: [
          {
            shape: 'box',
            size: [t, partD, innerH],
            at: [sx * (W / 2 - rc - t / 2), (backT - rc) / 2, reedZ],
          },
        ],
        cut: { length: innerH, width: partD, thickness: t },
      });
    }
    const cleatW = backW - inch(2);
    parts.push({
      id: 'cleat',
      name: 'French cleat',
      material: mat,
      primitives: [
        {
          shape: 'box',
          size: [cleatW, CLEAT_T, CLEAT_H],
          at: [0, -D / 2 + backT + CLEAT_T / 2, topZ - t - CLEAT_H / 2],
        },
      ],
      cut: { length: cleatW, width: CLEAT_H, thickness: CLEAT_T },
    });

    findings.push({
      severity: 'warning',
      message: 'Floating console: lag the French cleat into studs, never drywall alone.',
    });

    return { parts, findings };
  },
};
