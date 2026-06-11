/**
 * Converts a furniture spec into a neutral list of parts (name, shape, size,
 * position). The same layout feeds both the 3D geometry builder and the
 * build-plan generator, so the render and the cut list can never disagree.
 *
 * Coordinate system: y-up, origin at the center of the footprint on the floor.
 * All values in millimeters.
 */

import type {
  BookshelfSpec,
  CabinetDoorSpec,
  CabinetSpec,
  DrawerBoxSpec,
  DrawerFrontSpec,
  DrawerUnitSpec,
  EdgeProfile,
  FrontStyle,
  FurnitureSpec,
  RaiseProfile,
  TableSpec,
} from './spec.js';
import { validateSpec } from './spec.js';

export type PartShape = 'box' | 'cylinder' | 'taperedLeg';

type EdgeProfileName = Exclude<EdgeProfile, 'square'>;

export type PartRole = 'structure' | 'surface' | 'panel' | 'hardware' | 'glass';

export interface Part {
  /** Human-readable part name; identical parts share a name (e.g. "Leg"). */
  name: string;
  shape: PartShape;
  /**
   * Bounding size [x, y, z] in mm. For cylinders and tapered legs, x and z are
   * the (largest) diameter and y is the length.
   */
  sizeMm: [number, number, number];
  /** Center of the part in mm. */
  positionMm: [number, number, number];
  /** Euler rotation in radians, applied XYZ. */
  rotationRad?: [number, number, number];
  role: PartRole;
  /** Axis the wood grain runs along, for the cut list. */
  grainAxis: 'x' | 'y' | 'z';
  /**
   * Renders interlocking corner joinery on the board ends (the cut list is
   * unaffected — joinery lives within the board's nominal dimensions).
   * Tails boards show tail end-grain on the mating face; pins boards carry
   * the complementary pins. `matingThicknessMm` is the joint depth.
   */
  joinery?: {
    type: 'dovetail' | 'boxjoint';
    role: 'tails' | 'pins';
    matingThicknessMm: number;
    /** For pins boards: which z face is the outside of the box. */
    pinsOuterSign?: 1 | -1;
  };
  /**
   * Renders a raised-panel profile on the front face: a flat tongue at the
   * edges (hidden in the frame grooves), a profiled raise, and a proud flat
   * field. The cut list keeps the part's nominal dimensions.
   */
  raisedPanel?: {
    profile: RaiseProfile;
    raiseWidthMm: number;
    /** Tongue thickness at the panel edge (fits the frame groove). */
    tongueThicknessMm: number;
  };
  /** Finger-scoop cutout on a board's top edge (drawer-box fronts). */
  scoop?: { widthMm: number; depthMm: number };
  /**
   * Panel sitting recessed inside a frame: bakes contact shading (ambient
   * occlusion) that darkens toward the frame on all four sides.
   * `overlapMm` is hidden in the grooves; shading fades over `reachMm`.
   */
  frameRecess?: { overlapMm: number; reachMm: number };
  /**
   * Edge details on a member's front face. `inner` is the cope & pattern
   * profile toward the panel opening; `outer` is the door-edge detail on
   * the outside of the door. axis 'slab' profiles the outer edge around
   * all four sides of a slab front.
   */
  edgeProfile?: {
    inner?: EdgeProfileName;
    outer?: EdgeProfileName;
    /** Which local side faces the opening: 'x+' | 'x-' | 'y+' | 'y-'. */
    innerSide?: 'x+' | 'x-' | 'y+' | 'y-';
    axis: 'x' | 'y' | 'slab';
    /** The inner pattern stops this far from each end (the cope line). */
    innerInsetMm?: number;
    /** 45°-mitered member ends (mitered frame construction). */
    miterEnds?: boolean;
    /** Cope & stick: end faces show the groove + profile cross-section. */
    stickGroove?: boolean;
    /** Coped rail ends: stub tenons of this length are included in sizeMm. */
    copeTenonMm?: number;
  };
}

export interface FurnitureLayout {
  spec: FurnitureSpec;
  parts: Part[];
  /** Overall bounding size [x, y, z] in mm. */
  overallMm: [number, number, number];
}

export function buildLayout(spec: FurnitureSpec): FurnitureLayout {
  validateSpec(spec);
  switch (spec.kind) {
    case 'table':
      return tableLayout(spec);
    case 'bookshelf':
      return bookshelfLayout(spec);
    case 'cabinet':
      return cabinetLayout(spec);
    case 'drawerbox':
      return drawerBoxLayout(spec);
    case 'door':
    case 'drawerfront':
      return frontPanelLayout(spec);
    case 'drawerunit':
      return drawerUnitLayout(spec);
  }
}

function tableLayout(spec: TableSpec): FurnitureLayout {
  const parts: Part[] = [];
  const { widthMm: w, depthMm: d, heightMm: h } = spec;
  const legH = h - spec.topThicknessMm;
  const legT = spec.legThicknessMm;

  parts.push({
    name: 'Tabletop',
    shape: 'box',
    sizeMm: [w, spec.topThicknessMm, d],
    positionMm: [0, h - spec.topThicknessMm / 2, 0],
    role: 'surface',
    grainAxis: 'x',
  });

  const legShape: PartShape =
    spec.legStyle === 'round' ? 'cylinder' : spec.legStyle === 'tapered' ? 'taperedLeg' : 'box';
  const lx = w / 2 - spec.legInsetMm - legT / 2;
  const lz = d / 2 - spec.legInsetMm - legT / 2;
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    parts.push({
      name: 'Leg',
      shape: legShape,
      sizeMm: [legT, legH, legT],
      positionMm: [sx * lx, legH / 2, sz * lz],
      role: 'structure',
      grainAxis: 'y',
    });
  }

  if (spec.apron) {
    const railT = 22;
    const railY = h - spec.topThicknessMm - spec.apronHeightMm / 2;
    const longRail = w - 2 * spec.legInsetMm - 2 * legT;
    const shortRail = d - 2 * spec.legInsetMm - 2 * legT;
    for (const sz of [1, -1]) {
      parts.push({
        name: 'Apron rail (long)',
        shape: 'box',
        sizeMm: [longRail, spec.apronHeightMm, railT],
        positionMm: [0, railY, sz * (lz + legT / 2 - railT / 2)],
        role: 'structure',
        grainAxis: 'x',
      });
    }
    for (const sx of [1, -1]) {
      parts.push({
        name: 'Apron rail (short)',
        shape: 'box',
        sizeMm: [railT, spec.apronHeightMm, shortRail],
        positionMm: [sx * (lx + legT / 2 - railT / 2), railY, 0],
        role: 'structure',
        grainAxis: 'z',
      });
    }
  }

  return { spec, parts, overallMm: [w, h, d] };
}

function bookshelfLayout(spec: BookshelfSpec): FurnitureLayout {
  const parts: Part[] = [];
  const { widthMm: w, heightMm: h, depthMm: d, stockThicknessMm: t } = spec;
  const backT = spec.backPanel ? 6 : 0;
  const caseDepth = d - backT;

  for (const sx of [1, -1]) {
    parts.push({
      name: 'Side panel',
      shape: 'box',
      sizeMm: [t, h, caseDepth],
      positionMm: [sx * (w / 2 - t / 2), h / 2, backT / 2],
      role: 'structure',
      grainAxis: 'y',
    });
  }

  const innerW = w - 2 * t;
  parts.push({
    name: 'Top panel',
    shape: 'box',
    sizeMm: [innerW, t, caseDepth],
    positionMm: [0, h - t / 2, backT / 2],
    role: 'structure',
    grainAxis: 'x',
  });
  parts.push({
    name: 'Bottom panel',
    shape: 'box',
    sizeMm: [innerW, t, caseDepth],
    positionMm: [0, t / 2, backT / 2],
    role: 'structure',
    grainAxis: 'x',
  });

  const interiorH = h - 2 * t;
  const openings = spec.shelfCount + 1;
  const pitch = (interiorH - spec.shelfCount * t) / openings;
  for (let i = 1; i <= spec.shelfCount; i++) {
    const y = t + i * pitch + (i - 0.5) * t;
    parts.push({
      name: 'Shelf',
      shape: 'box',
      sizeMm: [innerW, t, caseDepth - 20],
      positionMm: [0, y, backT / 2 + 10],
      role: 'surface',
      grainAxis: 'x',
    });
  }

  if (spec.backPanel) {
    parts.push({
      name: 'Back panel',
      shape: 'box',
      sizeMm: [w, h, backT],
      positionMm: [0, h / 2, -d / 2 + backT / 2],
      role: 'panel',
      grainAxis: 'y',
    });
  }

  return { spec, parts, overallMm: [w, h, d] };
}

function cabinetLayout(spec: CabinetSpec): FurnitureLayout {
  const parts: Part[] = [];
  const { widthMm: w, heightMm: h, depthMm: d, stockThicknessMm: t } = spec;
  const legH = spec.legHeightMm;
  const caseH = h - legH;
  const backT = 6;
  const doorT = 18;
  const caseDepth = d - backT - doorT;
  const caseZ = (backT - doorT) / 2; // case centered between back panel and doors

  for (const sx of [1, -1]) {
    parts.push({
      name: 'Side panel',
      shape: 'box',
      sizeMm: [t, caseH, caseDepth],
      positionMm: [sx * (w / 2 - t / 2), legH + caseH / 2, caseZ],
      role: 'structure',
      grainAxis: 'y',
    });
  }

  const innerW = w - 2 * t;
  const topOverhang = 20;
  parts.push({
    name: 'Top',
    shape: 'box',
    sizeMm: [w + 2 * topOverhang, t, d + topOverhang],
    positionMm: [0, h + t / 2, topOverhang / 2],
    role: 'surface',
    grainAxis: 'x',
  });
  parts.push({
    name: 'Bottom panel',
    shape: 'box',
    sizeMm: [innerW, t, caseDepth],
    positionMm: [0, legH + t / 2, caseZ],
    role: 'structure',
    grainAxis: 'x',
  });
  parts.push({
    name: 'Top stretcher',
    shape: 'box',
    sizeMm: [innerW, t, caseDepth],
    positionMm: [0, legH + caseH - t / 2, caseZ],
    role: 'structure',
    grainAxis: 'x',
  });
  parts.push({
    name: 'Interior shelf',
    shape: 'box',
    sizeMm: [innerW, t, caseDepth - 20],
    positionMm: [0, legH + caseH / 2, caseZ + 10],
    role: 'surface',
    grainAxis: 'x',
  });
  parts.push({
    name: 'Back panel',
    shape: 'box',
    sizeMm: [w, caseH, backT],
    positionMm: [0, legH + caseH / 2, -d / 2 + backT / 2],
    role: 'panel',
    grainAxis: 'x',
  });

  const gap = 3;
  const doorW = (w - gap * (spec.doorCount + 1)) / spec.doorCount;
  const doorH = caseH - 2 * gap;
  const doorZ = d / 2 - doorT / 2;
  for (let i = 0; i < spec.doorCount; i++) {
    const x = -w / 2 + gap + doorW / 2 + i * (doorW + gap);
    parts.push({
      name: 'Door',
      shape: 'box',
      sizeMm: [doorW, doorH, doorT],
      positionMm: [x, legH + gap + doorH / 2, doorZ],
      role: 'panel',
      grainAxis: 'y',
    });
    // Handle near the inner edge of each door, at comfortable height.
    const towardCenter = x <= 0 ? 1 : -1;
    parts.push({
      name: 'Handle',
      shape: 'cylinder',
      sizeMm: [12, 110, 12],
      positionMm: [x + towardCenter * (doorW / 2 - 35), legH + caseH * 0.55, doorZ + doorT / 2 + 18],
      role: 'hardware',
      grainAxis: 'y',
    });
  }

  if (legH > 0) {
    const legT = 35;
    const inset = 25;
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      parts.push({
        name: 'Leg',
        shape: 'taperedLeg',
        sizeMm: [legT, legH, legT],
        positionMm: [sx * (w / 2 - inset - legT / 2), legH / 2, sz * (d / 2 - inset - legT / 2)],
        role: 'structure',
        grainAxis: 'y',
      });
    }
  }

  return { spec, parts, overallMm: [w + 2 * topOverhang, h + t, d + topOverhang] };
}

function drawerBoxLayout(spec: DrawerBoxSpec): FurnitureLayout {
  const parts: Part[] = [];
  const { widthMm: w, depthMm: d, heightMm: h, stockThicknessMm: t } = spec;
  const halfblind = spec.joinery === 'halfblind';
  const through = spec.joinery === 'dovetail' || spec.joinery === 'boxjoint';
  // Half-blind tails stop 6mm short of the front face (clean show face);
  // the joint reads from above and inside.
  const lip = 6;
  const scoop = spec.scoop
    ? { widthMm: Math.min(120, w * 0.35), depthMm: Math.min(32, h * 0.4) }
    : undefined;

  for (const sx of [1, -1]) {
    parts.push({
      name: 'Drawer side',
      shape: 'box',
      sizeMm: [t, h, halfblind ? d - lip : d],
      positionMm: [sx * (w / 2 - t / 2), h / 2, halfblind ? -lip / 2 : 0],
      role: 'structure',
      grainAxis: 'z',
      joinery: through
        ? { type: spec.joinery as 'dovetail' | 'boxjoint', role: 'tails', matingThicknessMm: t }
        : halfblind
          ? { type: 'dovetail', role: 'tails', matingThicknessMm: t - lip }
          : undefined,
    });
  }
  for (const sz of [1, -1]) {
    parts.push({
      name: sz > 0 ? 'Drawer front (box)' : 'Drawer back (box)',
      shape: 'box',
      // Through-jointed and half-blind fronts/backs run the full width;
      // dadoed ones sit between the sides.
      sizeMm: [spec.joinery === 'dado' ? w - 2 * t : w, h, t],
      positionMm: [0, h / 2, sz * (d / 2 - t / 2)],
      role: 'structure',
      grainAxis: 'x',
      joinery: through
        ? {
            type: spec.joinery as 'dovetail' | 'boxjoint',
            role: 'pins',
            matingThicknessMm: t,
            pinsOuterSign: sz as 1 | -1,
          }
        : undefined,
      scoop: sz > 0 ? scoop : undefined,
    });
  }
  // Bottom rides in a groove ~12mm above the lower edge.
  parts.push({
    name: 'Drawer bottom',
    shape: 'box',
    sizeMm: [w - 2 * t + 12, spec.bottomThicknessMm, d - 2 * t + 12],
    positionMm: [0, 12 + spec.bottomThicknessMm / 2, 0],
    role: 'panel',
    grainAxis: 'x',
  });

  return { spec, parts, overallMm: [w, h, d] };
}

/**
 * Emits the parts of one door/drawer-front face at the given center.
 * Shaker fronts are five pieces: two stiles, two rails, and a floating
 * panel (cut 10mm oversize on each edge to sit in the frame grooves).
 */
function pushFrontParts(
  parts: Part[],
  options: {
    style: FrontStyle;
    widthMm: number;
    heightMm: number;
    thicknessMm: number;
    railStileWidthMm: number;
    panelThicknessMm: number;
    raiseProfile?: RaiseProfile;
    raiseWidthMm?: number;
    edgeProfile?: EdgeProfile;
    outerEdgeProfile?: EdgeProfile;
    frameJoint?: 'cope' | 'miter';
    glassPanel?: boolean;
    centerXMm: number;
    bottomYMm: number;
    centerZMm: number;
    namePrefix: string;
    slabGrain: 'x' | 'y';
  },
): void {
  const { style, widthMm: w, heightMm: h, thicknessMm: t, railStileWidthMm: rsw } = options;
  const { centerXMm: cx, bottomYMm: y0, centerZMm: cz, namePrefix } = options;
  const pattern = (
    options.edgeProfile && options.edgeProfile !== 'square' ? options.edgeProfile : undefined
  ) as EdgeProfileName | undefined;
  const outer = (
    options.outerEdgeProfile && options.outerEdgeProfile !== 'square'
      ? options.outerEdgeProfile
      : undefined
  ) as EdgeProfileName | undefined;
  const miter = options.frameJoint === 'miter';
  if (style === 'slab') {
    parts.push({
      name: `${namePrefix}`,
      shape: 'box',
      sizeMm: [w, h, t],
      positionMm: [cx, y0 + h / 2, cz],
      role: 'panel',
      grainAxis: options.slabGrain,
      edgeProfile: outer ? { outer, axis: 'slab' } : undefined,
    });
    return;
  }
  for (const sx of [1, -1]) {
    parts.push({
      name: `${namePrefix} stile`,
      shape: 'box',
      sizeMm: [rsw, h, t],
      positionMm: [cx + sx * (w / 2 - rsw / 2), y0 + h / 2, cz],
      role: 'structure',
      grainAxis: 'y',
      edgeProfile: {
        inner: pattern,
        outer,
        innerSide: sx > 0 ? 'x-' : 'x+',
        axis: 'y',
        // The stick cut runs the stile's full length; the rail copes onto it.
        innerInsetMm: 0,
        miterEnds: miter,
        stickGroove: !miter,
      },
    });
  }
  for (const top of [0, 1]) {
    parts.push({
      name: `${namePrefix} rail`,
      shape: 'box',
      // Mitered rails run the full door width (long-point length); coped
      // rails are cut long by a 10mm stub tenon each end.
      sizeMm: [miter ? w : w - 2 * rsw + 20, rsw, t],
      positionMm: [cx, y0 + (top ? h - rsw / 2 : rsw / 2), cz],
      role: 'structure',
      grainAxis: 'x',
      edgeProfile: {
        inner: pattern,
        outer,
        innerSide: top ? 'y-' : 'y+',
        axis: 'x',
        innerInsetMm: 0,
        miterEnds: miter,
        // Coped rails are cut long; the visible body stops at the stick.
        copeTenonMm: miter ? undefined : 10,
      },
    });
  }
  if (options.glassPanel) {
    // Glass pane sits in a back rabbet with retainer strips; the pane is
    // cut 12mm larger than the opening on each edge.
    parts.push({
      name: `${namePrefix} glass`,
      shape: 'box',
      sizeMm: [w - 2 * rsw + 24, h - 2 * rsw + 24, 4],
      positionMm: [cx, y0 + h / 2, cz + t / 2 - 10],
      role: 'glass',
      grainAxis: options.slabGrain,
      frameRecess: { overlapMm: 12, reachMm: 16 },
    });
    return;
  }
  // Floating panel: shaker panels sit recessed ~6mm; raised panels run
  // flush with the frame face and carry the profiled raise.
  const pt = options.panelThicknessMm;
  const raised = style === 'raised';
  parts.push({
    name: `${namePrefix} panel`,
    shape: 'box',
    sizeMm: [w - 2 * rsw + 20, h - 2 * rsw + 20, pt],
    positionMm: [cx, y0 + h / 2, raised ? cz + (t - pt) / 2 : cz + t / 2 - 6 - pt / 2],
    role: 'panel',
    grainAxis: options.slabGrain,
    frameRecess: { overlapMm: 10, reachMm: raised ? 14 : 20 },
    raisedPanel: raised
      ? {
          profile: options.raiseProfile ?? 'cove',
          raiseWidthMm: options.raiseWidthMm ?? 38,
          tongueThicknessMm: 6,
        }
      : undefined,
  });
}

function frontPanelLayout(spec: CabinetDoorSpec | DrawerFrontSpec): FurnitureLayout {
  const parts: Part[] = [];
  pushFrontParts(parts, {
    style: spec.style,
    widthMm: spec.widthMm,
    heightMm: spec.heightMm,
    thicknessMm: spec.thicknessMm,
    railStileWidthMm: spec.railStileWidthMm,
    panelThicknessMm: spec.panelThicknessMm,
    raiseProfile: spec.raiseProfile,
    raiseWidthMm: spec.raiseWidthMm,
    edgeProfile: spec.edgeProfile,
    outerEdgeProfile: spec.outerEdgeProfile,
    frameJoint: spec.frameJoint,
    glassPanel: spec.kind === 'door' ? spec.glassPanel : undefined,
    centerXMm: 0,
    bottomYMm: 0,
    centerZMm: 0,
    namePrefix: spec.kind === 'door' ? 'Door' : 'Front',
    // Doors run grain vertically; drawer fronts horizontally.
    slabGrain: spec.kind === 'door' ? 'y' : 'x',
  });
  return { spec, parts, overallMm: [spec.widthMm, spec.heightMm, spec.thicknessMm] };
}

function drawerUnitLayout(spec: DrawerUnitSpec): FurnitureLayout {
  const parts: Part[] = [];
  const { widthMm: w, heightMm: h, depthMm: d, stockThicknessMm: t } = spec;
  const backT = 6;
  const frontT = 19;
  const inset = spec.frontMount === 'inset';
  const reveal = inset ? 2 : 3;
  const slideClearance = 13; // per side, for standard side-mount slides
  // Overlay fronts hang in front of the carcass; inset fronts live inside
  // it, flush with the carcass front edge.
  const caseDepth = inset ? d : d - frontT;
  const caseFrontZ = d / 2; // carcass front face (after any overlay offset)
  const caseOffsetZ = inset ? 0 : -frontT / 2;
  const innerDepth = caseDepth - backT;

  for (const sx of [1, -1]) {
    parts.push({
      name: 'Side panel',
      shape: 'box',
      sizeMm: [t, h, caseDepth],
      positionMm: [sx * (w / 2 - t / 2), h / 2, caseOffsetZ],
      role: 'structure',
      grainAxis: 'y',
    });
  }
  const innerW = w - 2 * t;
  const caseZ = caseOffsetZ + backT / 2;
  for (const top of [0, 1]) {
    parts.push({
      name: top ? 'Top panel' : 'Bottom panel',
      shape: 'box',
      sizeMm: [innerW, t, innerDepth],
      positionMm: [0, top ? h - t / 2 : t / 2, caseZ],
      role: 'structure',
      grainAxis: 'x',
    });
  }
  parts.push({
    name: 'Back panel',
    shape: 'box',
    sizeMm: [w, h, backT],
    positionMm: [0, h / 2, -d / 2 + backT / 2],
    role: 'panel',
    grainAxis: 'y',
  });

  const n = spec.drawerCount;
  const undermount = spec.slideType === 'undermount';
  const boxT = spec.boxStockThicknessMm;
  const boxW = w - 2 * t - 2 * (undermount ? 5 : slideClearance);
  const boxD = Math.min(innerDepth - 25, Math.floor((innerDepth - 25) / 50) * 50);
  const boxLift = undermount ? 16 : 10;

  // Inset banks show divider rails between the openings; overlay fronts
  // cover the carcass so none are needed.
  const railH = 20;
  const interiorH = h - 2 * t;
  const openingH = inset ? (interiorH - (n - 1) * railH) / n : (h - 4 - 3 * (n - 1)) / n;
  const frontW = inset ? innerW - 2 * reveal : w - 4;
  const frontH = inset ? openingH - 2 * reveal : openingH;
  const frontZ = inset ? d / 2 - frontT / 2 : d / 2 - frontT / 2;

  for (let i = 0; i < n; i++) {
    const openingBottom = inset ? t + i * (openingH + railH) : 2 + i * (openingH + 3);
    const y0 = openingBottom + (inset ? reveal : 0);

    if (inset && i > 0) {
      parts.push({
        name: 'Divider rail',
        shape: 'box',
        sizeMm: [innerW, railH, frontT],
        positionMm: [0, openingBottom - railH / 2, caseFrontZ - frontT / 2],
        role: 'structure',
        grainAxis: 'x',
      });
    }

    pushFrontParts(parts, {
      style: spec.frontStyle,
      widthMm: frontW,
      heightMm: frontH,
      thicknessMm: frontT,
      railStileWidthMm: 50,
      panelThicknessMm: spec.frontStyle === 'raised' ? 16 : 6,
      raiseProfile: spec.raiseProfile,
      raiseWidthMm: 32,
      edgeProfile: spec.edgeProfile,
      outerEdgeProfile: spec.outerEdgeProfile,
      frameJoint: spec.frameJoint,
      centerXMm: 0,
      bottomYMm: y0,
      centerZMm: frontZ,
      namePrefix: 'Drawer front',
      slabGrain: 'x',
    });

    const boxY0 = openingBottom + boxLift;
    const boxH = Math.max(60, openingH - (undermount ? 38 : 30));
    const boxZ = d / 2 - frontT - boxD / 2 - 5;
    for (const sx of [1, -1]) {
      parts.push({
        name: 'Drawer side',
        shape: 'box',
        sizeMm: [boxT, boxH, boxD],
        positionMm: [sx * (boxW / 2 - boxT / 2), boxY0 + boxH / 2, boxZ],
        role: 'structure',
        grainAxis: 'z',
      });
    }
    for (const sz of [1, -1]) {
      parts.push({
        name: sz > 0 ? 'Drawer box front' : 'Drawer box back',
        shape: 'box',
        sizeMm: [boxW - 2 * boxT, boxH, boxT],
        positionMm: [0, boxY0 + boxH / 2, boxZ + sz * (boxD / 2 - boxT / 2)],
        role: 'structure',
        grainAxis: 'x',
      });
    }
    parts.push({
      name: 'Drawer bottom',
      shape: 'box',
      sizeMm: [boxW - 2 * boxT + 12, 6, boxD - 2 * boxT + 12],
      positionMm: [0, boxY0 + 12 + 3, boxZ],
      role: 'panel',
      grainAxis: 'x',
    });
  }

  return { spec, parts, overallMm: [w, h, d] };
}
