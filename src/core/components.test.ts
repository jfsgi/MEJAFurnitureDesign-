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
