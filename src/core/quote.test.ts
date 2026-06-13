import { describe, expect, it } from 'vitest';
import type { ProjectDoc } from './types';
import { buildQuotePayload, buildQuoteProducts, quotePayloadJSON } from './quote';

function docWith(componentId: string, name: string): ProjectDoc {
  return {
    schema: 1,
    name: 'Quote test',
    units: 'imperial',
    instances: [{ id: 'a', componentId, name, position: [0, 0], rotationZ: 0, params: {} }],
  };
}

describe('quote export', () => {
  it('makes one product per piece, with overall dimensions and child parts', () => {
    const products = buildQuoteProducts(docWith('entry-bench', 'Entryway bench'));
    expect(products).toHaveLength(1);
    const bench = products[0];
    expect(bench.name).toBe('Entryway bench');
    // Default bench is 48 × 14 × 18 in.
    expect(bench.overall.width).toBeCloseTo(48, 1);
    expect(bench.overall.depth).toBeCloseTo(14, 1);
    expect(bench.overall.height).toBeCloseTo(18, 1);
    // Children are the cut-list parts; legs come four to a bench.
    const legs = bench.parts.find((p) => p.name === 'Leg');
    expect(legs?.qty).toBe(4);
    expect(bench.partCount).toBe(bench.parts.reduce((s, p) => s + p.qty, 0));
    expect(bench.boardFeet).toBeGreaterThan(0);
    expect(bench.materials.length).toBeGreaterThan(0);
  });

  it('carries dowel galley rails from the spice pull-out as child parts', () => {
    const [product] = buildQuoteProducts(docWith('spice-pullout', 'Spice pull-out'));
    const rail = product.parts.find((p) => p.name === 'Galley rail');
    expect(rail).toBeDefined();
    expect(rail!.qty).toBe(14); // 3·2·2 galley + 2 top tie rails at defaults
    expect(rail!.note).toMatch(/dowel/);
  });

  it('serializes a stable, parseable payload envelope', () => {
    const json = quotePayloadJSON(docWith('drawer-box', 'Box'));
    const parsed = JSON.parse(json) as ReturnType<typeof buildQuotePayload>;
    expect(parsed.source).toBe('Atelier3D');
    expect(parsed.units).toBe('in');
    expect(parsed.products[0].parts.length).toBeGreaterThan(0);
  });
});
