// Entryway bench, after the MEJA original: a thick solid seat on four
// square posts with front and back aprons under it, a boot shelf below
// notched around the legs so its edges run flush with the leg faces,
// front and back rails under the shelf edges, and a rail under each end
// of the shelf between the leg pairs.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

const RAIL_HEIGHT = inch(2.25);
const APRON_T = inch(1);
const SAG_SPAN = inch(54);

export const entryBench: ComponentDef = {
  id: 'entry-bench',
  name: 'Entryway bench',
  category: 'Seating',
  description: 'Solid-seat bench on square posts with a boot shelf below.',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(48), min: inch(30), max: inch(72), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(14), min: inch(10), max: inch(20), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Height', default: inch(18), min: inch(15), max: inch(20), tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'maple', tier: 'basic' },
    { kind: 'boolean', key: 'shelfRails', label: 'Rails under the shelf', default: true, tier: 'advanced' },
    { kind: 'length', key: 'shelfHeight', label: 'Shelf height', default: inch(5), min: inch(2.5), max: inch(10), tier: 'advanced' },
    { kind: 'length', key: 'seatThickness', label: 'Seat thickness', default: inch(1.5), min: inch(1), max: inch(2), tier: 'advanced' },
    { kind: 'length', key: 'legThickness', label: 'Leg thickness', default: inch(2.5), min: inch(1.5), max: inch(3.5), tier: 'advanced' },
    { kind: 'length', key: 'shelfThickness', label: 'Shelf thickness', default: inch(1), min: inch(0.75), max: inch(1.5), tier: 'advanced' },
    { kind: 'length', key: 'endOverhang', label: 'Seat end overhang', default: inch(1), min: 0, max: inch(3), tier: 'advanced' },
    { kind: 'length', key: 'frontOverhang', label: 'Seat front overhang', default: inch(0.75), min: 0, max: inch(2), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const seatT = num(p, 'seatThickness');
    const legT = num(p, 'legThickness');
    const shelfT = num(p, 'shelfThickness');
    const shelfH = num(p, 'shelfHeight');
    const ovEnd = num(p, 'endOverhang');
    const ovFront = num(p, 'frontOverhang');
    const mat = str(p, 'material');

    // The leg envelope: outer faces of the post frame, under the seat overhang.
    const envW = W - 2 * ovEnd;
    const envD = D - 2 * ovFront;
    const legX = envW / 2 - legT / 2;
    const legY = envD / 2 - legT / 2;
    const legH = H - seatT;
    const shelfZ = shelfH - shelfT / 2;

    const parts: Part[] = [];
    const findings: Finding[] = [];

    parts.push({
      id: 'seat',
      name: 'Seat',
      material: mat,
      primitives: [{ shape: 'box', size: [W, D, seatT], at: [0, 0, H - seatT / 2] }],
      cut: { length: W, width: D, thickness: seatT },
    });

    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        parts.push({
          id: `leg-${sx}-${sy}`,
          name: 'Leg',
          material: mat,
          primitives: [
            { shape: 'box', size: [legT, legT, legH], at: [sx * legX, sy * legY, legH / 2] },
          ],
          cut: { length: legH, width: legT, thickness: legT },
        });
      }
    }

    // Boot shelf: one slab notched around the four posts — its edges run
    // flush with the leg faces. Modeled as the center board plus a corner
    // tongue between each leg pair; the tongues keep the slab's grain.
    parts.push({
      id: 'shelf',
      name: 'Boot shelf',
      material: mat,
      primitives: [
        { shape: 'box', size: [envW - 2 * legT, envD, shelfT], at: [0, 0, shelfZ], grain: 'x' },
        {
          shape: 'box',
          size: [legT, envD - 2 * legT, shelfT],
          at: [-legX, 0, shelfZ],
          grain: 'x',
        },
        {
          shape: 'box',
          size: [legT, envD - 2 * legT, shelfT],
          at: [legX, 0, shelfZ],
          grain: 'x',
        },
      ],
      cut: { length: envW, width: envD, thickness: shelfT },
    });

    // Aprons under the seat and rails under the shelf's front and back
    // edges, running between the legs flush with their outer faces; end
    // rails (toggleable) close the shelf frame between each leg pair.
    const span = envW - 2 * legT;
    const apronH = Math.min(RAIL_HEIGHT, legH - seatT);
    for (const sy of [-1, 1]) {
      parts.push({
        id: `apron-${sy}`,
        name: 'Apron',
        material: mat,
        primitives: [
          {
            shape: 'box',
            size: [span, APRON_T, apronH],
            at: [0, sy * (envD / 2 - APRON_T / 2), H - seatT - apronH / 2],
          },
        ],
        cut: { length: span, width: apronH, thickness: APRON_T },
      });
    }
    const railH = Math.min(RAIL_HEIGHT, shelfH - shelfT);
    for (const sy of [-1, 1]) {
      parts.push({
        id: `shelf-rail-${sy}`,
        name: 'Shelf rail',
        material: mat,
        primitives: [
          {
            shape: 'box',
            size: [span, APRON_T, railH],
            at: [0, sy * (envD / 2 - APRON_T / 2), shelfH - shelfT - railH / 2],
          },
        ],
        cut: { length: span, width: railH, thickness: APRON_T },
      });
    }

    if (p['shelfRails'] as boolean) {
      for (const sx of [-1, 1]) {
        parts.push({
          id: `rail-${sx}`,
          name: 'Shelf end rail',
          material: mat,
          primitives: [
            {
              shape: 'box',
              size: [legT, envD - 2 * legT, railH],
              at: [sx * legX, 0, shelfH - shelfT - railH / 2],
            },
          ],
          cut: { length: envD - 2 * legT, width: railH, thickness: legT },
        });
      }
    }

    if (W > SAG_SPAN) {
      findings.push({
        severity: 'warning',
        message: `A ${formatLength(W, 'imperial')} seat span sags underfoot. Thicken the seat or add a center post.`,
      });
    }
    if (shelfH - shelfT < inch(1)) {
      findings.push({
        severity: 'warning',
        message: 'The boot shelf sits nearly on the floor — raise it for cleaning clearance.',
      });
    }

    return { parts, findings };
  },
};
