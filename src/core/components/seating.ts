// Parametric seating: 4 legs + 4 aprons + a seat that is either a solid slab or evenly
// spaced slats. The slat count follows a `repeat` rule (docs/05 §4): it recomputes from
// the depth at a target slat width, the same way the bookcase re-spaces its shelves.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

const SLAT_TARGET_WIDTH = inch(2.75);
const SLAT_MIN_WIDTH = inch(1.25);

export interface SeatDefaults {
  width: number;
  depth: number;
  height: number;
  overhang?: number;
  legWidth?: number;
}

export function makeSeat(opts: {
  id: string;
  name: string;
  description: string;
  defaults: SeatDefaults;
  /** Benches warn above standard 17–19" seat height; stools are meant to go taller. */
  warnTallSeat?: boolean;
}): ComponentDef {
  const d = opts.defaults;
  return {
    id: opts.id,
    name: opts.name,
    category: 'Seating',
    description: opts.description,
    params: [
      { kind: 'length', key: 'width', label: 'Width', default: d.width, min: inch(10), max: inch(96), tier: 'basic' },
      { kind: 'length', key: 'depth', label: 'Depth', default: d.depth, min: inch(8), max: inch(24), tier: 'basic' },
      { kind: 'length', key: 'height', label: 'Height', default: d.height, min: inch(12), max: inch(36), tier: 'basic' },
      { kind: 'enum', key: 'seatStyle', label: 'Seat', default: 'solid', tier: 'basic',
        options: [
          { value: 'solid', label: 'Solid slab' },
          { value: 'slats', label: 'Slats' },
        ] },
      { kind: 'material', key: 'material', label: 'Material', default: 'white-oak', tier: 'basic' },
      { kind: 'length', key: 'seatThickness', label: 'Seat thickness', default: inch(1.25), min: inch(0.75), max: inch(2.5), tier: 'advanced' },
      { kind: 'length', key: 'overhang', label: 'Seat overhang', default: d.overhang ?? inch(1.5), min: 0, max: inch(6), tier: 'advanced' },
      { kind: 'length', key: 'legWidth', label: 'Leg width', default: d.legWidth ?? inch(1.75), min: inch(1), max: inch(4), tier: 'advanced' },
      { kind: 'length', key: 'legFoot', label: 'Leg foot width', default: inch(1.125), min: inch(0.375), max: inch(4), tier: 'advanced' },
      { kind: 'enum', key: 'taper', label: 'Leg taper', default: 'two', tier: 'advanced',
        options: [
          { value: 'two', label: '2-side' },
          { value: 'four', label: '4-side' },
          { value: 'none', label: 'None' },
        ] },
      { kind: 'length', key: 'apronHeight', label: 'Apron height', default: inch(3.5), min: inch(2), max: inch(6), tier: 'advanced' },
      { kind: 'length', key: 'apronThickness', label: 'Apron thickness', default: inch(0.875), min: inch(0.5), max: inch(1.5), tier: 'advanced' },
      { kind: 'length', key: 'apronInset', label: 'Apron setback', default: inch(0.25), min: 0, max: inch(1), tier: 'advanced' },
      { kind: 'length', key: 'slatGap', label: 'Slat gap', default: inch(0.375), min: inch(0.125), max: inch(1), tier: 'advanced' },
    ],
    generate(p): GeneratedModel {
      const W = num(p, 'width');
      const D = num(p, 'depth');
      const H = num(p, 'height');
      const seatT = num(p, 'seatThickness');
      const overhang = num(p, 'overhang');
      const legW = num(p, 'legWidth');
      const foot = Math.min(num(p, 'legFoot'), legW);
      const taper = str(p, 'taper');
      const apronH = Math.min(num(p, 'apronHeight'), H - seatT - inch(2));
      const apronT = num(p, 'apronThickness');
      const inset = num(p, 'apronInset');
      const gap = num(p, 'slatGap');
      const mat = str(p, 'material');

      const legH = H - seatT;
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
              align: taper === 'four' ? [0, 0] : [sx, sy],
            });
          }
          parts.push({
            id: `leg-${sx}-${sy}`,
            name: 'Leg',
            material: mat,
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
          material: mat,
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
          material: mat,
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

      if (str(p, 'seatStyle') === 'slats') {
        // Repeat rule: count from depth at the target slat width, then split the depth
        // evenly; drop slats rather than let them get narrower than the minimum.
        let count = Math.max(2, Math.round(D / SLAT_TARGET_WIDTH));
        let slatW = (D - (count - 1) * gap) / count;
        while (count > 2 && slatW < SLAT_MIN_WIDTH) {
          count--;
          slatW = (D - (count - 1) * gap) / count;
        }
        for (let i = 0; i < count; i++) {
          parts.push({
            id: `slat-${i}`,
            name: 'Seat slat',
            material: mat,
            primitives: [
              {
                shape: 'box',
                size: [W, slatW, seatT],
                at: [0, -D / 2 + slatW / 2 + i * (slatW + gap), legH + seatT / 2],
              },
            ],
            cut: { length: W, width: slatW, thickness: seatT },
          });
        }
      } else {
        parts.push({
          id: 'seat',
          name: 'Seat',
          material: mat,
          primitives: [{ shape: 'box', size: [W, D, seatT], at: [0, 0, legH + seatT / 2] }],
          cut: { length: W, width: D, thickness: seatT },
        });
      }

      if (longLen > inch(60)) {
        findings.push({
          severity: 'warning',
          message: `The aprons span ${formatLength(longLen, 'imperial')}. Benches over 60" between legs should get a center leg or stretcher.`,
        });
      }
      if (opts.warnTallSeat && H > inch(20)) {
        findings.push({
          severity: 'warning',
          message: 'Seat height is above the standard 17–19" — fine for a counter bench, tall for dining.',
        });
      }

      return { parts, findings };
    },
  };
}

export const bench = makeSeat({
  id: 'bench',
  name: 'Bench',
  description: 'Four-leg bench with a solid or slatted seat.',
  defaults: { width: inch(48), depth: inch(14), height: inch(18) },
  warnTallSeat: true,
});

export const stool = makeSeat({
  id: 'stool',
  name: 'Stool',
  description: 'Four-leg stool. Raise the height for counter or bar seating.',
  defaults: { width: inch(14), depth: inch(12), height: inch(18), overhang: inch(1), legWidth: inch(1.5) },
});
