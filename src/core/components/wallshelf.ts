// Parametric entryway wall shelf / coat rack, modeled on the MEJA catalog line:
// top shelf, two end legs, a hook rail carrying metal hooks, and a back panel that
// is either a tile frame, an art panel, or open. Hangs on the wall at mount height.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

const MIN_HOOK_SPACING = inch(4); // coats crowd below this center-to-center distance

export const wallShelf: ComponentDef = {
  id: 'wall-shelf',
  name: 'Wall shelf with hooks',
  category: 'Wall-mounted',
  description: 'Entryway shelf with coat hooks and a tile or art back panel.',
  mount: 'wall',
  params: [
    { kind: 'length', key: 'length', label: 'Length', default: inch(26), min: inch(20), max: inch(60), tier: 'basic' },
    { kind: 'length', key: 'legHeight', label: 'Leg height', default: inch(10), min: inch(4), max: inch(20), tier: 'basic' },
    { kind: 'enum', key: 'back', label: 'Back', default: 'tile', tier: 'basic',
      options: [
        { value: 'tile', label: 'Tile frame' },
        { value: 'art', label: 'Art panel' },
        { value: 'open', label: 'Open' },
      ] },
    { kind: 'count', key: 'hooks', label: 'Hooks', default: 3, min: 0, max: 8, tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'white-oak', tier: 'basic' },
    { kind: 'boolean', key: 'cubby', label: 'Cubbies under the shelf', default: false, tier: 'advanced' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(5), min: inch(3), max: inch(10), tier: 'advanced' },
    { kind: 'length', key: 'mountHeight', label: 'Mount height', default: inch(66), min: inch(36), max: inch(84), tier: 'advanced' },
    { kind: 'length', key: 'thickness', label: 'Board thickness', default: inch(0.75), min: inch(0.5), max: inch(1), tier: 'advanced' },
    { kind: 'length', key: 'backThickness', label: 'Back thickness', default: inch(0.25), min: inch(0.125), max: inch(0.5), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const L = num(p, 'length');
    const D = num(p, 'depth');
    const legH = num(p, 'legHeight');
    const mount = num(p, 'mountHeight'); // floor to the top surface of the shelf
    const t = num(p, 'thickness');
    const backT = num(p, 'backThickness');
    const back = str(p, 'back');
    const hooks = num(p, 'hooks');
    const mat = str(p, 'material');

    const innerL = L - 2 * t;
    const bottomZ = mount - t - legH;

    const parts: Part[] = [];
    const findings: Finding[] = [];

    parts.push({
      id: 'top',
      name: 'Top',
      material: mat,
      primitives: [{ shape: 'box', size: [L, D, t], at: [0, 0, mount - t / 2] }],
      cut: { length: L, width: D, thickness: t },
    });
    for (const sx of [-1, 1]) {
      parts.push({
        id: `leg-${sx}`,
        name: 'Leg',
        material: mat,
        primitives: [
          { shape: 'box', size: [t, D, legH], at: [sx * (L / 2 - t / 2), 0, mount - t - legH / 2] },
        ],
        cut: { length: legH, width: D, thickness: t },
      });
    }

    // Back panel fills the frame between the legs; the wall side is −Y.
    if (back !== 'open') {
      parts.push({
        id: 'back',
        name: back === 'tile' ? 'Tile back frame' : 'Art back panel',
        material: mat,
        primitives: [
          { shape: 'box', size: [innerL, backT, legH], at: [0, -(D / 2 - backT / 2), mount - t - legH / 2] },
        ],
        cut: { length: innerL, width: legH, thickness: backT },
      });
    }

    // Cubby row under the top shelf: a floor board plus two dividers splitting the
    // bay into three openings, square-ish like the production tile-shelf variant.
    const hasCubby = p['cubby'] as boolean;
    const cubbyH = hasCubby ? Math.min(D, legH - inch(2)) : 0;
    if (hasCubby) {
      const bayD = D - (back !== 'open' ? backT : 0);
      const bayY = (back !== 'open' ? backT : 0) / 2;
      const floorZ = mount - t - cubbyH;
      parts.push({
        id: 'cubby-floor',
        name: 'Cubby floor',
        material: mat,
        primitives: [{ shape: 'box', size: [innerL, bayD, t], at: [0, bayY, floorZ - t / 2] }],
        cut: { length: innerL, width: bayD, thickness: t },
      });
      for (const sx of [-1, 1]) {
        parts.push({
          id: `cubby-divider-${sx}`,
          name: 'Cubby divider',
          material: mat,
          primitives: [
            { shape: 'box', size: [t, bayD, cubbyH], at: [sx * (innerL / 6), bayY, floorZ + cubbyH / 2] },
          ],
          cut: { length: cubbyH, width: bayD, thickness: t },
        });
      }
    }

    // Hook rail sits in front of the back panel along the bottom of the frame,
    // never reaching up into the cubby row.
    const railBackY = -D / 2 + (back !== 'open' ? backT : 0);
    const railH = Math.max(
      inch(1.5),
      Math.min(D, legH - (hasCubby ? cubbyH + t : 0)),
    );
    parts.push({
      id: 'rail',
      name: 'Hook rail',
      material: mat,
      primitives: [
        { shape: 'box', size: [innerL, t, railH], at: [0, railBackY + t / 2, bottomZ + railH / 2] },
      ],
      cut: { length: innerL, width: railH, thickness: t },
    });

    // Black metal hooks, evenly spaced along the rail: plate + arm + upturned tip.
    const railFaceY = railBackY + t;
    const plateH = Math.min(inch(4), railH - inch(0.5));
    const plateZ = bottomZ + railH / 2;
    for (let i = 0; i < hooks; i++) {
      const x = -innerL / 2 + (innerL * (i + 0.5)) / hooks;
      const armZ = plateZ - plateH / 2 + inch(0.375);
      parts.push({
        id: `hook-${i}`,
        name: 'Hook',
        material: 'steel-black',
        primitives: [
          { shape: 'box', size: [inch(1), inch(0.25), plateH], at: [x, railFaceY + inch(0.125), plateZ] },
          { shape: 'box', size: [inch(0.75), inch(2.25), inch(0.75)], at: [x, railFaceY + inch(0.25) + inch(1.125), armZ] },
          { shape: 'box', size: [inch(0.75), inch(0.75), inch(1.5)], at: [x, railFaceY + inch(0.25) + inch(2.25) - inch(0.375), armZ + inch(0.75)] },
        ],
        cut: { length: inch(4), width: inch(2.5), thickness: inch(0.75) },
      });
    }

    if (hooks > 0 && innerL / hooks < MIN_HOOK_SPACING) {
      findings.push({
        severity: 'warning',
        message: `${hooks} hooks on a ${formatLength(L, 'imperial')} shelf land closer than ${formatLength(MIN_HOOK_SPACING, 'imperial')} apart — coats will crowd.`,
      });
    }

    return { parts, findings };
  },
};
