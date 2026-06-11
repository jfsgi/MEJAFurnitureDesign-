// Parametric table assembly: 4 legs + 4 aprons + top.
// Demonstrates the scaling rules from docs/05: leg cross-section and board thicknesses are
// `fixed`, apron lengths and the top `stretch` with W/D, legs reposition from W/D/H.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

export interface TableDefaults {
  width: number;
  depth: number;
  height: number;
  legWidth?: number;
  overhang?: number;
  taper?: 'two' | 'four' | 'none';
}

export function makeTable(opts: {
  id: string;
  name: string;
  description: string;
  defaults: TableDefaults;
}): ComponentDef {
  const d = opts.defaults;
  return {
    id: opts.id,
    name: opts.name,
    category: 'Tables',
    description: opts.description,
    params: [
      { kind: 'length', key: 'width', label: 'Width', default: d.width, min: inch(12), max: inch(144), tier: 'basic' },
      { kind: 'length', key: 'depth', label: 'Depth', default: d.depth, min: inch(10), max: inch(60), tier: 'basic' },
      { kind: 'length', key: 'height', label: 'Height', default: d.height, min: inch(12), max: inch(42), tier: 'basic' },
      { kind: 'material', key: 'topMaterial', label: 'Top material', default: 'walnut', tier: 'basic' },
      { kind: 'material', key: 'baseMaterial', label: 'Base material', default: 'walnut', tier: 'basic' },
      { kind: 'length', key: 'topThickness', label: 'Top thickness', default: inch(1), min: inch(0.5), max: inch(2.5), tier: 'advanced' },
      { kind: 'length', key: 'overhang', label: 'Top overhang', default: d.overhang ?? inch(1.5), min: 0, max: inch(8), tier: 'advanced' },
      { kind: 'length', key: 'legWidth', label: 'Leg width', default: d.legWidth ?? inch(2.25), min: inch(1), max: inch(5), tier: 'advanced' },
      { kind: 'length', key: 'legFoot', label: 'Leg foot width', default: inch(1.375), min: inch(0.375), max: inch(5), tier: 'advanced' },
      { kind: 'enum', key: 'taper', label: 'Leg taper', default: d.taper ?? 'two', tier: 'advanced',
        options: [
          { value: 'two', label: '2-side' },
          { value: 'four', label: '4-side' },
          { value: 'none', label: 'None' },
        ] },
      { kind: 'length', key: 'apronHeight', label: 'Apron height', default: inch(4), min: inch(2), max: inch(8), tier: 'advanced' },
      { kind: 'length', key: 'apronThickness', label: 'Apron thickness', default: inch(0.875), min: inch(0.5), max: inch(1.5), tier: 'advanced' },
      { kind: 'length', key: 'apronInset', label: 'Apron setback', default: inch(0.25), min: 0, max: inch(1), tier: 'advanced' },
    ],
    generate(p): GeneratedModel {
      const W = num(p, 'width');
      const D = num(p, 'depth');
      const H = num(p, 'height');
      const topT = num(p, 'topThickness');
      const overhang = num(p, 'overhang');
      const legW = num(p, 'legWidth');
      const foot = Math.min(num(p, 'legFoot'), legW);
      const taper = str(p, 'taper');
      const apronH = Math.min(num(p, 'apronHeight'), H - topT - inch(2));
      const apronT = num(p, 'apronThickness');
      const inset = num(p, 'apronInset');
      const topMat = str(p, 'topMaterial');
      const baseMat = str(p, 'baseMaterial');

      const legH = H - topT;
      const shoulder = Math.min(apronH + inch(1), legH);
      // Leg centers; clamped so legs never cross at extreme overhangs.
      const lx = Math.max(W / 2 - overhang - legW / 2, legW / 2 + 5);
      const ly = Math.max(D / 2 - overhang - legW / 2, legW / 2 + 5);

      const parts: Part[] = [];
      const findings: Finding[] = [];

      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const legPrims: Part['primitives'] = [];
          if (taper === 'none') {
            legPrims.push({ shape: 'box', size: [legW, legW, legH], at: [sx * lx, sy * ly, legH / 2] });
          } else {
            legPrims.push({
              shape: 'box',
              size: [legW, legW, shoulder],
              at: [sx * lx, sy * ly, legH - shoulder / 2],
            });
            legPrims.push({
              shape: 'taperedBox',
              top: [legW, legW],
              bottom: [foot, foot],
              height: legH - shoulder,
              at: [sx * lx, sy * ly, (legH - shoulder) / 2],
              // Two-side taper keeps the outer faces flush; four-side stays centered.
              align: taper === 'four' ? [0, 0] : [sx, sy],
            });
          }
          parts.push({
            id: `leg-${sx}-${sy}`,
            name: 'Leg',
            material: baseMat,
            primitives: legPrims,
            cut: { length: legH, width: legW, thickness: legW },
          });
        }
      }

      const apronZ = legH - apronH / 2;
      const longLen = 2 * lx - legW;
      const shortLen = 2 * ly - legW;
      for (const sy of [-1, 1]) {
        parts.push({
          id: `apron-long-${sy}`,
          name: 'Apron (long)',
          material: baseMat,
          primitives: [
            {
              shape: 'box',
              size: [longLen, apronT, apronH],
              at: [0, sy * (ly + legW / 2 - inset - apronT / 2), apronZ],
            },
          ],
          cut: { length: longLen, width: apronH, thickness: apronT },
        });
      }
      for (const sx of [-1, 1]) {
        parts.push({
          id: `apron-short-${sx}`,
          name: 'Apron (short)',
          material: baseMat,
          primitives: [
            {
              shape: 'box',
              size: [apronT, shortLen, apronH],
              at: [sx * (lx + legW / 2 - inset - apronT / 2), 0, apronZ],
            },
          ],
          cut: { length: shortLen, width: apronH, thickness: apronT },
        });
      }

      parts.push({
        id: 'top',
        name: 'Top',
        material: topMat,
        primitives: [{ shape: 'box', size: [W, D, topT], at: [0, 0, legH + topT / 2] }],
        cut: { length: W, width: D, thickness: topT },
      });

      if (longLen > inch(84)) {
        findings.push({
          severity: 'warning',
          message: `The long aprons span ${formatLength(longLen, 'imperial')}. Consider a center stretcher for spans over 84".`,
        });
      }
      if (overhang > Math.min(W, D) / 5) {
        findings.push({
          severity: 'warning',
          message: 'Large top overhang for this base — the table may tip when leaned on.',
        });
      }

      return { parts, findings };
    },
  };
}

export const diningTable = makeTable({
  id: 'dining-table',
  name: 'Dining table',
  description: 'Four tapered legs, aprons, and a solid top. The classic.',
  defaults: { width: inch(72), depth: inch(36), height: inch(30) },
});

export const coffeeTable = makeTable({
  id: 'coffee-table',
  name: 'Coffee table',
  description: 'Low table for the living room.',
  defaults: { width: inch(48), depth: inch(24), height: inch(18), overhang: inch(2), legWidth: inch(2) },
});

export const consoleTable = makeTable({
  id: 'console-table',
  name: 'Console table',
  description: 'Narrow hallway/entry table.',
  defaults: { width: inch(48), depth: inch(16), height: inch(32), legWidth: inch(1.75) },
});
