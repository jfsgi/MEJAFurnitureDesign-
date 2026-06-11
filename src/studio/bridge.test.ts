import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../core/materials';
import type { ProjectDoc } from '../core/types';
import { ENGINE_MATERIAL_MAP, buildStudioGroup, engineMaterialFor } from './bridge';
import type { MaterialLibrary } from './engine/materials/MaterialLibrary';

// The engine material ids available in the vendored library (v0.5.9 + paint-black).
const ENGINE_IDS = new Set([
  'oak', 'walnut', 'cherry', 'maple', 'redoak', 'mahogany', 'cedar',
  'paint-white', 'paint-forest', 'paint-black', 'steel', 'brass', 'linen',
]);

describe('studio bridge', () => {
  it('maps every design material onto a real engine material', () => {
    for (const mat of MATERIALS) {
      const engineId = engineMaterialFor(mat.id);
      expect(ENGINE_IDS.has(engineId), `${mat.id} → ${engineId}`).toBe(true);
    }
    for (const id of Object.values(ENGINE_MATERIAL_MAP)) {
      expect(ENGINE_IDS.has(id), id).toBe(true);
    }
  });

  it('builds an engine-ready group: meters, Y-up, named shadowed meshes', () => {
    const doc: ProjectDoc = {
      schema: 1,
      name: 'test',
      units: 'imperial',
      instances: [
        { id: 'i1', componentId: 'dining-table', name: 'Table', position: [0, 0], rotationZ: 0, params: {} },
        { id: 'i2', componentId: 'display-stand', name: 'Stand', position: [2000, 0], rotationZ: 0, params: {} },
      ],
    };
    // The bridge only calls materials.get(id); a recording stub keeps three.js
    // texture generation (canvas) out of the test environment.
    const requested: string[] = [];
    const materials = { get: (id: string) => (requested.push(id), { id }) } as unknown as MaterialLibrary;

    const group = buildStudioGroup(doc, materials);
    expect(group.scale.x).toBeCloseTo(0.001, 9);
    expect(group.rotation.x).toBeCloseTo(-Math.PI / 2, 9);
    expect(group.children).toHaveLength(2);

    let meshCount = 0;
    const names = new Set<string>();
    group.traverse((child) => {
      if ('isMesh' in child && (child as { isMesh?: boolean }).isMesh) {
        meshCount++;
        names.add(child.name);
        expect((child as { castShadow: boolean }).castShadow).toBe(true);
      }
    });
    expect(meshCount).toBeGreaterThan(20);
    expect([...names].some((n) => n.includes('Table · Leg'))).toBe(true);
    expect([...names].some((n) => n.includes('Stand · Shelf'))).toBe(true);
    for (const id of requested) expect(ENGINE_IDS.has(id), id).toBe(true);
  });
});
