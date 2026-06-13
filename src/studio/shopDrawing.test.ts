import { describe, expect, it } from 'vitest';
import { REGISTRY } from '../core/components/registry';
import type { ProjectDoc } from '../core/types';
import { instanceShopDrawingSVG, shopDrawingsSVG } from './shopDrawing';

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

describe('shop drawings', () => {
  it('every component produces a valid SVG sheet with three view labels', () => {
    for (const id of Object.keys(REGISTRY)) {
      const svg = instanceShopDrawingSVG(docWith(id).instances[0], 'imperial');
      expect(svg.startsWith('<svg'), id).toBe(true);
      expect(svg.includes('</svg>'), id).toBe(true);
      expect(svg.includes('FRONT') && svg.includes('TOP') && svg.includes('RIGHT'), id).toBe(true);
      // The overall dimensions are stamped in the title block.
      expect(/\d/.test(svg), id).toBe(true);
    }
  });

  it('stamps the piece name and the MEJA proprietary notice', () => {
    const svg = instanceShopDrawingSVG(docWith('drawer-box').instances[0], 'imperial');
    expect(svg).toContain('mejadesigns.com');
    expect(svg).toContain('not for distribution');
  });

  it('escapes a piece name with markup characters', () => {
    const inst = docWith('drawer-box').instances[0];
    inst.name = 'A & <B>';
    const svg = instanceShopDrawingSVG(inst, 'imperial');
    expect(svg).toContain('A &amp; &lt;B&gt;');
    expect(svg).not.toContain('<B>');
  });

  it('stacks every instance into one export SVG', () => {
    const doc: ProjectDoc = {
      schema: 1,
      name: 'Two',
      units: 'imperial',
      instances: [
        { id: 'a', componentId: 'drawer-box', name: 'Box', position: [0, 0], rotationZ: 0, params: {} },
        { id: 'b', componentId: 'entry-bench', name: 'Bench', position: [0, 0], rotationZ: 0, params: {} },
      ],
    };
    const svg = shopDrawingsSVG(doc, 'imperial');
    expect((svg.match(/<g transform/g) ?? []).length).toBe(2);
  });
});
