// Entryway bench, after the MEJA original: a thick solid seat on four
// square posts with front and back aprons under it, a boot shelf below
// notched around the legs so its edges run flush with the leg faces,
// front and back rails under the shelf edges, and a rail under each end
// of the shelf between the leg pairs.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part, Primitive } from '../types';
import { formatLength, inch } from '../units';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

const RAIL_HEIGHT = inch(2.25);

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
    { kind: 'length', key: 'seatThickness', label: 'Seat thickness', default: inch(0.8125), min: inch(0.625), max: inch(2), tier: 'advanced' },
    { kind: 'length', key: 'legThickness', label: 'Leg thickness', default: inch(2.5), min: inch(1.5), max: inch(3.5), tier: 'advanced' },
    { kind: 'length', key: 'apronThickness', label: 'Apron thickness', default: inch(0.75), min: inch(0.5), max: inch(1.25), tier: 'advanced' },
    { kind: 'boolean', key: 'mortiseTenon', label: 'Mortise & tenon aprons', default: true, tier: 'advanced' },
    { kind: 'length', key: 'tenonLength', label: 'Tenon length', default: inch(0.875), min: inch(0.375), max: inch(2), tier: 'advanced' },
    { kind: 'length', key: 'shelfThickness', label: 'Shelf thickness', default: inch(0.8125), min: inch(0.625), max: inch(1.5), tier: 'advanced' },
    { kind: 'length', key: 'endOverhang', label: 'Seat end overhang', default: inch(1), min: 0, max: inch(3), tier: 'advanced' },
    { kind: 'length', key: 'frontOverhang', label: 'Seat front overhang', default: inch(0.75), min: 0, max: inch(2), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const seatT = num(p, 'seatThickness');
    const legT = num(p, 'legThickness');
    const apronT = num(p, 'apronThickness');
    const shelfT = num(p, 'shelfThickness');
    const mt = p['mortiseTenon'] as boolean;
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

    // Seat edge to the scale drawing (shelftop.dwg): a quarter-round of
    // radius = the full stock thickness springs from the square bottom
    // arris and sweeps flush into the top face, all around the seat.
    parts.push({
      id: 'seat',
      name: 'Seat',
      material: mat,
      primitives: [
        {
          shape: 'roundedSlab',
          size: [W, D, seatT],
          at: [0, 0, H - seatT / 2],
          radius: inch(0.75),
          edge: seatT,
          edgeMode: 'top',
          corners: 'all',
        },
      ],
      cut: { length: W, width: D, thickness: seatT },
    });

    // Posts carry a 3/8" radius along each vertical corner; ends stay square.
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        parts.push({
          id: `leg-${sx}-${sy}`,
          name: 'Leg',
          material: mat,
          primitives: [
            {
              shape: 'roundedSlab',
              size: [legT, legT, legH],
              at: [sx * legX, sy * legY, legH / 2],
              radius: inch(0.375),
              corners: 'all',
              grain: 'z',
            },
          ],
          cut: { length: legH, width: legT, thickness: legT },
        });
      }
    }

    // Everything between the legs — boot shelf edges, shelf rails, and the
    // seat aprons — sets back half the leg thickness from the leg faces.
    const SB = legT / 2;
    const shelfW = envW - 2 * SB;
    const shelfD = envD - 2 * SB;

    // Boot shelf: one slab notched around the four posts, its edges inset
    // the half-leg setback. Modeled as the center board plus a corner
    // tongue beside each leg pair; the tongues keep the slab's grain.
    parts.push({
      id: 'shelf',
      name: 'Boot shelf',
      material: mat,
      primitives: [
        { shape: 'box', size: [envW - 2 * legT, shelfD, shelfT], at: [0, 0, shelfZ], grain: 'x' },
        {
          shape: 'box',
          size: [legT - SB, envD - 2 * legT, shelfT],
          at: [-(envW / 2 - (legT + SB) / 2), 0, shelfZ],
          grain: 'x',
        },
        {
          shape: 'box',
          size: [legT - SB, envD - 2 * legT, shelfT],
          at: [envW / 2 - (legT + SB) / 2, 0, shelfZ],
          grain: 'x',
        },
      ],
      cut: { length: shelfW, width: shelfD, thickness: shelfT },
    });

    // Aprons under the seat and rails under the shelf's front and back
    // edges, running between the legs at the half-leg setback; end rails
    // (toggleable) close the shelf frame between each leg pair.
    const span = envW - 2 * legT;
    const endSpan = envD - 2 * legT;
    const apronH = Math.min(RAIL_HEIGHT, legH - seatT);

    // Mortise & tenon: a centered tenon runs from each apron end into the
    // leg, shouldered on all four edges. It stays blind in the leg, so its
    // length is capped a hair short of the leg's far face. Tenons are part
    // of the apron piece (one board, cut long), hidden in the assembled
    // view and shown projecting in the exploded view.
    const tenL = mt ? Math.min(num(p, 'tenonLength'), legT - inch(0.125)) : 0;
    const tenTh = apronT / 3; // centered, shoulders apronT/3 each face
    const tenShoulderZ = inch(0.375);
    const tenH = Math.max(apronH - 2 * tenShoulderZ, apronH * 0.5);
    const tenonNote = mt
      ? `Mortise & tenon: ${formatLength(tenL, 'imperial')} tenons both ends`
      : undefined;

    for (const sy of [-1, 1]) {
      const apronY = sy * (envD / 2 - SB - apronT / 2);
      const apronZ = H - seatT - apronH / 2;
      const prims: Primitive[] = [
        { shape: 'box', size: [span, apronT, apronH], at: [0, apronY, apronZ] },
      ];
      if (mt) {
        for (const sx of [-1, 1]) {
          prims.push({
            shape: 'box',
            size: [tenL, tenTh, tenH],
            at: [sx * (span / 2 + tenL / 2), apronY, apronZ],
            grain: 'x',
          });
        }
      }
      parts.push({
        id: `apron-${sy}`,
        name: 'Apron',
        material: mat,
        primitives: prims,
        cut: { length: span + 2 * tenL, width: apronH, thickness: apronT, note: tenonNote },
      });
    }
    for (const sx of [-1, 1]) {
      const apronX = sx * (envW / 2 - SB - apronT / 2);
      const apronZ = H - seatT - apronH / 2;
      const prims: Primitive[] = [
        { shape: 'box', size: [apronT, endSpan, apronH], at: [apronX, 0, apronZ] },
      ];
      if (mt) {
        for (const sy of [-1, 1]) {
          prims.push({
            shape: 'box',
            size: [tenTh, tenL, tenH],
            at: [apronX, sy * (endSpan / 2 + tenL / 2), apronZ],
            grain: 'y',
          });
        }
      }
      parts.push({
        id: `apron-end-${sx}`,
        name: 'End apron',
        material: mat,
        primitives: prims,
        cut: { length: endSpan + 2 * tenL, width: apronH, thickness: apronT, note: tenonNote },
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
            size: [span, apronT, railH],
            at: [0, sy * (envD / 2 - SB - apronT / 2), shelfH - shelfT - railH / 2],
          },
        ],
        cut: { length: span, width: railH, thickness: apronT },
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
              size: [legT - SB, envD - 2 * legT, railH],
              at: [sx * (envW / 2 - (legT + SB) / 2), 0, shelfH - shelfT - railH / 2],
            },
          ],
          cut: { length: envD - 2 * legT, width: railH, thickness: legT - SB },
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
