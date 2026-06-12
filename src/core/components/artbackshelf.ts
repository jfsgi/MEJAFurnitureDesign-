// Entryway art-back wall shelf, after the MEJA walnut original: an eased
// overhanging shelf over a frame of proud pilaster stiles with stepped base
// blocks, a full-bleed printed art panel filling the field between them,
// and a hook rail along the bottom carrying the coat hooks. The art panel
// is its own material so the print reads against the wood frame.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

const MIN_HOOK_SPACING = inch(4);
const BASE_BLOCK_H = inch(3);
const BASE_BLOCK_STEP = inch(0.375);
const RAIL_RECESS = inch(0.25); // rail face behind the stile faces
const ART_T = inch(0.25);

export const artBackShelf: ComponentDef = {
  id: 'art-back-shelf',
  name: 'Art-back entry shelf',
  category: 'Wall-mounted',
  description: 'Coat shelf with a printed art panel framed between pilasters.',
  mount: 'wall',
  params: [
    { kind: 'length', key: 'length', label: 'Length', default: inch(34), min: inch(24), max: inch(60), tier: 'basic' },
    { kind: 'length', key: 'frameHeight', label: 'Frame height', default: inch(10), min: inch(7), max: inch(16), tier: 'basic' },
    { kind: 'count', key: 'hooks', label: 'Hooks', default: 4, min: 0, max: 8, tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'walnut', tier: 'basic' },
    { kind: 'material', key: 'artMaterial', label: 'Art panel', default: 'painted-white', tier: 'advanced' },
    { kind: 'length', key: 'depth', label: 'Shelf depth', default: inch(6), min: inch(4), max: inch(10), tier: 'advanced' },
    { kind: 'length', key: 'mountHeight', label: 'Mount height', default: inch(66), min: inch(36), max: inch(84), tier: 'advanced' },
    { kind: 'length', key: 'overhang', label: 'Shelf overhang', default: inch(1), min: inch(0.5), max: inch(2), tier: 'advanced' },
    { kind: 'length', key: 'stileWidth', label: 'Stile width', default: inch(2.5), min: inch(1.5), max: inch(4), tier: 'advanced' },
    { kind: 'length', key: 'railHeight', label: 'Hook rail height', default: inch(2.75), min: inch(2), max: inch(4), tier: 'advanced' },
    { kind: 'length', key: 'frameDepth', label: 'Frame depth', default: inch(1.75), min: inch(1.25), max: inch(3), tier: 'advanced' },
    { kind: 'length', key: 'shelfThickness', label: 'Shelf thickness', default: inch(1), min: inch(0.75), max: inch(1.25), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const L = num(p, 'length');
    const D = num(p, 'depth');
    const frameH = num(p, 'frameHeight');
    const mount = num(p, 'mountHeight'); // floor to the top surface of the shelf
    const ov = num(p, 'overhang');
    const stileW = num(p, 'stileWidth');
    const railH = num(p, 'railHeight');
    const fd = num(p, 'frameDepth');
    const st = num(p, 'shelfThickness');
    const hooks = num(p, 'hooks');
    const mat = str(p, 'material');
    const artMat = str(p, 'artMaterial');

    // The frame hangs under the shelf, inset by the overhang at each end;
    // everything sits against the wall at −Y.
    const F = L - 2 * ov;
    const fieldW = F - 2 * stileW;
    const frameBottom = mount - st - frameH;
    const frameY = -D / 2 + fd / 2;

    const parts: Part[] = [];
    const findings: Finding[] = [];

    // Eased shelf: small corner radii and a light roundover all around.
    parts.push({
      id: 'shelf',
      name: 'Shelf',
      material: mat,
      primitives: [
        {
          shape: 'roundedSlab',
          size: [L, D, st],
          at: [0, 0, mount - st / 2],
          radius: inch(0.5),
          edge: inch(0.1875),
        },
      ],
      cut: { length: L, width: D, thickness: st },
    });

    // Pilaster stiles with a stepped base block at the foot.
    for (const sx of [-1, 1]) {
      parts.push({
        id: `stile-${sx}`,
        name: 'Stile',
        material: mat,
        primitives: [
          {
            shape: 'box',
            size: [stileW, fd, frameH],
            at: [sx * (F / 2 - stileW / 2), frameY, frameBottom + frameH / 2],
          },
          {
            shape: 'box',
            size: [stileW, fd + BASE_BLOCK_STEP, BASE_BLOCK_H],
            at: [
              sx * (F / 2 - stileW / 2),
              frameY + BASE_BLOCK_STEP / 2,
              frameBottom + BASE_BLOCK_H / 2,
            ],
          },
        ],
        cut: { length: frameH, width: fd, thickness: stileW },
      });
    }

    // Hook rail along the bottom of the field, its face shy of the stiles.
    const railT = fd - RAIL_RECESS;
    parts.push({
      id: 'rail',
      name: 'Hook rail',
      material: mat,
      primitives: [
        {
          shape: 'box',
          size: [fieldW, railT, railH],
          at: [0, -D / 2 + railT / 2, frameBottom + railH / 2],
        },
      ],
      cut: { length: fieldW, width: railH, thickness: railT },
    });

    // Full-bleed art panel filling the field above the rail.
    const artH = frameH - railH;
    parts.push({
      id: 'art',
      name: 'Art panel (printed)',
      material: artMat,
      primitives: [
        {
          shape: 'box',
          size: [fieldW, ART_T, artH],
          at: [0, -D / 2 + inch(0.5), frameBottom + railH + artH / 2],
        },
      ],
      cut: { length: fieldW, width: artH, thickness: ART_T },
    });

    // Black double hooks on square plates, evenly spaced along the rail.
    const railFaceY = -D / 2 + railT;
    const plateH = Math.min(inch(3), railH - inch(0.25));
    const plateZ = frameBottom + railH / 2;
    for (let i = 0; i < hooks; i++) {
      const x = -fieldW / 2 + (fieldW * (i + 0.5)) / hooks;
      const armZ = plateZ - plateH / 2 + inch(0.375);
      parts.push({
        id: `hook-${i}`,
        name: 'Hook',
        material: 'steel-black',
        primitives: [
          { shape: 'box', size: [inch(1.25), inch(0.25), plateH], at: [x, railFaceY + inch(0.125), plateZ] },
          { shape: 'box', size: [inch(0.75), inch(2.25), inch(0.75)], at: [x, railFaceY + inch(0.25) + inch(1.125), armZ] },
          { shape: 'box', size: [inch(0.75), inch(0.75), inch(1.5)], at: [x, railFaceY + inch(0.25) + inch(2.25) - inch(0.375), armZ + inch(0.75)] },
        ],
        cut: { length: inch(4), width: inch(2.5), thickness: inch(0.75) },
      });
    }

    if (hooks > 0 && fieldW / hooks < MIN_HOOK_SPACING) {
      findings.push({
        severity: 'warning',
        message: `${hooks} hooks across ${formatLength(fieldW, 'imperial')} land closer than ${formatLength(MIN_HOOK_SPACING, 'imperial')} apart — coats will crowd.`,
      });
    }
    if (artH < inch(4)) {
      findings.push({
        severity: 'warning',
        message: 'The art field is under 4" tall — raise the frame height or shrink the hook rail.',
      });
    }

    return { parts, findings };
  },
};
