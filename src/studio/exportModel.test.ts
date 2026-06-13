import { describe, expect, it } from 'vitest';
import { REGISTRY } from '../core/components/registry';
import type { ProjectDoc } from '../core/types';
import { buildExportGroup, exportModel } from './exportModel';

function docWith(componentId: string): ProjectDoc {
  return {
    schema: 1,
    name: 'Test',
    units: 'imperial',
    instances: [
      { id: 'a', componentId, name: componentId, position: [0, 0], rotationZ: 0, params: {} },
    ],
  };
}

describe('3D model export', () => {
  it('every component exports to non-empty STL and OBJ without throwing', () => {
    for (const id of Object.keys(REGISTRY)) {
      const doc = docWith(id);
      const stl = exportModel(doc, 'stl');
      expect(stl.size, `${id} STL`).toBeGreaterThan(84); // 80-byte header + count
      const obj = exportModel(doc, 'obj');
      expect(obj.size, `${id} OBJ`).toBeGreaterThan(0);
    }
  });

  it('bakes instance placement: a part mesh sits at the instance position', () => {
    const doc = docWith('drawer-box');
    doc.instances[0].position = [500, 300];
    const group = buildExportGroup(doc);
    expect(group.children).toHaveLength(1);
    const inst = group.children[0];
    expect(inst.position.x).toBeCloseTo(500, 5);
    expect(inst.position.y).toBeCloseTo(300, 5);
    // Every part became at least one named mesh.
    const meshNames = inst.children.map((c) => c.name);
    expect(meshNames.some((n) => n.startsWith('Side'))).toBe(true);
  });

  it('STL binary header reports the triangle count it actually wrote', () => {
    const doc = docWith('entry-bench');
    const buf = exportModel(doc, 'stl');
    // Read the blob synchronously isn't available; rebuild via the group to
    // count triangles and compare against the binary length formula.
    return buf.arrayBuffer().then((ab) => {
      const dv = new DataView(ab);
      const tris = dv.getUint32(80, true);
      expect(tris).toBeGreaterThan(0);
      expect(ab.byteLength).toBe(84 + tris * 50); // STL binary layout
    });
  });
});
