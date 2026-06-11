import { describe, expect, it } from 'vitest';
import { REGISTRY } from './components/registry';
import { defaultParams, modelBBox } from './evaluate';
import { inch } from './units';

describe('component registry', () => {
  it('every component generates parts at its defaults', () => {
    for (const def of Object.values(REGISTRY)) {
      const model = def.generate(defaultParams(def));
      expect(model.parts.length, def.id).toBeGreaterThan(0);
      const box = modelBBox(model);
      expect(box, def.id).not.toBeNull();
      // Everything must stand on the floor, not float or sink.
      expect(box!.min[2], def.id).toBeCloseTo(0, 0);
    }
  });

  it('caps basic parameters at 5 (UI standard / publishing rule)', () => {
    for (const def of Object.values(REGISTRY)) {
      const basics = def.params.filter((p) => p.tier === 'basic');
      expect(basics.length, def.id).toBeLessThanOrEqual(5);
    }
  });
});

describe('dining table', () => {
  const def = REGISTRY['dining-table'];

  it('builds 4 legs, 4 aprons, and a top', () => {
    const model = def.generate(defaultParams(def));
    const names = model.parts.map((p) => p.name);
    expect(names.filter((n) => n === 'Leg')).toHaveLength(4);
    expect(names.filter((n) => n.startsWith('Apron'))).toHaveLength(4);
    expect(names.filter((n) => n === 'Top')).toHaveLength(1);
  });

  it('scales parametrically: overall bbox follows W/D/H', () => {
    const params = { ...defaultParams(def), width: inch(96), depth: inch(40), height: inch(29) };
    const box = modelBBox(def.generate(params))!;
    expect(box.max[0] - box.min[0]).toBeCloseTo(inch(96), 5);
    expect(box.max[1] - box.min[1]).toBeCloseTo(inch(40), 5);
    expect(box.max[2] - box.min[2]).toBeCloseTo(inch(29), 5);
  });

  it('keeps fixed dimensions fixed while stretching: leg width survives resizing', () => {
    const base = defaultParams(def);
    const wide = { ...base, width: inch(120) };
    const legCut = (p: typeof base) =>
      def.generate(p).parts.find((part) => part.name === 'Leg')!.cut;
    expect(legCut(wide).width).toBe(legCut(base).width);
  });
});

describe('bookcase repeat rule', () => {
  const def = REGISTRY['bookcase'];

  it('recomputes shelf count from height at the target spacing', () => {
    const base = defaultParams(def);
    const shelvesAt = (height: number) =>
      def.generate({ ...base, height }).parts.filter((p) => p.name === 'Shelf').length;
    const short = shelvesAt(inch(36));
    const tall = shelvesAt(inch(84));
    expect(tall).toBeGreaterThan(short);
  });

  it('warns when shelves span past the sag limit', () => {
    const base = defaultParams(def);
    const wide = def.generate({ ...base, width: inch(60) });
    expect(wide.findings.some((f) => f.message.includes('sag'))).toBe(true);
  });
});
