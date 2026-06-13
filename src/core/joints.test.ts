import { describe, expect, it } from 'vitest';
import type { BBox } from './evaluate';
import type { Part } from './types';
import { applyJoints, detectJoint, jointKey } from './joints';

const boxPart = (id: string, name: string, size: [number, number, number], at: [number, number, number]): Part => ({
  id,
  name,
  material: 'maple',
  primitives: [{ shape: 'box', size, at }],
  cut: { length: size[0], width: size[1], thickness: size[2] },
});

function bboxOf(p: Part): BBox | null {
  let box: BBox | null = null;
  for (const pr of p.primitives) {
    if (pr.shape !== 'box') continue;
    const min = [pr.at[0] - pr.size[0] / 2, pr.at[1] - pr.size[1] / 2, pr.at[2] - pr.size[2] / 2] as [number, number, number];
    const max = [pr.at[0] + pr.size[0] / 2, pr.at[1] + pr.size[1] / 2, pr.at[2] + pr.size[2] / 2] as [number, number, number];
    if (!box) box = { min: [...min], max: [...max] };
    else for (let i = 0; i < 3; i++) { box.min[i] = Math.min(box.min[i], min[i]); box.max[i] = Math.max(box.max[i], max[i]); }
  }
  return box;
}

// A 50×50×400 post and a rail running in +x whose end meets the post's face.
const post = boxPart('leg', 'Leg', [50, 50, 400], [0, 0, 200]);
const rail = boxPart('rail', 'Apron', [300, 40, 60], [175, 0, 350]);

describe('joinery engine', () => {
  it('classifies an end-to-face joint with the rail as the tenoned member', () => {
    const j = detectJoint(post, rail, bboxOf(post)!, bboxOf(rail)!);
    expect(j).not.toBeNull();
    expect(j!.kind).toBe('end-face');
    expect(j!.railId).toBe('rail');
    expect(j!.legId).toBe('leg');
    expect(j!.styles).toContain('mortise-tenon');
  });

  it('separated parts are not a joint', () => {
    const far = boxPart('far', 'Far', [50, 50, 50], [900, 0, 0]);
    expect(detectJoint(post, far, bboxOf(post)!, bboxOf(far)!)).toBeNull();
  });

  it('mortise & tenon adds a tenon to the rail and frames a mortise in the leg', () => {
    const joints = { [jointKey('leg', 'rail')]: 'mortise-tenon' as const };
    const out = applyJoints([post, rail], joints, bboxOf);
    const outRail = out.find((p) => p.id === 'rail')!;
    const outLeg = out.find((p) => p.id === 'leg')!;
    expect(outRail.primitives.length).toBe(2); // body + tenon
    // The leg is rebuilt as a back slab + frame pieces around the pocket.
    expect(outLeg.primitives.length).toBeGreaterThan(1);
    // The mortise leaves a void: no single prim spans the original full leg.
    const full = outLeg.primitives.every((pr) => pr.shape === 'box' && pr.size[0] * pr.size[1] * pr.size[2] < 50 * 50 * 400);
    expect(full).toBe(true);
  });

  it('butt clears the joint (no added geometry)', () => {
    const out = applyJoints([post, rail], { [jointKey('leg', 'rail')]: 'butt' as const }, bboxOf);
    expect(out.find((p) => p.id === 'rail')!.primitives.length).toBe(1);
    expect(out.find((p) => p.id === 'leg')!.primitives.length).toBe(1);
  });

  it('dowel adds dowels to the rail without cutting the leg', () => {
    const out = applyJoints([post, rail], { [jointKey('leg', 'rail')]: 'dowel' as const }, bboxOf);
    expect(out.find((p) => p.id === 'rail')!.primitives.length).toBe(3); // body + 2 dowels
    expect(out.find((p) => p.id === 'leg')!.primitives.length).toBe(1);
  });
});
