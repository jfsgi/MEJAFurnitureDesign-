// Parametric angled spice rack, after the MEJA calculator: two wedge sides, a leaned
// shelf, and a back panel the jars rest against — four parts, wall-mounted. The wedge
// sides are back-flush tapered boxes; the shelf is the library's first X-tilted part.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { inch } from '../units';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

export const spiceRack: ComponentDef = {
  id: 'spice-rack',
  name: 'Spice rack',
  category: 'Wall-mounted',
  description: 'Angled wall rack: jars lean back on a tilted shelf.',
  mount: 'wall',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(18), min: inch(8), max: inch(48), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(4), min: inch(2.5), max: inch(8), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Back height', default: inch(6), min: inch(3), max: inch(12), tier: 'basic' },
    { kind: 'length', key: 'frontHeight', label: 'Front height', default: inch(3), min: inch(0.75), max: inch(8), tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'walnut', tier: 'basic' },
    { kind: 'length', key: 'mountHeight', label: 'Mount height', default: inch(54), min: inch(24), max: inch(84), tier: 'advanced' },
    { kind: 'length', key: 'thickness', label: 'Board thickness', default: inch(0.5), min: inch(0.25), max: inch(0.75), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const frontH = Math.min(num(p, 'frontHeight'), H - inch(0.5));
    const base = num(p, 'mountHeight'); // floor to the bottom of the rack
    const t = num(p, 'thickness');
    const mat = str(p, 'material');

    const innerW = W - 2 * t;

    const parts: Part[] = [];
    const findings: Finding[] = [];

    // Wedge sides: straight lower section, then a taper whose back face stays flush
    // while the front slopes from the front edge up to the back top corner.
    const wedgeH = H - frontH;
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 - t / 2);
      parts.push({
        id: `side-${sx}`,
        name: 'Side (wedge)',
        material: mat,
        primitives: [
          { shape: 'box', size: [t, D, frontH], at: [x, 0, base + frontH / 2] },
          {
            shape: 'taperedBox',
            top: [t, 1],
            bottom: [t, D],
            height: wedgeH,
            at: [x, -D / 2 + 0.5, base + frontH + wedgeH / 2],
            align: [0, -1],
          },
        ],
        cut: { length: H, width: D, thickness: t },
      });
    }

    parts.push({
      id: 'back',
      name: 'Back panel',
      material: mat,
      primitives: [
        { shape: 'box', size: [innerW, t, H], at: [0, -D / 2 + t / 2, base + H / 2] },
      ],
      cut: { length: innerW, width: H, thickness: t },
    });

    // Leaned shelf along the sides' sloped top edge: its top surface lies on the line
    // from the front corner to the back top, dropped half a thickness along the
    // surface normal and shortened to stay inside the case.
    const angle = Math.atan2(wedgeH, D);
    const shelfL = Math.hypot(D, wedgeH) - 2 * t;
    const midY = -(t / 2) * Math.sin(angle);
    const midZ = base + (frontH + H) / 2 - (t / 2) * Math.cos(angle);
    parts.push({
      id: 'shelf',
      name: 'Shelf (angled)',
      material: mat,
      primitives: [
        { shape: 'box', size: [innerW, shelfL, t], at: [0, midY, midZ], tiltX: -angle },
      ],
      cut: { length: innerW, width: shelfL, thickness: t },
    });

    if (innerW > inch(36)) {
      findings.push({
        severity: 'warning',
        message: 'Racks over 36" wide should get a center support under the shelf.',
      });
    }

    return { parts, findings };
  },
};
