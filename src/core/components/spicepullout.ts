// Base-cabinet pull-out spice rack, after MEJA's narrow filler pull-out
// (El Compa Ruffles style): four corner posts carry a stack of shelves,
// solid front and back panels close the pull-direction ends, and each shelf
// is fenced on its long sides by round dowel galley rails so the jars ride
// out of the cabinet without spilling. The unit rolls out on side-mount or
// undermount slides; it's modeled standing on the floor.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part } from '../types';
import { formatLength, inch } from '../units';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;
const int = (p: ParamValues, k: string): number => Math.round(p[k] as number);

export const spicePullout: ComponentDef = {
  id: 'spice-pullout',
  name: 'Spice rack pull-out',
  category: 'Storage',
  description: 'Narrow base-cabinet pull-out: stacked shelves fenced by dowel rails.',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(6), min: inch(3), max: inch(12), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(21), min: inch(12), max: inch(24), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Height', default: inch(24), min: inch(12), max: inch(36), tier: 'basic' },
    { kind: 'count', key: 'tiers', label: 'Shelves', default: 3, min: 2, max: 6, tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'maple', tier: 'basic' },
    { kind: 'enum', key: 'slideType', label: 'Slides', default: 'side-mount', tier: 'basic',
      options: [
        { value: 'side-mount', label: 'Side-mount' },
        { value: 'undermount', label: 'Undermount' },
      ] },
    { kind: 'length', key: 'postSize', label: 'Corner post', default: inch(0.75), min: inch(0.5), max: inch(1.25), tier: 'advanced' },
    { kind: 'length', key: 'shelfThickness', label: 'Shelf thickness', default: inch(0.5), min: inch(0.25), max: inch(0.75), tier: 'advanced' },
    { kind: 'length', key: 'railDiameter', label: 'Rail dowel Ø', default: inch(0.375), min: inch(0.25), max: inch(0.625), tier: 'advanced' },
    { kind: 'count', key: 'railRows', label: 'Rails per shelf side', default: 2, min: 1, max: 3, tier: 'advanced' },
    { kind: 'material', key: 'shelfMaterial', label: 'Shelf material', default: 'baltic-birch', tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const tiers = int(p, 'tiers');
    const pt = num(p, 'postSize');
    const st = num(p, 'shelfThickness');
    const rd = num(p, 'railDiameter');
    const rr = int(p, 'railRows');
    const mat = str(p, 'material');
    const shelfMat = str(p, 'shelfMaterial');
    const slide = str(p, 'slideType');

    const postX = W / 2 - pt / 2;
    const postY = D / 2 - pt / 2;
    const innerW = W - 2 * pt; // shelf width, captured between the posts
    const innerD = D - 2 * pt;
    const railLen = D - pt; // dowel runs post-center to post-center

    const parts: Part[] = [];
    const findings: Finding[] = [];

    // Four corner posts, full height, grain running vertically.
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        parts.push({
          id: `post-${sx}-${sy}`,
          name: 'Corner post',
          material: mat,
          primitives: [{ shape: 'box', size: [pt, pt, H], at: [sx * postX, sy * postY, H / 2], grain: 'z' }],
          cut: { length: H, width: pt, thickness: pt },
        });
      }
    }

    // Shelves stacked evenly, the lowest resting on the floor; each one is
    // captured between the four posts.
    const S = (H - st) / tiers; // shelf-to-shelf rise
    const shelfZs: number[] = [];
    for (let i = 0; i < tiers; i++) {
      const z = st / 2 + i * S;
      shelfZs.push(z);
      parts.push({
        id: `shelf-${i}`,
        name: i === 0 ? 'Bottom shelf' : 'Shelf',
        material: shelfMat,
        primitives: [{ shape: 'box', size: [innerW, innerD, st], at: [0, 0, z] }],
        cut: {
          length: innerD,
          width: innerW,
          thickness: st,
          note: i === 0 ? `${slide === 'undermount' ? 'Undermount' : 'Side-mount'} slide base` : undefined,
        },
      });
    }

    // Solid panels close the front and back (the pull-direction ends),
    // flush with the posts and spanning the full height.
    for (const sy of [-1, 1]) {
      parts.push({
        id: sy > 0 ? 'front-panel' : 'back-panel',
        name: sy > 0 ? 'Front panel' : 'Back panel',
        material: mat,
        primitives: [{ shape: 'box', size: [innerW, st, H], at: [0, sy * (D / 2 - st / 2), H / 2] }],
        cut: { length: H, width: innerW, thickness: st },
      });
    }

    // Galley rails: round dowels along the depth on both long sides, stacked
    // above each shelf to fence the jars in, plus a tie rail across the top.
    const fenceH = Math.min(S * 0.7, inch(3.5));
    const dowelNote = `Ø${formatLength(rd, 'imperial')} dowel`;
    const railPart = (id: string, x: number, z: number): Part => ({
      id,
      name: 'Galley rail',
      material: mat,
      primitives: [{ shape: 'cylinder', radiusTop: rd / 2, radiusBottom: rd / 2, height: railLen, at: [x, 0, z], axis: 'y' }],
      cut: { length: railLen, width: rd, thickness: rd, note: dowelNote },
    });
    for (let i = 0; i < tiers; i++) {
      const top = shelfZs[i] + st / 2;
      for (const sx of [-1, 1]) {
        for (let k = 0; k < rr; k++) {
          parts.push(railPart(`rail-${i}-${sx}-${k}`, sx * postX, top + (fenceH * (k + 1)) / rr));
        }
      }
    }
    for (const sx of [-1, 1]) {
      parts.push(railPart(`top-rail-${sx}`, sx * postX, H - rd));
    }

    if (S - st < inch(3)) {
      findings.push({
        severity: 'warning',
        message: `Shelves clear only ${formatLength(S - st, 'imperial')} — tall spice jars won't fit. Use fewer shelves or a taller rack.`,
      });
    }
    if (innerW < inch(2.5)) {
      findings.push({
        severity: 'warning',
        message: `Only ${formatLength(innerW, 'imperial')} between the posts — too narrow for most jars. Widen the rack or use thinner posts.`,
      });
    }

    return { parts, findings };
  },
};
