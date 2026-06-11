import { describe, expect, it } from 'vitest';
import { REGISTRY } from './components/registry';
import { buildCutList } from './cutlist';
import { SHEET_L, SHEET_W, buildStockBreakdown } from './stock';
import { defaultParams, modelBBox } from './evaluate';
import { inch } from './units';
import type { ProjectDoc } from './types';

describe('component registry', () => {
  it('every component generates parts at its defaults', () => {
    for (const def of Object.values(REGISTRY)) {
      const model = def.generate(defaultParams(def));
      expect(model.parts.length, def.id).toBeGreaterThan(0);
      const box = modelBBox(model);
      expect(box, def.id).not.toBeNull();
      if (def.mount === 'wall') {
        // Wall-mounted pieces hang above the floor.
        expect(box!.min[2], def.id).toBeGreaterThan(0);
      } else {
        // Everything else must stand on the floor, not float or sink.
        expect(box!.min[2], def.id).toBeCloseTo(0, 0);
      }
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

describe('bench', () => {
  const def = REGISTRY['bench'];

  it('builds 4 legs, 4 aprons, and a solid seat at defaults', () => {
    const model = def.generate(defaultParams(def));
    const names = model.parts.map((p) => p.name);
    expect(names.filter((n) => n === 'Leg')).toHaveLength(4);
    expect(names.filter((n) => n.startsWith('Apron'))).toHaveLength(4);
    expect(names.filter((n) => n === 'Seat')).toHaveLength(1);
  });

  it('slat seat follows the repeat rule: count recomputes from depth', () => {
    const base = { ...defaultParams(def), seatStyle: 'slats' };
    const slatsAt = (depth: number) =>
      def.generate({ ...base, depth }).parts.filter((p) => p.name === 'Seat slat').length;
    const narrow = slatsAt(inch(10));
    const deep = slatsAt(inch(20));
    expect(narrow).toBeGreaterThanOrEqual(2);
    expect(deep).toBeGreaterThan(narrow);
  });

  it('slats and gaps exactly fill the seat depth', () => {
    const D = inch(14);
    const gap = inch(0.5);
    const params = { ...defaultParams(def), seatStyle: 'slats', depth: D, slatGap: gap };
    const slats = def.generate(params).parts.filter((p) => p.name === 'Seat slat');
    const total = slats.reduce((sum, s) => sum + s.cut.width, 0) + (slats.length - 1) * gap;
    expect(total).toBeCloseTo(D, 5);
  });

  it('scales parametrically: overall bbox follows W/D/H', () => {
    const params = { ...defaultParams(def), width: inch(60), depth: inch(16), height: inch(19) };
    const box = modelBBox(def.generate(params))!;
    expect(box.max[0] - box.min[0]).toBeCloseTo(inch(60), 5);
    expect(box.max[1] - box.min[1]).toBeCloseTo(inch(16), 5);
    expect(box.max[2] - box.min[2]).toBeCloseTo(inch(19), 5);
  });

  it('warns when the apron span calls for a center support', () => {
    const long = def.generate({ ...defaultParams(def), width: inch(84) });
    expect(long.findings.some((f) => f.message.includes('center leg or stretcher'))).toBe(true);
  });
});

describe('stool', () => {
  const def = REGISTRY['stool'];

  it('shares the seating generator: 4 legs, 4 aprons, solid seat', () => {
    const model = def.generate(defaultParams(def));
    const names = model.parts.map((p) => p.name);
    expect(names.filter((n) => n === 'Leg')).toHaveLength(4);
    expect(names.filter((n) => n.startsWith('Apron'))).toHaveLength(4);
    expect(names.filter((n) => n === 'Seat')).toHaveLength(1);
  });

  it('does not warn at bar height — tall stools are intentional', () => {
    const tall = def.generate({ ...defaultParams(def), height: inch(30) });
    expect(tall.findings).toHaveLength(0);
  });
});

describe('cabinet', () => {
  const def = REGISTRY['cabinet'];

  it('builds the carcase, one door, and one shelf at defaults', () => {
    const model = def.generate(defaultParams(def));
    const names = model.parts.map((p) => p.name);
    expect(names.filter((n) => n === 'Side')).toHaveLength(2);
    expect(names.filter((n) => n === 'Top' || n === 'Bottom')).toHaveLength(2);
    expect(names.filter((n) => n === 'Back panel')).toHaveLength(1);
    expect(names.filter((n) => n === 'Door')).toHaveLength(1);
    expect(names.filter((n) => n === 'Shelf')).toHaveLength(1);
  });

  it('double doors produce two leaves that fill the opening minus reveals', () => {
    const reveal = inch(0.125);
    const params = { ...defaultParams(def), doors: 'double', reveal };
    const model = def.generate(params);
    const leaves = model.parts.filter((p) => p.name === 'Door');
    expect(leaves).toHaveLength(2);
    const innerW = (defaultParams(def).width as number) - 2 * (defaultParams(def).thickness as number);
    const total = leaves.reduce((sum, l) => sum + l.cut.width, 0) + 3 * reveal;
    expect(total).toBeCloseTo(innerW, 5);
  });

  it('scales parametrically: overall bbox follows W/D/H', () => {
    const params = { ...defaultParams(def), width: inch(30), depth: inch(20), height: inch(48) };
    const box = modelBBox(def.generate(params))!;
    expect(box.max[0] - box.min[0]).toBeCloseTo(inch(30), 5);
    expect(box.max[1] - box.min[1]).toBeCloseTo(inch(20), 5);
    expect(box.max[2] - box.min[2]).toBeCloseTo(inch(48), 5);
  });

  it('warns when a single door is too wide for its hinges', () => {
    const wide = def.generate({ ...defaultParams(def), width: inch(30) });
    expect(wide.findings.some((f) => f.message.includes('double doors'))).toBe(true);
    const paired = def.generate({ ...defaultParams(def), width: inch(30), doors: 'double' });
    expect(paired.findings.some((f) => f.message.includes('double doors'))).toBe(false);
  });
});

describe('chest of drawers', () => {
  const def = REGISTRY['dresser'];

  it('builds the carcase plus a full box behind every front', () => {
    const model = def.generate(defaultParams(def));
    const names = model.parts.map((p) => p.name);
    expect(names.filter((n) => n === 'Drawer front')).toHaveLength(4);
    expect(names.filter((n) => n === 'Drawer side')).toHaveLength(8);
    expect(names.filter((n) => n === 'Drawer end')).toHaveLength(8);
    expect(names.filter((n) => n === 'Drawer bottom')).toHaveLength(4);
    expect(names.filter((n) => n === 'Side')).toHaveLength(2);
  });

  it('fronts plus reveals exactly fill the interior height', () => {
    const params = defaultParams(def);
    const model = def.generate(params);
    const fronts = model.parts.filter((p) => p.name === 'Drawer front');
    const t = params.thickness as number;
    const reveal = params.reveal as number;
    const innerH = (params.height as number) - 2 * t;
    const total =
      fronts.reduce((sum, f) => sum + f.cut.width, 0) + (fronts.length + 1) * reveal;
    expect(total).toBeCloseTo(innerH, 5);
  });

  it('graduates heights toward the top, and equalizes when turned off', () => {
    const base = defaultParams(def);
    const heightsOf = (params: typeof base) =>
      def
        .generate(params)
        .parts.filter((p) => p.name === 'Drawer front')
        .map((f) => f.cut.width);
    const graduated = heightsOf(base);
    // Generation order is top to bottom: each front at least as tall as the one above.
    expect(graduated[0]).toBeLessThan(graduated[graduated.length - 1]);
    const flat = heightsOf({ ...base, graduated: false });
    expect(Math.max(...flat) - Math.min(...flat)).toBeCloseTo(0, 5);
  });

  it('uses the secondary material for drawer boxes', () => {
    const model = def.generate(defaultParams(def));
    const side = model.parts.find((p) => p.name === 'Drawer side')!;
    const front = model.parts.find((p) => p.name === 'Drawer front')!;
    expect(side.material).toBe('maple');
    expect(front.material).toBe('walnut');
  });

  it('warns when the drawer count outgrows the height', () => {
    const crowded = def.generate({ ...defaultParams(def), height: inch(20), drawerCount: 8 });
    expect(crowded.findings.some((f) => f.message.includes('Reduce the count'))).toBe(true);
  });
});

describe('wall shelf with hooks', () => {
  const def = REGISTRY['wall-shelf'];

  it('builds top, legs, back, rail, and the requested hooks', () => {
    const model = def.generate(defaultParams(def));
    const names = model.parts.map((p) => p.name);
    expect(names.filter((n) => n === 'Top')).toHaveLength(1);
    expect(names.filter((n) => n === 'Leg')).toHaveLength(2);
    expect(names.filter((n) => n === 'Tile back frame')).toHaveLength(1);
    expect(names.filter((n) => n === 'Hook rail')).toHaveLength(1);
    expect(names.filter((n) => n === 'Hook')).toHaveLength(3);
  });

  it('back styles swap the panel; open drops it', () => {
    const base = defaultParams(def);
    const art = def.generate({ ...base, back: 'art' });
    expect(art.parts.some((p) => p.name === 'Art back panel')).toBe(true);
    const open = def.generate({ ...base, back: 'open' });
    expect(open.parts.some((p) => p.name.includes('back'))).toBe(false);
  });

  it('hooks are hardware, not lumber', () => {
    const model = def.generate(defaultParams(def));
    const hook = model.parts.find((p) => p.name === 'Hook')!;
    expect(hook.material).toBe('steel-black');
  });

  it('hangs at mount height: nothing touches the floor', () => {
    const box = modelBBox(def.generate(defaultParams(def)))!;
    expect(box.min[2]).toBeGreaterThan(inch(36));
    expect(box.max[2]).toBeCloseTo(inch(66), 5);
  });

  it('cubby option adds a floor and two dividers splitting three bays', () => {
    const base = defaultParams(def);
    const plain = def.generate(base).parts.length;
    const model = def.generate({ ...base, cubby: true, legHeight: inch(12) });
    expect(model.parts.length).toBe(plain + 3);
    const dividers = model.parts.filter((p) => p.name === 'Cubby divider');
    expect(dividers).toHaveLength(2);
    const xs = dividers.map((d) => d.primitives[0].at[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-xs[1], 5);
    expect(model.parts.some((p) => p.name === 'Cubby floor')).toBe(true);
  });

  it('warns when hooks crowd a short shelf', () => {
    const crowded = def.generate({ ...defaultParams(def), length: inch(20), hooks: 6 });
    expect(crowded.findings.some((f) => f.message.includes('crowd'))).toBe(true);
    const fine = def.generate({ ...defaultParams(def), length: inch(48), hooks: 6 });
    expect(fine.findings).toHaveLength(0);
  });
});

describe('drawer box', () => {
  const def = REGISTRY['drawer-box'];

  it('builds 2 sides, front, back, and a captured bottom', () => {
    const model = def.generate(defaultParams(def));
    const names = model.parts.map((p) => p.name);
    expect(names.filter((n) => n.startsWith('Side'))).toHaveLength(2);
    expect(names.filter((n) => n.startsWith('Front'))).toHaveLength(1);
    expect(names.filter((n) => n.startsWith('Back'))).toHaveLength(1);
    expect(names.filter((n) => n === 'Bottom')).toHaveLength(1);
  });

  it('records the joinery choice on the jointed parts', () => {
    const base = defaultParams(def);
    const dovetail = def.generate(base);
    expect(dovetail.parts.find((p) => p.id === 'front')!.name).toContain('dovetailed');
    const boxJoint = def.generate({ ...base, joinery: 'box-joint' });
    expect(boxJoint.parts.find((p) => p.id === 'front')!.name).toContain('box-jointed');
  });

  it('front and back fit between the sides', () => {
    const params = defaultParams(def);
    const model = def.generate(params);
    const front = model.parts.find((p) => p.id === 'front')!;
    const expected = (params.width as number) - 2 * (params.sideThickness as number);
    expect(front.cut.length).toBeCloseTo(expected, 5);
  });

  it('finger pull notches the front into three boards; cut stays one board', () => {
    const base = defaultParams(def);
    const plain = def.generate(base).parts.find((p) => p.id === 'front')!;
    expect(plain.primitives).toHaveLength(1);
    const pulled = def.generate({ ...base, pull: true }).parts.find((p) => p.id === 'front')!;
    expect(pulled.primitives).toHaveLength(3);
    expect(pulled.cut).toEqual(plain.cut);
    const back = def.generate({ ...base, pull: true }).parts.find((p) => p.id === 'back')!;
    expect(back.primitives).toHaveLength(1);
  });

  it('warns when the depth strands a standard slide length', () => {
    const odd = def.generate({ ...defaultParams(def), depth: inch(17) });
    expect(odd.findings.some((f) => f.message.includes('slide'))).toBe(true);
    const standard = def.generate({ ...defaultParams(def), depth: inch(18) });
    expect(standard.findings).toHaveLength(0);
  });
});

describe('drawer unit', () => {
  const def = REGISTRY['drawer-unit'];

  it('builds the case plus a front and full box per drawer', () => {
    const model = def.generate(defaultParams(def));
    const names = model.parts.map((p) => p.name);
    expect(names.filter((n) => n === 'Side')).toHaveLength(2);
    expect(names.filter((n) => n === 'Drawer front')).toHaveLength(2);
    expect(names.filter((n) => n === 'Drawer side')).toHaveLength(4);
    expect(names.filter((n) => n === 'Drawer end')).toHaveLength(4);
    expect(names.filter((n) => n === 'Drawer bottom')).toHaveLength(2);
  });

  it('inset fronts plus gaps exactly fill the interior height', () => {
    const params = defaultParams(def);
    const model = def.generate(params);
    const fronts = model.parts.filter((p) => p.name === 'Drawer front');
    const innerH = (params.height as number) - 2 * (params.thickness as number);
    const gap = params.gap as number;
    const total =
      fronts.reduce((sum, f) => sum + f.cut.width, 0) + (fronts.length + 1) * gap;
    expect(total).toBeCloseTo(innerH, 5);
  });

  it('overlay fronts cover the case edges and sit proud of it', () => {
    const base = defaultParams(def);
    const model = def.generate({ ...base, frontStyle: 'overlay' });
    const front = model.parts.find((p) => p.name === 'Drawer front')!;
    const innerW = (base.width as number) - 2 * (base.thickness as number);
    expect(front.cut.length).toBeGreaterThan(innerW);
    const caseDepthFront = (base.depth as number) / 2;
    expect(front.primitives[0].at[1]).toBeGreaterThan(caseDepthFront - 0.001);
  });

  it('inherits the slide-fit warning for in-between depths', () => {
    // depth 20" − front 0.625 − back 0.25 − gap 0.5 = 18.625" box → strands an 18" slide... within tolerance.
    // Use 21": box depth 19.625" → more than 0.75" past an 18" slide.
    const odd = def.generate({ ...defaultParams(def), depth: inch(21) });
    expect(odd.findings.some((f) => f.message.includes('slide'))).toBe(true);
  });
});

describe('storage tower', () => {
  const def = REGISTRY['storage-tower'];

  it('builds exposed drawer boxes with no applied fronts', () => {
    const model = def.generate(defaultParams(def));
    const names = model.parts.map((p) => p.name);
    expect(names.filter((n) => n === 'Drawer side')).toHaveLength(12);
    expect(names.filter((n) => n === 'Drawer front')).toHaveLength(0);
    expect(names.filter((n) => n === 'Fixed shelf')).toHaveLength(1);
  });

  it('drawer fronts carry pull cutouts by default, backs stay solid', () => {
    const model = def.generate(defaultParams(def));
    const fronts = model.parts.filter((p) => p.name === 'Drawer end (pull)');
    const backs = model.parts.filter((p) => p.name === 'Drawer end');
    expect(fronts).toHaveLength(6);
    expect(backs).toHaveLength(6);
    expect(fronts[0].primitives).toHaveLength(3);
  });

  it('removing the cubby gives the drawers the full interior', () => {
    const base = defaultParams(def);
    const topBox = (params: typeof base) => {
      const boxes = def
        .generate(params)
        .parts.filter((p) => p.name === 'Drawer side');
      return Math.max(...boxes.map((b) => b.primitives[0].at[2]));
    };
    expect(topBox({ ...base, cubby: false })).toBeGreaterThan(topBox(base));
  });
});

describe('wine cube', () => {
  const def = REGISTRY['wine-cube'];

  it('builds crossing diagonal dividers and a drawer', () => {
    const model = def.generate(defaultParams(def));
    const dividers = model.parts.filter((p) => p.name === 'Divider (diagonal)');
    expect(dividers).toHaveLength(2);
    const tilts = dividers.map((d) => (d.primitives[0] as { tilt?: number }).tilt ?? 0);
    expect(tilts[0]).toBeCloseTo(-tilts[1], 5);
    expect(model.parts.some((p) => p.name === 'Drawer side')).toBe(true);
  });

  it('tilted dividers stay inside the case bbox', () => {
    const params = defaultParams(def);
    const box = modelBBox(def.generate(params))!;
    expect(box.max[0] - box.min[0]).toBeCloseTo(params.width as number, 3);
    expect(box.max[2] - box.min[2]).toBeCloseTo(params.height as number, 3);
  });

  it('warns when bottles will not fit', () => {
    const tight = def.generate({ ...defaultParams(def), width: inch(14), height: inch(18) });
    expect(tight.findings.some((f) => f.message.includes('tight'))).toBe(true);
    const shallow = def.generate({ ...defaultParams(def), depth: inch(9) });
    expect(shallow.findings.some((f) => f.message.includes('overhang'))).toBe(true);
  });
});

describe('spice rack', () => {
  const def = REGISTRY['spice-rack'];

  it('builds the four production parts: two sides, shelf, back', () => {
    const model = def.generate(defaultParams(def));
    const names = model.parts.map((p) => p.name);
    expect(names.filter((n) => n === 'Side (wedge)')).toHaveLength(2);
    expect(names.filter((n) => n === 'Shelf (angled)')).toHaveLength(1);
    expect(names.filter((n) => n === 'Back panel')).toHaveLength(1);
  });

  it('leans the shelf back toward the wall', () => {
    const model = def.generate(defaultParams(def));
    const shelf = model.parts.find((p) => p.name === 'Shelf (angled)')!;
    const prim = shelf.primitives[0] as { tiltX?: number };
    expect(prim.tiltX ?? 0).toBeLessThan(0);
  });

  it('hangs at mount height with the back-flush wedge inside the depth', () => {
    const params = defaultParams(def);
    const box = modelBBox(def.generate(params))!;
    expect(box.min[2]).toBeCloseTo(params.mountHeight as number, 1);
    expect(box.max[2] - box.min[2]).toBeCloseTo(params.height as number, 1);
    // The aligned wedge must not inflate the bbox past the rack's depth.
    expect(box.max[1] - box.min[1]).toBeLessThanOrEqual((params.depth as number) + 1);
  });
});

describe('cut list part tracking', () => {
  it('aggregated rows carry the ids of every part they cover', () => {
    const doc: ProjectDoc = {
      schema: 1,
      name: 'test',
      units: 'imperial',
      instances: [
        { id: 'i1', componentId: 'dining-table', name: 'Table', position: [0, 0], rotationZ: 0, params: {} },
      ],
    };
    const rows = buildCutList(doc)[0].rows;
    const legs = rows.find((r) => r.part === 'Leg')!;
    expect(legs.qty).toBe(4);
    expect(legs.partIds).toHaveLength(4);
    expect(new Set(legs.partIds).size).toBe(4);
    for (const row of rows) expect(row.partIds).toHaveLength(row.qty);
  });
});

describe('tiered display stand', () => {
  const def = REGISTRY['display-stand'];

  it('builds the frame per the shop drawing: legs, side rails, long rails, shelves', () => {
    const model = def.generate(defaultParams(def));
    const names = model.parts.map((p) => p.name);
    expect(names.filter((n) => n === 'Leg (back)')).toHaveLength(2);
    expect(names.filter((n) => n === 'Leg (raked)')).toHaveLength(2);
    expect(names.filter((n) => n === 'Side rail (top)')).toHaveLength(2);
    expect(names.filter((n) => n === 'Side rail (bottom)')).toHaveLength(2);
    // One long rail at the back under the top shelf; the bottom pair at the floor.
    expect(names.filter((n) => n === 'Top rail')).toHaveLength(1);
    expect(names.filter((n) => n === 'Bottom rail')).toHaveLength(2);
    expect(names.filter((n) => n === 'Top shelf')).toHaveLength(1);
    expect(names.filter((n) => n === 'Shelf')).toHaveLength(3);
    expect(names.filter((n) => n === 'Shelf backsplash')).toHaveLength(4);
    // Shelves are clean bowed boards — no skirts or rails under the fronts.
    expect(names.some((n) => n === 'Shelf skirt' || n === 'Shelf rail')).toBe(false);
    const raked = model.parts.find((p) => p.name === 'Leg (raked)')!;
    const prim = raked.primitives[0] as { shape: string; shift?: [number, number] };
    expect(prim.shape).toBe('taperedBox');
    expect(prim.shift?.[1] ?? 0).toBeGreaterThan(0);
  });

  it('top shelf sits 3/4" below the proud leg tops; bottom shelf rides the rails', () => {
    const model = def.generate(defaultParams(def));
    const box = modelBBox(model)!;
    expect(box.max[2]).toBeCloseTo(inch(38), 3); // legs reach full height
    const top = model.parts.find((p) => p.name === 'Top shelf')!;
    const topSurface = top.primitives[0].at[2] + (defaultParams(def).thickness as number) / 2;
    expect(topSurface).toBeCloseTo(inch(38) - inch(0.75), 3);
    const shelves = model.parts.filter((p) => p.name === 'Shelf');
    const bottom = shelves[shelves.length - 1];
    const bottomUnderside = bottom.primitives[0].at[2] - (defaultParams(def).thickness as number) / 2;
    expect(bottomUnderside).toBeCloseTo(inch(2.4375) + inch(2.5), 3); // seated on the rails
  });

  it('side rails enclose the shelf ends flush: leg tops above, shelf surface below', () => {
    const model = def.generate(defaultParams(def));
    const t = defaultParams(def).thickness as number;
    const topRail = model.parts.find((p) => p.name === 'Side rail (top)')!;
    const topPrim = topRail.primitives[0] as { at: [number, number, number]; size: [number, number, number] };
    expect(topPrim.at[2] + topPrim.size[2] / 2).toBeCloseTo(inch(38), 3); // flush with proud legs
    const botRail = model.parts.find((p) => p.name === 'Side rail (bottom)')!;
    const botPrim = botRail.primitives[0] as { at: [number, number, number]; size: [number, number, number] };
    const bottomShelfSurface = inch(2.4375) + inch(2.5) + t;
    expect(botPrim.at[2] + botPrim.size[2] / 2).toBeCloseTo(bottomShelfSurface, 3);
  });

  it('arch rises adjust per part', () => {
    const base = defaultParams(def);
    const riseOf = (params: typeof base, id: string) =>
      (def.generate(params).parts.find((p) => p.id === id)!.primitives[0] as { rise: number }).rise;
    expect(riseOf({ ...base, frontArchRise: inch(1) }, 'rail-bottom-front')).toBeCloseTo(inch(1), 5);
    expect(riseOf({ ...base, sideTopArchRise: inch(2) }, 'side-rail-top--1')).toBeCloseTo(inch(2), 5);
    expect(riseOf({ ...base, sideBottomArchRise: 0 }, 'side-rail-bottom--1')).toBe(0);
    // Clamped: the curve always leaves a shoulder on the board.
    expect(riseOf({ ...base, frontArchRise: inch(2.25) }, 'rail-bottom-front')).toBeLessThan(inch(2.5));
  });

  it('arches where the drawing has them: front rail, side rails, shelf fronts', () => {
    const model = def.generate(defaultParams(def));
    const shape = (name: string, id?: string) =>
      model.parts.find((p) => (id ? p.id === id : p.name === name))!.primitives[0].shape;
    expect(shape('', 'rail-bottom-front')).toBe('archedBoard');
    expect(shape('', 'rail-bottom-back')).toBe('box');
    expect(shape('Side rail (top)')).toBe('archedBoard');
    expect(shape('Side rail (bottom)')).toBe('archedBoard');
    expect(shape('Top shelf')).toBe('archedBoard');
    expect(shape('Shelf')).toBe('archedBoard');
  });

  it('each shelf carries its own half-ellipse: spring at the legs, peak at full depth', () => {
    const params = defaultParams(def);
    const model = def.generate(params);
    const D = params.depth as number;
    const shelves = model.parts.filter((p) => p.name === 'Shelf' || p.name === 'Top shelf');
    expect(shelves).toHaveLength(4);
    const rises: number[] = [];
    for (const shelf of shelves) {
      const prim = shelf.primitives[0] as {
        at: [number, number, number];
        size: [number, number, number];
        rise: number;
      };
      // Back edge flush with the rear plane; ellipse peak at the full depth.
      expect(prim.at[1] - prim.size[1] / 2).toBeCloseTo(-D / 2, 5);
      expect(prim.at[1] + prim.size[1] / 2 + prim.rise).toBeCloseTo(D / 2, 5);
      expect(shelf.cut.width).toBeCloseTo(D, 5);
      rises.push(prim.rise);
    }
    // The legs sit deeper at every level down, so each ellipse is shallower.
    for (let i = 1; i < rises.length; i++) expect(rises[i]).toBeLessThan(rises[i - 1]);
    expect(rises[0]).toBeGreaterThan(inch(5)); // top shelf sweeps from ~14" out to 20"
  });

  it('matches the drawing envelope: 36 × 20 × 38 at defaults', () => {
    const box = modelBBox(def.generate(defaultParams(def)))!;
    expect(box.max[0] - box.min[0]).toBeCloseTo(inch(36), 3);
    expect(box.max[2] - box.min[2]).toBeCloseTo(inch(38), 1);
    expect(Math.abs(box.max[1] - box.min[1] - inch(20))).toBeLessThan(10);
  });
});

describe('stock breakdown', () => {
  const docWith = (componentId: string): ProjectDoc => ({
    schema: 1,
    name: 'test',
    units: 'imperial',
    instances: [{ id: 'i1', componentId, name: 'X', position: [0, 0], rotationZ: 0, params: {} }],
  });

  it('splits lumber from sheet stock and adds a purchase allowance', () => {
    const stock = buildStockBreakdown(docWith('cabinet'));
    // Walnut carcase boards are lumber; the 1/4" back panel goes to sheet stock.
    const walnut = stock.lumber.find((l) => l.material === 'walnut')!;
    expect(walnut.boardFeet).toBeGreaterThan(0);
    expect(walnut.buyBoardFeet).toBeGreaterThan(walnut.boardFeet);
    expect(stock.sheets.length).toBeGreaterThan(0);
    expect(stock.unplaced).toHaveLength(0);
  });

  it('nests parts inside the sheet without overlaps', () => {
    const stock = buildStockBreakdown(docWith('storage-tower'));
    for (const sheet of stock.sheets) {
      for (const a of sheet.placements) {
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.x + a.w).toBeLessThanOrEqual(SHEET_L + 1e-6);
        expect(a.y + a.h).toBeLessThanOrEqual(SHEET_W + 1e-6);
      }
      for (let i = 0; i < sheet.placements.length; i++) {
        for (let j = i + 1; j < sheet.placements.length; j++) {
          const a = sheet.placements[i];
          const b = sheet.placements[j];
          const overlap =
            a.x < b.x + b.w - 1e-6 &&
            b.x < a.x + a.w - 1e-6 &&
            a.y < b.y + b.h - 1e-6 &&
            b.y < a.y + a.h - 1e-6;
          expect(overlap, `placements ${i}/${j} overlap`).toBe(false);
        }
      }
      expect(sheet.usedFraction).toBeGreaterThan(0);
      expect(sheet.usedFraction).toBeLessThanOrEqual(1);
    }
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
