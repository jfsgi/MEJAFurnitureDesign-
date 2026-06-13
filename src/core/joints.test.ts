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

  it('mortise & tenon adds a tenon to the rail and a mortise to the leg', () => {
    const joints = { [jointKey('leg', 'rail')]: 'mortise-tenon' as const };
    const out = applyJoints([post, rail], joints, bboxOf);
    const outRail = out.find((p) => p.id === 'rail')!;
    const outLeg = out.find((p) => p.id === 'leg')!;
    expect(outRail.primitives.length).toBe(2); // body + tenon
    expect(outRail.primitives[1].shape).toBe('box');
    // The leg becomes a mortised post carrying one pocket on the rail's face.
    const post0 = outLeg.primitives.find((p) => p.shape === 'mortisedPost') as
      | { shape: string; mortises: { face: string }[] }
      | undefined;
    expect(post0).toBeDefined();
    expect(post0!.mortises.length).toBe(1);
    expect(post0!.mortises[0].face).toBe('x+'); // rail meets the post's +x face
  });

  it('two joints on one leg accumulate into the same mortised post', () => {
    const rail2 = boxPart('rail2', 'End apron', [40, 300, 60], [0, 175, 350]);
    const joints = {
      [jointKey('leg', 'rail')]: 'mortise-tenon' as const,
      [jointKey('leg', 'rail2')]: 'mortise-tenon' as const,
    };
    const out = applyJoints([post, rail, rail2], joints, bboxOf);
    const outLeg = out.find((p) => p.id === 'leg')!;
    const post0 = outLeg.primitives.find((p) => p.shape === 'mortisedPost') as
      | { mortises: { face: string }[] }
      | undefined;
    expect(post0).toBeDefined();
    expect(post0!.mortises.length).toBe(2); // one per rail, on perpendicular faces
  });

  it('butt clears the joint (no added geometry)', () => {
    const out = applyJoints([post, rail], { [jointKey('leg', 'rail')]: 'butt' as const }, bboxOf);
    expect(out.find((p) => p.id === 'rail')!.primitives.length).toBe(1);
    expect(out.find((p) => p.id === 'leg')!.primitives.length).toBe(1);
  });

  it('french dovetail gives the rail a flaring tongue and the leg a socket', () => {
    const out = applyJoints([post, rail], { [jointKey('leg', 'rail')]: 'french-dovetail' as const }, bboxOf);
    const tongue = out.find((p) => p.id === 'rail')!.primitives.find((p) => p.shape === 'taperedBox') as
      | { shape: string; top: [number, number]; bottom: [number, number] }
      | undefined;
    expect(tongue).toBeDefined();
    // The tongue is a dovetail: it flares in the thickness axis, so the two
    // ends differ in exactly one cross-section slot (and match in the other).
    const dt0 = Math.abs(tongue!.top[0] - tongue!.bottom[0]);
    const dt1 = Math.abs(tongue!.top[1] - tongue!.bottom[1]);
    expect(Math.max(dt0, dt1)).toBeGreaterThan(1); // flares
    expect(Math.min(dt0, dt1)).toBeCloseTo(0, 1); // constant in the wide axis
    const leg = out.find((p) => p.id === 'leg')!;
    const legPost = leg.primitives.find((p) => p.shape === 'mortisedPost') as
      | { mortises: { flare?: number }[] }
      | undefined;
    expect(legPost).toBeDefined();
    expect(legPost!.mortises[0].flare).toBeGreaterThan(0); // dovetail socket, not straight
  });

  it('dowel adds dowels to the rail without cutting the leg', () => {
    const out = applyJoints([post, rail], { [jointKey('leg', 'rail')]: 'dowel' as const }, bboxOf);
    expect(out.find((p) => p.id === 'rail')!.primitives.length).toBe(3); // body + 2 dowels
    expect(out.find((p) => p.id === 'leg')!.primitives.length).toBe(1);
  });
});
