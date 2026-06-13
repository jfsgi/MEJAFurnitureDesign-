import { describe, expect, it } from 'vitest';
import { REGISTRY } from './components/registry';
import { buildCutList } from './cutlist';
import { SHEET_L, SHEET_W, buildStockBreakdown } from './stock';
import { defaultParams, modelBBox, partsAffectedBy } from './evaluate';
import { HALF_BLIND_LIP } from './components/drawerparts';
import { inch } from './units';
import type { Instance, ProjectDoc } from './types';

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

  it('caps basic parameters at 6 (UI standard / publishing rule)', () => {
    for (const def of Object.values(REGISTRY)) {
      const basics = def.params.filter((p) => p.tier === 'basic');
      expect(basics.length, def.id).toBeLessThanOrEqual(6);
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
    expect(names.filter((n) => n.startsWith('Drawer front'))).toHaveLength(4);
    expect(names.filter((n) => n === 'Drawer side')).toHaveLength(8);
    expect(names.filter((n) => n === 'Drawer end')).toHaveLength(8);
    expect(names.filter((n) => n === 'Drawer bottom')).toHaveLength(4);
    expect(names.filter((n) => n.startsWith('Side'))).toHaveLength(2);
  });

  it('fronts plus reveals exactly fill the interior height', () => {
    const params = defaultParams(def);
    const model = def.generate(params);
    const fronts = model.parts.filter((p) => p.name.startsWith('Drawer front'));
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
        .parts.filter((p) => p.name.startsWith('Drawer front'))
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
    const front = model.parts.find((p) => p.name.startsWith('Drawer front'))!;
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

  it('front and back are full-width jointed boards', () => {
    const params = defaultParams(def);
    const model = def.generate(params);
    const front = model.parts.find((p) => p.id === 'front')!;
    expect(front.cut.length).toBeCloseTo(params.width as number, 5);
  });

  it('finger pull is the engine scoop in the pins board; cut stays one board', () => {
    const base = defaultParams(def);
    const plain = def.generate(base).parts.find((p) => p.id === 'front')!;
    expect((plain.primitives[0] as { scoop?: object }).scoop).toBeUndefined();
    const pulled = def.generate({ ...base, pull: true }).parts.find((p) => p.id === 'front')!;
    const prim = pulled.primitives[0] as { shape: string; scoop?: { width: number; depth: number } };
    expect(prim.shape).toBe('jointedBoard');
    expect(prim.scoop!.depth).toBeGreaterThan(0);
    expect(pulled.cut).toEqual(plain.cut);
    const back = def.generate({ ...base, pull: true }).parts.find((p) => p.id === 'back')!;
    expect((back.primitives[0] as { scoop?: object }).scoop).toBeUndefined();
  });

  it('boards carry the engine joinery: tails on sides, pins on ends', () => {
    const base = defaultParams(def);
    const dovetail = def.generate(base); // dovetail is the default
    const side = dovetail.parts.find((p) => p.id === 'side-1')!;
    const tails = side.primitives[0] as { shape: string; role?: string; joint?: string };
    expect(tails.shape).toBe('jointedBoard');
    expect(tails.role).toBe('tails');
    expect(tails.joint).toBe('dovetail');
    const front = dovetail.parts.find((p) => p.id === 'front')!;
    const pins = front.primitives[0] as { role?: string; outerSign?: number };
    expect(pins.role).toBe('pins');
    expect(pins.outerSign).toBe(1);

    const boxJoint = def.generate({ ...base, joinery: 'box-joint' });
    const bjSide = boxJoint.parts.find((p) => p.id === 'side-1')!;
    expect((bjSide.primitives[0] as { joint?: string }).joint).toBe('box-joint');
  });

  it('warns when the depth strands a standard slide length', () => {
    const odd = def.generate({ ...defaultParams(def), depth: inch(17) });
    expect(odd.findings.some((f) => f.message.includes('slide'))).toBe(true);
    const standard = def.generate({ ...defaultParams(def), depth: inch(18) });
    expect(standard.findings).toHaveLength(0);
  });

  it('half-blind default: both corners lapped, sides lose a lip per end', () => {
    const base = defaultParams(def);
    expect(base.joinery).toBe('half-blind');
    const model = def.generate(base);
    const D = base.depth as number;
    const side = model.parts.find((p) => p.id === 'side-1')!;
    const tails = side.primitives[0] as { length?: number; lip?: number; lipEnd?: string };
    expect(tails.length).toBeCloseTo(D - 2 * HALF_BLIND_LIP, 5); // 1/16" per end
    expect(tails.lip).toBeCloseTo(HALF_BLIND_LIP, 5);
    expect(tails.lipEnd).toBeUndefined(); // lapped at both ends
    for (const id of ['front', 'back']) {
      const board = model.parts.find((p) => p.id === id)!;
      expect(board.name).toContain('half-blind');
      expect((board.primitives[0] as { lip?: number }).lip).toBeCloseTo(HALF_BLIND_LIP, 5);
    }
    // The captured bottom carries its own stock.
    expect(model.parts.find((p) => p.id === 'bottom')!.material).toBe('baltic-birch');
  });

  it('bottom cuts 1/2" over the inside for its groove; recess follows the slides', () => {
    const base = defaultParams(def);
    const W = base.width as number;
    const D = base.depth as number;
    const sideT = base.sideThickness as number;
    const model = def.generate(base);
    const bottom = model.parts.find((p) => p.id === 'bottom')!;
    expect(bottom.cut.length).toBeCloseTo(W - 2 * sideT + inch(0.5), 5);
    expect(bottom.cut.width).toBeCloseTo(D - 2 * sideT + inch(0.5), 5);
    // Side-mount slides: groove 1/4" up; undermounts: 1/2".
    const prim = bottom.primitives[0] as { at: number[]; size: number[] };
    expect(prim.at[2] - prim.size[2] / 2).toBeCloseTo(inch(0.25), 5);
    const under = def.generate({ ...base, slideType: 'undermount' });
    const uPrim = under.parts.find((p) => p.id === 'bottom')!.primitives[0] as {
      at: number[];
      size: number[];
    };
    expect(uPrim.at[2] - uPrim.size[2] / 2).toBeCloseTo(inch(0.5), 5);
  });
});

describe('drawer unit', () => {
  const def = REGISTRY['drawer-unit'];

  it('builds the case plus a front and full box per drawer', () => {
    const model = def.generate(defaultParams(def));
    const names = model.parts.map((p) => p.name);
    expect(names.filter((n) => n.startsWith('Side'))).toHaveLength(2);
    expect(names.filter((n) => n.startsWith('Drawer front'))).toHaveLength(2);
    expect(names.filter((n) => n === 'Drawer side')).toHaveLength(4);
    expect(names.filter((n) => n === 'Drawer end')).toHaveLength(4);
    expect(names.filter((n) => n === 'Drawer bottom')).toHaveLength(2);
  });

  it('inset fronts fill the interior with the reveal above, below, and between', () => {
    const params = defaultParams(def);
    const model = def.generate(params);
    const fronts = model.parts.filter((p) => p.name.startsWith('Drawer front'));
    const innerH = (params.height as number) - 2 * (params.thickness as number);
    const reveal = params.insetReveal as number;
    expect(reveal).toBeCloseTo(inch(0.125), 5); // shop standard for inset
    const total =
      fronts.reduce((sum, f) => sum + f.cut.width, 0) + (fronts.length + 1) * reveal;
    expect(total).toBeCloseTo(innerH, 5);
  });

  it('overlay fronts cover the box face to within the reveal, spaced by it', () => {
    const base = defaultParams(def);
    const model = def.generate({ ...base, frontStyle: 'overlay' });
    const fronts = model.parts
      .filter((p) => p.name.startsWith('Drawer front'))
      .sort((a, b) => b.primitives[0].at[2] - a.primitives[0].at[2]);
    const r = base.overlayReveal as number;
    expect(r).toBeCloseTo(inch(0.0625), 5); // shop standard for overlay
    const W = base.width as number;
    const H = base.height as number;
    // Perimeter reveal at the outer edges of the box.
    expect(fronts[0].cut.length).toBeCloseTo(W - 2 * r, 5);
    const topEdge = fronts[0].primitives[0].at[2] + fronts[0].cut.width / 2;
    expect(topEdge).toBeCloseTo(H - r, 5);
    // Stacked fronts spaced by the same reveal.
    const gapBetween =
      fronts[0].primitives[0].at[2] - fronts[0].cut.width / 2 -
      (fronts[1].primitives[0].at[2] + fronts[1].cut.width / 2);
    expect(gapBetween).toBeCloseTo(r, 5);
    // Proud of the case face.
    expect(fronts[0].primitives[0].at[1]).toBeGreaterThan((base.depth as number) / 2 - 0.001);
  });

  it('case joints mirror the engine layout; half-blind keeps the lap on the cap', () => {
    const base = defaultParams(def);
    const t = base.thickness as number;
    const H = base.height as number;
    const W = base.width as number;
    const through = def.generate({ ...base, caseJoinery: 'through-dovetail' });
    const side = through.parts.find((p) => p.id === 'side-1')!;
    expect(side.name).toBe('Side (dovetail)');
    const tails = side.primitives[0] as { shape: string; role?: string; length?: number; jointDepth?: number };
    expect(tails.shape).toBe('jointedBoard');
    expect(tails.role).toBe('tails');
    expect(tails.length).toBeCloseTo(H, 5); // nominal: tails and pins tile the joint exactly
    expect(tails.jointDepth).toBeCloseTo(t, 5);
    const top = through.parts.find((p) => p.id === 'top')!;
    const pins = top.primitives[0] as { role?: string; length?: number; thickness?: number };
    expect(pins.role).toBe('pins');
    expect(pins.length).toBeCloseTo(W, 5);
    expect(pins.thickness).toBeCloseTo(t, 5); // full cap thickness, no band
    expect(top.primitives).toHaveLength(1);
    expect(top.cut.length).toBeCloseTo(W - 2 * t + 2 * t, 5);

    const boxJoint = def.generate({ ...base, caseJoinery: 'box-joint' });
    expect(
      (boxJoint.parts.find((p) => p.id === 'top')!.primitives[0] as { joint?: string }).joint,
    ).toBe('box-joint');

    // Half-blind: blind sockets in the caps with the lap on the show face;
    // the sides keep the full joint layout, engagement stopped a lip short.
    const halfBlind = def.generate(base);
    const hbSide = halfBlind.parts.find((p) => p.id === 'side-1')!;
    const hbTails = hbSide.primitives[0] as { length?: number; jointDepth?: number; lip?: number };
    expect(hbTails.length).toBeCloseTo(H - 2 * HALF_BLIND_LIP, 5);
    expect(hbTails.jointDepth).toBeCloseTo(t, 5); // full mating depth — layouts must match
    expect(hbTails.lip).toBeCloseTo(HALF_BLIND_LIP, 5);
    const hbTop = halfBlind.parts.find((p) => p.id === 'top')!;
    expect(hbTop.primitives).toHaveLength(1);
    const cap = hbTop.primitives[0] as {
      shape: string;
      role?: string;
      length?: number;
      thickness?: number;
      lip?: number;
    };
    expect(cap.shape).toBe('jointedBoard');
    expect(cap.role).toBe('pins');
    expect(cap.length).toBeCloseTo(W, 5);
    expect(cap.thickness).toBeCloseTo(t, 5);
    expect(cap.lip).toBeCloseTo(HALF_BLIND_LIP, 5);
  });

  it('half-blind dovetailed case: labeled parts, top/bottom stock runs into the sockets', () => {
    const params = defaultParams(def);
    const model = def.generate(params);
    const t = params.thickness as number;
    const innerW = (params.width as number) - 2 * t;
    const top = model.parts.find((p) => p.id === 'top')!;
    expect(top.name).toBe('Top (half-blind DT)');
    // The cap runs the full case width — its laps reach the outer faces.
    expect(top.cut.length).toBeCloseTo(innerW + 2 * t, 5);
    const side = model.parts.find((p) => p.id === 'side-1')!;
    expect(side.name).toBe('Side (half-blind DT)');
    // Tails stop a lip shy of each cap face.
    expect(side.cut.length).toBeCloseTo((params.height as number) - 2 * HALF_BLIND_LIP, 5);
    const butt = def.generate({ ...params, caseJoinery: 'butt' });
    expect(butt.parts.find((p) => p.id === 'top')!.cut.length).toBeCloseTo(innerW, 5);
    expect(butt.parts.find((p) => p.id === 'top')!.name).toBe('Top');
  });

  it('pull cutouts are opt-in: plain fronts by default, scoop when enabled', () => {
    const base = defaultParams(def);
    const plain = def.generate(base).parts.find((p) => p.name.startsWith('Drawer front'))!;
    expect(plain.primitives[0].shape).toBe('box');
    const front = def
      .generate({ ...base, pulls: true })
      .parts.find((p) => p.name.startsWith('Drawer front'))!;
    const prim = front.primitives[0] as { shape: string; arch?: string; at: [number, number, number] };
    expect(prim.shape).toBe('archedBoard');
    expect(prim.arch).toBe('scoop');
    expect(prim.at[0]).toBeCloseTo(0, 5); // centered on the single column
  });

  it('back panel insets 1/4" from the rear of the box', () => {
    const params = defaultParams(def);
    const back = def.generate(params).parts.find((p) => p.id === 'back')!;
    const prim = back.primitives[0] as { at: [number, number, number]; size: [number, number, number] };
    const rearFace = prim.at[1] - prim.size[1] / 2;
    expect(rearFace).toBeCloseTo(-(params.depth as number) / 2 + inch(0.25), 5);
  });

  it('overlay fronts cover the case edges and sit proud of it', () => {
    const base = defaultParams(def);
    const model = def.generate({ ...base, frontStyle: 'overlay' });
    const front = model.parts.find((p) => p.name.startsWith('Drawer front'))!;
    const innerW = (base.width as number) - 2 * (base.thickness as number);
    expect(front.cut.length).toBeGreaterThan(innerW);
    const caseDepthFront = (base.depth as number) / 2;
    expect(front.primitives[0].at[1]).toBeGreaterThan(caseDepthFront - 0.001);
  });

  it('columns add case-stock dividers and a drawer bank per column', () => {
    const base = defaultParams(def);
    const model = def.generate({ ...base, columns: 3, width: inch(45) });
    const dividers = model.parts.filter((p) => p.name === 'Divider');
    expect(dividers).toHaveLength(2);
    const t = base.thickness as number;
    expect(dividers[0].cut.thickness).toBeCloseTo(t, 5);
    // 3 columns × 2 rows: a front and a full box per cell.
    expect(model.parts.filter((p) => p.name.startsWith('Drawer front'))).toHaveLength(6);
    expect(model.parts.filter((p) => p.name === 'Drawer side')).toHaveLength(12);
    // Columns split the interior evenly around the dividers; inset fronts run
    // over the recessed dividers, separated by single reveals.
    const innerW = inch(45) - 2 * t;
    const r = base.insetReveal as number;
    const front = model.parts.find((p) => p.name.startsWith('Drawer front'))!;
    expect(front.cut.length).toBeCloseTo((innerW - 4 * r) / 3, 5);
    // Divider recessed a front thickness; fronts cover it.
    const divider = model.parts.find((p) => p.name === 'Divider')!;
    const dPrim = divider.primitives[0] as { at: [number, number, number]; size: [number, number, number] };
    expect(dPrim.at[1] + dPrim.size[1] / 2).toBeCloseTo((base.depth as number) / 2 - t, 5);
    // Divider planes land between the columns.
    const colW = (innerW - 2 * t) / 3;
    const xs = dividers.map((d) => d.primitives[0].at[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-innerW / 2 + colW + t / 2, 5);
    expect(xs[1]).toBeCloseTo(-innerW / 2 + 2 * colW + 1.5 * t, 5);
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
    expect(names.filter((n) => n.startsWith('Drawer front'))).toHaveLength(0);
    expect(names.filter((n) => n === 'Fixed shelf')).toHaveLength(1);
  });

  it('pulls are opt-in: solid box fronts by default, scooped when enabled', () => {
    const plain = def.generate(defaultParams(def));
    expect(plain.parts.filter((p) => p.name === 'Drawer end (pull)')).toHaveLength(0);
    expect(plain.parts.filter((p) => p.name === 'Drawer end')).toHaveLength(12);
    const pulled = def.generate({ ...defaultParams(def), pulls: true });
    const fronts = pulled.parts.filter((p) => p.name === 'Drawer end (pull)');
    expect(fronts).toHaveLength(6);
    const scoop = (fronts[0].primitives[0] as { scoop?: { depth: number } }).scoop;
    expect(scoop?.depth).toBeGreaterThan(0);
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

describe('spice rack pull-out', () => {
  const def = REGISTRY['spice-pullout'];

  it('builds four posts, a shelf per tier, and dowel galley rails', () => {
    const model = def.generate(defaultParams(def));
    const names = model.parts.map((p) => p.name);
    expect(names.filter((n) => n === 'Corner post')).toHaveLength(4);
    expect(names.filter((n) => n === 'Bottom shelf')).toHaveLength(1);
    expect(names.filter((n) => n === 'Shelf')).toHaveLength(2); // tiers − 1 at default tiers = 3
    // tiers × 2 sides × railRows + 2 top tie rails = 3·2·2 + 2
    expect(names.filter((n) => n === 'Galley rail')).toHaveLength(14);
  });

  it('runs the rails as horizontal dowels along the depth', () => {
    const model = def.generate(defaultParams(def));
    const rail = model.parts.find((p) => p.name === 'Galley rail')!;
    const prim = rail.primitives[0] as { shape: string; axis?: string };
    expect(prim.shape).toBe('cylinder');
    expect(prim.axis).toBe('y');
  });

  it('stands on the floor and fills its width, depth, and height', () => {
    const base = defaultParams(def);
    const box = modelBBox(def.generate(base))!;
    expect(box.min[2]).toBeCloseTo(0, 0);
    expect(box.max[0] - box.min[0]).toBeCloseTo(base.width as number, 5);
    expect(box.max[1] - box.min[1]).toBeCloseTo(base.depth as number, 5);
    expect(box.max[2] - box.min[2]).toBeCloseTo(base.height as number, 5);
  });

  it('adds rails as the shelf count and rows grow', () => {
    const base = defaultParams(def);
    const more = def.generate({ ...base, tiers: 4, railRows: 3 });
    expect(more.parts.filter((p) => p.name === 'Galley rail')).toHaveLength(4 * 2 * 3 + 2);
  });
});

describe('parameter → part mapping (adjustment highlighting)', () => {
  const inst = (componentId: string): Instance => ({
    id: 'i',
    componentId,
    name: 'X',
    position: [0, 0],
    rotationZ: 0,
    params: {},
  });

  it('isolates the single part a focused parameter drives', () => {
    expect(partsAffectedBy(inst('display-stand'), 'frontArchRise')).toEqual(['rail-bottom-front']);
    const sideTop = partsAffectedBy(inst('display-stand'), 'sideTopArchRise');
    expect(sideTop.sort()).toEqual(['side-rail-top--1', 'side-rail-top-1']);
  });

  it('fans out for parameters that move the whole assembly', () => {
    expect(partsAffectedBy(inst('display-stand'), 'width').length).toBeGreaterThan(10);
  });

  it('covers parts created or removed by repeat rules', () => {
    const affected = partsAffectedBy(inst('bookcase'), 'shelfSpacing');
    expect(affected.some((id) => id.startsWith('shelf-'))).toBe(true);
    expect(affected.some((id) => id.startsWith('side-'))).toBe(false);
  });

  it('returns nothing for unknown keys or components', () => {
    expect(partsAffectedBy(inst('display-stand'), 'nope')).toEqual([]);
    expect(partsAffectedBy(inst('missing'), 'width')).toEqual([]);
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

  it('side rail front ends are trimmed to the rake angle, ending at the leg face', () => {
    const params = defaultParams(def);
    const model = def.generate(params);
    const rakeRun = ((params.depth as number) - (params.topDepth as number)) / (params.height as number);
    for (const rail of model.parts.filter((p) => p.name.startsWith('Side rail'))) {
      const prim = rail.primitives[0] as { size: [number, number, number]; endSkew?: number };
      expect(prim.endSkew ?? 0).toBeCloseTo(rakeRun * prim.size[2], 5);
      expect(rail.cut.length).toBeCloseTo(prim.size[1] + (prim.endSkew ?? 0), 5);
    }
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

describe('coastal end table', () => {
  const def = REGISTRY['coastal-end-table'];

  it('sides dovetail into the top only — square at the floor', () => {
    const base = defaultParams(def);
    const t = base.thickness as number;
    const H = base.height as number;
    const W = base.width as number;
    const model = def.generate(base);
    const side = model.parts.find((p) => p.id === 'side-1')!;
    const tails = side.primitives[0] as {
      shape: string;
      role?: string;
      length?: number;
      plainEnd?: string;
      jointDepth?: number;
    };
    expect(tails.shape).toBe('jointedBoard');
    expect(tails.role).toBe('tails');
    expect(tails.plainEnd).toBe('negative'); // bottom end runs square to the floor
    expect(tails.length).toBeCloseTo(H, 5);
    expect(tails.jointDepth).toBeCloseTo(t, 5);
    const top = model.parts.find((p) => p.id === 'top')!;
    const pins = top.primitives[0] as { role?: string; length?: number };
    expect(pins.role).toBe('pins');
    expect(pins.length).toBeCloseTo(W, 5);
  });

  it('drawer bay over open shelves; bottom shelf rides the toe space', () => {
    const base = defaultParams(def);
    const t = base.thickness as number;
    const H = base.height as number;
    const toe = base.toeSpace as number;
    const drawerH = base.drawerHeight as number;
    const model = def.generate(base);
    const bottom = model.parts.find((p) => p.id === 'bottom-shelf')!;
    expect((bottom.primitives[0] as { at: number[] }).at[2]).toBeCloseTo(toe + t / 2, 5);
    const drawerShelf = model.parts.find((p) => p.id === 'drawer-shelf')!;
    expect((drawerShelf.primitives[0] as { at: number[] }).at[2]).toBeCloseTo(
      H - t - drawerH - t / 2,
      5,
    );
    // Two bays at defaults → one intermediate fixed shelf, dovetailed box behind the front.
    expect(model.parts.find((p) => p.id === 'shelf-1')).toBeDefined();
    expect(model.parts.find((p) => p.id === 'drawer-front')).toBeDefined();
    const boxSide = model.parts.find((p) => p.id === 'drawer-side-1')!;
    expect((boxSide.primitives[0] as { joint?: string }).joint).toBe('dovetail');
  });

  it('half-blind option laps the top face and shortens the sides one lip', () => {
    const base = defaultParams(def);
    const H = base.height as number;
    const model = def.generate({ ...base, caseJoinery: 'half-blind-dovetail' });
    const side = model.parts.find((p) => p.id === 'side-1')!;
    const tails = side.primitives[0] as { length?: number; lip?: number };
    expect(tails.length).toBeCloseTo(H - HALF_BLIND_LIP, 5);
    expect(tails.lip).toBeCloseTo(HALF_BLIND_LIP, 5);
    const top = model.parts.find((p) => p.id === 'top')!;
    expect((top.primitives[0] as { lip?: number }).lip).toBeCloseTo(HALF_BLIND_LIP, 5);
  });
});

describe('entryway bench', () => {
  const def = REGISTRY['entry-bench'];

  it('builds the seat on four posts with aprons, a notched boot shelf, and rails', () => {
    const model = def.generate(defaultParams(def));
    const names = model.parts.map((p) => p.name);
    expect(names.filter((n) => n === 'Leg')).toHaveLength(4);
    expect(names.filter((n) => n === 'Seat')).toHaveLength(1);
    expect(names.filter((n) => n === 'Apron')).toHaveLength(2); // under the seat, front and back
    expect(names.filter((n) => n === 'End apron')).toHaveLength(2); // closing the frame at each end
    expect(names.filter((n) => n === 'Shelf rail')).toHaveLength(2); // under the shelf's front and back edges
    expect(names.filter((n) => n === 'Shelf end rail')).toHaveLength(2);
    const shelf = model.parts.find((p) => p.id === 'shelf')!;
    expect(shelf.primitives).toHaveLength(3); // center board + a tongue between each leg pair
    // The tongues keep the slab's grain running along the bench.
    for (const prim of shelf.primitives) {
      expect((prim as { grain?: string }).grain).toBe('x');
    }
  });

  it('shelf edges set back half a leg thickness from the leg faces', () => {
    const base = defaultParams(def);
    const model = def.generate(base);
    const W = base.width as number;
    const ovEnd = base.endOverhang as number;
    const legT = base.legThickness as number;
    const shelf = model.parts.find((p) => p.id === 'shelf')!;
    const xs = shelf.primitives.map(
      (pr) => (pr as { at: number[]; size: number[] }).at[0] + (pr as { size: number[] }).size[0] / 2,
    );
    expect(Math.max(...xs)).toBeCloseTo(W / 2 - ovEnd - legT / 2, 5);
    expect(shelf.cut.length).toBeCloseTo(W - 2 * ovEnd - legT, 5);
    // Aprons are centered on the legs: the apron's midplane lies on the leg
    // centerline (D/2 − front overhang − half a leg in from the seat edge).
    const apron = model.parts.find((p) => p.id === 'apron-1')!;
    const prim = apron.primitives[0] as { at: number[]; size: number[] };
    const D = base.depth as number;
    const ovFront = base.frontOverhang as number;
    expect(prim.at[1]).toBeCloseTo(D / 2 - ovFront - legT / 2, 5);
  });

  it('stands on the floor with the seat at the requested height', () => {
    const base = defaultParams(def);
    const box = modelBBox(def.generate(base))!;
    expect(box.min[2]).toBeCloseTo(0, 5);
    expect(box.max[2]).toBeCloseTo(base.height as number, 5);
  });
});

describe('tambour floating console', () => {
  const def = REGISTRY['tambour-console'];

  it('hangs on the wall: slabs at mount height, cleat behind, stud warning', () => {
    const base = defaultParams(def);
    const mount = base.mountHeight as number;
    const H = base.height as number;
    const model = def.generate(base);
    const box = modelBBox(model)!;
    expect(box.max[2]).toBeCloseTo(mount, 5);
    expect(box.min[2]).toBeCloseTo(mount - H, 5);
    expect(model.parts.find((p) => p.id === 'cleat')).toBeDefined();
    expect(model.findings.some((f) => f.message.includes('stud'))).toBe(true);
  });

  it('reeds wrap front, corners, and ends inside the slab outline', () => {
    const base = defaultParams(def);
    const W = base.width as number;
    const D = base.depth as number;
    const inset = base.slatInset as number;
    const slatW = base.slatWidth as number;
    const model = def.generate(base);
    const reeds = model.parts.filter((p) => p.name === 'Tambour reed');
    // Enough reeds to cover the front run plus both corners and end runs.
    expect(reeds.length * slatW).toBeGreaterThan(W * 0.95);
    for (const r of reeds) {
      const prim = r.primitives[0] as { at: [number, number, number]; radiusTop: number };
      // Every reed's outer surface stays at or behind the slat inset line.
      expect(prim.at[1] + prim.radiusTop).toBeLessThanOrEqual(D / 2 - inset + 1e-6);
      expect(Math.abs(prim.at[0]) + prim.radiusTop).toBeLessThanOrEqual(W / 2 - inset + 1e-6);
    }
  });

  it('slabs carry the rounded corners; reeds scale with width', () => {
    const base = defaultParams(def);
    const model = def.generate(base);
    const top = model.parts.find((p) => p.id === 'top')!;
    const slab = top.primitives[0] as { shape: string; radius?: number };
    expect(slab.shape).toBe('roundedSlab');
    expect(slab.radius).toBeCloseTo(base.cornerRadius as number, 5);
    const count = (w: number) =>
      def.generate({ ...base, width: w }).parts.filter((p) => p.name === 'Tambour reed').length;
    expect(count(inch(90))).toBeGreaterThan(count(inch(48)));
  });
});

describe('rounded slab edge roundover', () => {
  const def = REGISTRY['tambour-console'];

  it('slabs carry the edge roundover and it never exceeds half the stock', () => {
    const base = defaultParams(def);
    const model = def.generate(base);
    const top = model.parts.find((p) => p.id === 'top')!;
    const slab = top.primitives[0] as { edge?: number };
    expect(slab.edge).toBeCloseTo(base.edgeRadius as number, 5);
    const thin = def.generate({ ...base, slabThickness: inch(0.75), edgeRadius: inch(0.5) });
    const thinSlab = thin.parts.find((p) => p.id === 'top')!.primitives[0] as { edge?: number };
    expect(thinSlab.edge!).toBeLessThan(inch(0.75) / 2);
  });
});

describe('art-back entry shelf', () => {
  const def = REGISTRY['art-back-shelf'];

  it('frames the art between pilasters under an overhanging eased shelf', () => {
    const base = defaultParams(def);
    const L = base.length as number;
    const ov = base.overhang as number;
    const stileW = base.stileWidth as number;
    const model = def.generate(base);
    const shelf = model.parts.find((p) => p.id === 'shelf')!;
    expect(shelf.primitives[0].shape).toBe('roundedSlab');
    const stiles = model.parts.filter((p) => p.name === 'Stile');
    expect(stiles).toHaveLength(2);
    expect(stiles[0].primitives).toHaveLength(2); // stile + stepped base block
    const stileOuter = Math.max(
      ...stiles.map((s) => Math.abs((s.primitives[0] as { at: number[] }).at[0]) + stileW / 2),
    );
    expect(stileOuter).toBeCloseTo(L / 2 - ov, 5); // shelf overhangs the frame
    const art = model.parts.find((p) => p.id === 'art')!;
    expect(art.material).toBe(base.artMaterial);
    expect(art.cut.length).toBeCloseTo(L - 2 * ov - 2 * stileW, 5); // full-bleed field
  });

  it('hangs at mount height with hooks on the rail and warns when crowded', () => {
    const base = defaultParams(def);
    const model = def.generate(base);
    const box = modelBBox(model)!;
    expect(box.max[2]).toBeCloseTo(base.mountHeight as number, 1);
    expect(box.min[2]).toBeGreaterThan(0);
    expect(model.parts.filter((p) => p.name === 'Hook')).toHaveLength(4);
    const crowded = def.generate({ ...base, length: inch(24), hooks: 6 });
    expect(crowded.findings.some((f) => f.message.includes('crowd'))).toBe(true);
  });
});

describe('drawer box undermount notches', () => {
  const def = REGISTRY['drawer-box'];

  it('notches the bottom back corners only for undermount slides', () => {
    const base = defaultParams(def);
    const side = def.generate({ ...base, slideType: 'side-mount' }).parts.find((p) => p.id === 'bottom')!;
    expect(side.primitives).toHaveLength(1); // plain panel
    const under = def.generate({ ...base, slideType: 'undermount' }).parts.find((p) => p.id === 'bottom')!;
    expect(under.primitives).toHaveLength(2); // front portion + back-center strip (corners notched)
    expect(under.name).toContain('undermount');
    // The back strip is narrower than the full panel (the notches).
    const widths = under.primitives.map((pr) => (pr as { size: number[] }).size[0]).sort((a, b) => a - b);
    expect(widths[0]).toBeLessThan(widths[1]);
  });
});
