/**
 * Generates a woodworking build plan — cut list, hardware, tools, and
 * step-by-step assembly workflow — from the same part layout used to render
 * the piece, so the plan always matches what is on screen.
 */

import type { FurnitureLayout, Part } from '../parametric/layout.js';
import { buildLayout } from '../parametric/layout.js';
import type { FurnitureSpec } from '../parametric/spec.js';
import { formatInches } from '../units.js';

export interface CutListItem {
  part: string;
  quantity: number;
  /** Length × width × thickness in mm, length along the grain. */
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  /** The same dimensions as fractional inches (nearest 1/16"). */
  lengthIn: string;
  widthIn: string;
  thicknessIn: string;
  notes?: string;
}

export interface HardwareItem {
  item: string;
  quantity: number;
}

export interface BuildStep {
  title: string;
  detail: string;
}

export interface BuildPlan {
  title: string;
  overview: string;
  overallDimensionsMm: { width: number; height: number; depth: number };
  /** Overall size as fractional inches (nearest 1/16"). */
  overallDimensionsIn: { width: string; height: string; depth: string };
  cutList: CutListItem[];
  hardware: HardwareItem[];
  tools: string[];
  steps: BuildStep[];
  /** Rough lumber requirement (solid-wood parts only). */
  boardFeet: number;
  estimatedHours: { min: number; max: number };
}

export function generateBuildPlan(spec: FurnitureSpec): BuildPlan {
  const layout = buildLayout(spec);
  const cutList = buildCutList(layout);
  const [w, h, d] = layout.overallMm;
  return {
    title: spec.name ?? `Custom ${spec.kind}`,
    overview: overviewFor(layout),
    overallDimensionsMm: { width: w, height: h, depth: d },
    overallDimensionsIn: {
      width: formatInches(w),
      height: formatInches(h),
      depth: formatInches(d),
    },
    cutList,
    hardware: hardwareFor(layout),
    tools: toolsFor(layout),
    steps: stepsFor(layout),
    boardFeet: boardFeetFor(layout),
    estimatedHours: estimateHours(layout),
  };
}

function buildCutList(layout: FurnitureLayout): CutListItem[] {
  const grouped = new Map<string, CutListItem>();
  for (const part of layout.parts) {
    if (part.role === 'hardware') continue;
    const dims = orientToGrain(part);
    const key = `${part.name}|${dims.join('x')}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      grouped.set(key, {
        part: part.name,
        quantity: 1,
        lengthMm: dims[0],
        widthMm: dims[1],
        thicknessMm: dims[2],
        lengthIn: formatInches(dims[0]),
        widthIn: formatInches(dims[1]),
        thicknessIn: formatInches(dims[2]),
        notes: part.role === 'glass'
          ? 'Glass — order tempered from supplier'
          : part.fingerPullTop
            ? `Finger-pull channel routed along the top edge (Freeborn 57-024 style)${part.edgeProfile?.outer ? `; ${part.edgeProfile.outer} door-edge detail, sides and bottom` : ''}`
          : part.scoop
            ? `Finger scoop ${Math.round(part.scoop.widthMm)} × ${Math.round(part.scoop.depthMm)}mm in top edge`
            : part.raisedPanel
            ? `Raised panel — ${part.raisedPanel.profile} profile, ${part.raisedPanel.raiseWidthMm}mm raise`
            : part.edgeProfile
              ? [
                  part.edgeProfile.miterEnds && '45° mitered ends (long-point length)',
                  part.edgeProfile.inner &&
                    `${part.edgeProfile.inner} pattern, inner edge${part.edgeProfile.miterEnds ? '' : ' (cope & pattern T&G)'}`,
                  part.edgeProfile.copeTenonMm &&
                    `coped ends — length includes ${part.edgeProfile.copeTenonMm}mm stub tenons`,
                  part.edgeProfile.outer && `${part.edgeProfile.outer} door-edge detail, outer edge`,
                ]
                  .filter(Boolean)
                  .join('; ')
              : part.shape === 'taperedLeg'
                ? 'Taper to 60% at the foot'
                : part.shape === 'cylinder'
                  ? 'Turned round'
                  : undefined,
      });
    }
  }
  return [...grouped.values()].sort((a, b) => b.lengthMm * b.widthMm - a.lengthMm * a.widthMm);
}

/** Returns [length (grain), width, thickness] in mm. */
function orientToGrain(part: Part): [number, number, number] {
  const [x, y, z] = part.sizeMm;
  const byAxis: Record<'x' | 'y' | 'z', [number, number, number]> = {
    x: [x, z, y],
    y: [y, x, z],
    z: [z, x, y],
  };
  const [length, a, b] = byAxis[part.grainAxis];
  return [round1(length), round1(Math.max(a, b)), round1(Math.min(a, b))];
}

function boardFeetFor(layout: FurnitureLayout): number {
  // 1 board foot = 144 cubic inches; count solid-wood parts (panels of 6mm or
  // less are assumed to be sheet goods).
  let cubicMm = 0;
  for (const part of layout.parts) {
    if (part.role === 'hardware' || part.role === 'glass') continue;
    const [x, y, z] = part.sizeMm;
    if (Math.min(x, y, z) <= 6) continue;
    cubicMm += x * y * z;
  }
  const cubicInches = cubicMm / 16387.064;
  return Math.round((cubicInches / 144) * 1.2 * 10) / 10; // +20% waste allowance
}

function hardwareFor(layout: FurnitureLayout): HardwareItem[] {
  const spec = layout.spec;
  const items: HardwareItem[] = [];
  switch (spec.kind) {
    case 'table':
      items.push({ item: 'Figure-8 tabletop fasteners', quantity: 8 });
      if (spec.apron) {
        items.push({ item: 'Corner brackets with lag screws', quantity: 4 });
        items.push({ item: '8mm × 40mm dowels (apron-to-leg joints)', quantity: 16 });
      } else {
        items.push({ item: 'Threaded leg-mounting plates', quantity: 4 });
      }
      items.push({ item: 'Wood glue (250ml)', quantity: 1 });
      break;
    case 'bookshelf': {
      items.push({ item: '8mm × 40mm dowels or confirmat screws', quantity: 16 });
      if (spec.shelfCount > 0) {
        items.push({ item: '5mm shelf pins', quantity: spec.shelfCount * 4 });
      }
      if (spec.backPanel) {
        items.push({ item: '16mm panel nails or staples', quantity: 24 });
      }
      items.push({ item: 'Wood glue (250ml)', quantity: 1 });
      break;
    }
    case 'cabinet': {
      items.push({ item: 'Concealed euro hinges (pair per door)', quantity: spec.doorCount * 2 });
      items.push({ item: 'Door handles', quantity: spec.doorCount });
      items.push({ item: '8mm × 40mm dowels or confirmat screws', quantity: 20 });
      items.push({ item: '5mm shelf pins', quantity: 4 });
      items.push({ item: '16mm panel nails or staples', quantity: 24 });
      if (spec.legHeightMm > 0) {
        items.push({ item: 'Threaded leg-mounting plates', quantity: 4 });
      }
      items.push({ item: 'Wood glue (250ml)', quantity: 1 });
      break;
    }
    case 'drawerbox': {
      if (spec.joinery === 'dado') {
        items.push({ item: '16mm brads (for dado joints)', quantity: 16 });
      }
      items.push({ item: 'Wood glue (250ml)', quantity: 1 });
      break;
    }
    case 'door': {
      if (spec.hingeBoring) {
        items.push({ item: 'Concealed euro hinges (pair)', quantity: 2 });
      }
      if (spec.glassPanel && spec.style !== 'slab') {
        items.push({ item: 'Glass retainer strips (or glazing clips)', quantity: 4 });
        items.push({ item: 'Clear silicone (small tube)', quantity: 1 });
      } else if (spec.style !== 'slab') {
        items.push({ item: 'Panel spacers (space balls)', quantity: 8 });
      }
      if (spec.frameJoint === 'miter') {
        items.push({ item: 'Splines or biscuits (miter reinforcement)', quantity: 4 });
      }
      items.push({ item: 'Wood glue (250ml)', quantity: 1 });
      break;
    }
    case 'drawerfront': {
      items.push({ item: 'Drawer pull', quantity: 1 });
      items.push({ item: 'M4 × 25mm pull screws', quantity: 2 });
      if (spec.style !== 'slab') {
        items.push({ item: 'Panel spacers (space balls)', quantity: 8 });
      }
      items.push({ item: 'Wood glue (250ml)', quantity: 1 });
      break;
    }
    case 'drawerunit': {
      items.push({
        item:
          spec.slideType === 'undermount'
            ? 'Undermount soft-close slides (pair per drawer)'
            : 'Full-extension side-mount slides (pair per drawer)',
        quantity: spec.drawerCount * (spec.columnCount ?? 1),
      });
      items.push({ item: '16mm panel nails or staples (back panel)', quantity: 24 });
      items.push({ item: '4 × 30mm screws (front adjustment, 4 per drawer)', quantity: spec.drawerCount * (spec.columnCount ?? 1) * 4 });
      if (spec.frontStyle !== 'slab') {
        items.push({ item: 'Panel spacers (space balls)', quantity: spec.drawerCount * (spec.columnCount ?? 1) * 8 });
      }
      items.push({ item: 'Wood glue (250ml)', quantity: 1 });
      break;
    }
    case 'endtable': {
      items.push({ item: 'Full-extension side-mount slides (pair)', quantity: 1 });
      items.push({ item: '4 × 30mm screws (front adjustment)', quantity: 4 });
      items.push({ item: 'Wood glue (250ml)', quantity: 1 });
      break;
    }
  }
  return items;
}

function toolsFor(layout: FurnitureLayout): string[] {
  const tools = [
    'Table saw or track saw',
    'Drill/driver with brad-point bits',
    'Random-orbit sander (120/180/240 grit)',
    'Clamps (4+ bar or pipe clamps)',
    'Square, tape measure, marking gauge',
  ];
  const spec = layout.spec;
  if (spec.kind === 'table') {
    tools.push('Doweling jig (or domino/mortiser for the apron joinery)');
    if (spec.legStyle === 'round') tools.push('Lathe (for turned legs)');
    if (spec.legStyle === 'tapered') tools.push('Tapering jig for the table saw');
  }
  if (spec.kind === 'bookshelf' || spec.kind === 'cabinet') {
    tools.push('Shelf-pin drilling jig (5mm)');
    tools.push('Router with rabbeting bit (for the back panel)');
  }
  if (spec.kind === 'cabinet') {
    tools.push('35mm Forstner bit (hinge cups)');
  }
  if (spec.kind === 'drawerbox') {
    if (spec.joinery === 'dovetail') tools.push('Dovetail jig with router (through template)');
    if (spec.joinery === 'halfblind') tools.push('Dovetail jig with router (half-blind template)');
    if (spec.joinery === 'boxjoint') tools.push('Box-joint jig for the table saw');
    if (spec.joinery === 'dado') tools.push('Dado stack or straight router bit');
    if (spec.scoop) tools.push('Scoop template with flush-trim bit (or spindle sander)');
    tools.push('6mm slot cutter or dado (bottom groove)');
  }
  if (spec.kind === 'door' || spec.kind === 'drawerfront') {
    if (spec.style !== 'slab') {
      const pattern = spec.edgeProfile && spec.edgeProfile !== 'square';
      if (spec.frameJoint === 'miter') {
        tools.push('Miter saw or sled with length stops (45° frame joints)');
        if (pattern) tools.push(`Stick cutter for the ${spec.edgeProfile} pattern (run before mitering)`);
      } else {
        tools.push(
          pattern
            ? `Cope & pattern cutter set (${spec.edgeProfile} pattern, 1/4" × 3/8" T&G)`
            : 'Router table with rail-and-stile bits (or dado stack for grooves/tenons)',
        );
      }
    }
    if (spec.style === 'raised') {
      tools.push(`Shaper or router panel raiser (${spec.raiseProfile ?? 'cove'} profile insert cutter)`);
    }
    if (spec.outerEdgeProfile && spec.outerEdgeProfile !== 'square') {
      tools.push(`Door-edge detail cutter (${spec.outerEdgeProfile})`);
    }
    if (spec.kind === 'door' && spec.hingeBoring) {
      tools.push('35mm Forstner bit (hinge cups)');
    }
  }
  if (spec.kind === 'endtable') {
    tools.push('Dovetail jig with router (case and drawer box)');
    tools.push('Dado stack or router (shelf dados)');
    tools.push('Drawer-slide mounting jig');
  }
  if (spec.kind === 'drawerunit') {
    tools.push('Drawer-slide mounting jig');
    tools.push('Dovetail jig with router (carcass and drawer boxes)');
    if (spec.frontStyle !== 'slab') {
      tools.push('Router table with rail-and-stile bits (fronts)');
    }
    if (spec.frontStyle === 'raised') {
      tools.push(`Shaper or router panel raiser (${spec.raiseProfile ?? 'cove'} profile insert cutter)`);
    }
  }
  return tools;
}

function overviewFor(layout: FurnitureLayout): string {
  const [w, h, d] = layout.overallMm;
  const size = `${Math.round(w)} × ${Math.round(d)} × ${Math.round(h)}mm (W×D×H)`;
  switch (layout.spec.kind) {
    case 'table':
      return `A ${size} table with ${layout.spec.legStyle} legs${layout.spec.apron ? ' and a glued apron frame for rigidity' : ''}. Build order: legs and apron first, then attach the top with movement-tolerant fasteners.`;
    case 'bookshelf':
      return `A ${size} bookshelf with ${layout.spec.shelfCount} adjustable shelves${layout.spec.backPanel ? ' and a back panel that squares the carcass' : ''}. Build order: drill shelf-pin holes flat, assemble the carcass, then fit the back.`;
    case 'cabinet':
      return `A ${size} ${layout.spec.doorCount}-door cabinet on ${layout.spec.legHeightMm > 0 ? 'tapered legs' : 'a plinth'}. Build order: carcass, back, top, then hang and align the doors last.`;
    case 'drawerbox': {
      const j = layout.spec.joinery;
      const corners =
        j === 'dovetail'
          ? 'through-dovetailed'
          : j === 'halfblind'
            ? 'half-blind dovetailed (clean show face)'
            : j === 'boxjoint'
              ? 'box-jointed'
              : 'dadoed';
      return `A ${size} drawer box in ${layout.spec.stockThicknessMm}mm stock with ${corners} corners${layout.spec.scoop ? ', a finger scoop in the front' : ''} and a ${layout.spec.bottomThicknessMm}mm bottom captured in a groove. Cut the joinery before grooving so the groove hides inside a tail.`;
    }
    case 'door':
      return layout.spec.style === 'shaker'
        ? `A ${size} five-piece shaker door: two stiles, two rails, and a floating center panel. Glue the frame only — the panel must float to allow seasonal movement.`
        : `A ${size} slab door. Flatness is everything: pick stable stock, finish both faces equally, and store it flat.`;
    case 'drawerfront':
      return layout.spec.style === 'shaker'
        ? `A ${size} five-piece shaker drawer front with a floating panel. Same construction as a door, sized for drawer proportions.`
        : `A ${size} slab drawer front with horizontal grain.`;
    case 'drawerunit':
      return `A ${size} bank of ${layout.spec.drawerCount} drawers on full-extension slides with ${layout.spec.frontStyle} overlay fronts. Build order: carcass, slides, boxes, then fronts aligned last with adjustment screws.`;
    case 'endtable':
      return `A ${size} coastal end table: a dovetailed case (tails on the floor-running sides, pins on the top), one inset drawer on side-mount slides, and two open shelves. Build order: case dovetails, shelf dados, glue-up, then the drawer.`;
  }
}

function stepsFor(layout: FurnitureLayout): BuildStep[] {
  const spec = layout.spec;
  const steps: BuildStep[] = [
    {
      title: 'Mill and cut stock',
      detail:
        'Joint and plane stock flat and square, then cut every part to the dimensions in the cut list. Label each part in pencil as it comes off the saw.',
    },
  ];
  switch (spec.kind) {
    case 'table': {
      if (spec.legStyle === 'tapered') {
        steps.push({
          title: 'Taper the legs',
          detail: `Taper the two inside faces of each ${spec.legThicknessMm}mm leg to ~60% at the foot using a tapering jig. Stop the taper ${spec.apron ? spec.apronHeightMm + 20 : 80}mm below the top so the joinery area stays square.`,
        });
      }
      if (spec.legStyle === 'round') {
        steps.push({
          title: 'Turn the legs',
          detail: `Turn each leg blank to a ${spec.legThicknessMm}mm diameter cylinder, leaving the top 100mm square if you prefer stronger apron joinery.`,
        });
      }
      if (spec.apron) {
        steps.push(
          {
            title: 'Join aprons to legs',
            detail:
              'Drill two 8mm dowel holes per joint (or cut mortise-and-tenon). Dry-fit the full base, check the diagonals for square, then glue and clamp in two stages: short rails first, then the long rails connecting both ends.',
          },
          {
            title: 'Reinforce the corners',
            detail: 'Install a corner bracket at each leg, drawing the leg tight against both rails with the lag screw.',
          },
        );
      }
      steps.push(
        {
          title: 'Glue up the top',
          detail: `Edge-glue boards to make the ${spec.widthMm} × ${spec.depthMm}mm top, alternating growth rings. Flatten with a sander or hand plane, then trim to final size and break the edges with a 2mm chamfer.`,
        },
        {
          title: 'Attach the top',
          detail:
            'Center the base upside-down on the top and fasten with figure-8 fasteners so the solid top can expand and contract across the grain.',
        },
      );
      break;
    }
    case 'bookshelf': {
      steps.push(
        {
          title: 'Drill shelf-pin holes',
          detail: `With the side panels flat on the bench, drill two columns of 5mm shelf-pin holes (32mm spacing) on each side panel${spec.backPanel ? ', then rout a 6mm rabbet along the back inside edge for the back panel' : ''}.`,
        },
        {
          title: 'Assemble the carcass',
          detail:
            'Join the top and bottom panels between the sides with glue and dowels (or confirmat screws). Clamp and compare the diagonals — they must match before the glue sets.',
        },
      );
      if (spec.backPanel) {
        steps.push({
          title: 'Fit the back panel',
          detail: 'Slide the back into its rabbets while the carcass is still clamped; pin it every ~150mm. The back is what keeps the case square, so re-check the diagonals before nailing.',
        });
      }
      steps.push({
        title: 'Finish and load',
        detail: `Sand to 180 grit, ease all edges, and apply finish. Insert the shelf pins and fit the ${spec.shelfCount} shelves.`,
      });
      break;
    }
    case 'drawerbox': {
      const j = spec.joinery;
      steps.push(
        {
          title: 'Cut the corner joinery',
          detail:
            j === 'dovetail'
              ? 'Rout through dovetails on all four corners with the jig; test-fit a corner in scrap first and dial in the bit depth until the joint closes hand-tight.'
              : j === 'halfblind'
                ? 'Rout half-blind dovetails with the jig — tails in the sides, blind sockets stopped 1/16" shy of the front face so the show face stays clean. The back corners are through-dovetailed. Test-fit in scrap first.'
                : j === 'boxjoint'
                  ? 'Cut box joints on all four corners at the table saw with the jig. The fit should need light mallet taps — too tight will split when glue swells the fingers.'
                  : 'Cut a dado in each side to receive the front and back, sized for a snug push fit.',
        },
        {
          title: 'Groove for the bottom',
          detail: `Cut a ${spec.bottomThicknessMm}mm groove 12mm up from the bottom edge on the inside of all four parts, positioned so it runs inside a ${j === 'dado' ? 'dado' : 'tail'} — never through visible joinery.`,
        },
        {
          title: 'Assemble',
          detail:
            'Glue the corners, slide the bottom in dry (never glued — it floats), clamp, and compare diagonals before the glue sets. Wipe squeeze-out inside the box immediately.',
        },
      );
      if (spec.scoop) {
        steps.push({
          title: 'Cut the finger scoop',
          detail:
            'Before assembly, cut the scoop in the front’s top edge with a template and flush-trim bit (or jigsaw + spindle sander), then ease the scoop edges thoroughly — fingers ride this edge every day.',
        });
      }
      break;
    }
    case 'door':
    case 'drawerfront': {
      if (spec.style !== 'slab') {
        if (spec.frameJoint === 'miter') {
          steps.push(
            {
              title: 'Stick and miter the frame stock',
              detail: `Run the groove (and pattern profile, if any) along the inside edge of all frame stock, then miter both ends of every member at 45° — long-point lengths per the cut list, identical pairs cut against a stop.`,
            },
            {
              title: 'Reinforce the miters',
              detail: 'Slot each miter for a spline or biscuit — end-grain glue alone will not hold a door corner.',
            },
          );
        } else {
          steps.push(
            {
              title: 'Mill rails and stiles',
              detail: `Cut stiles and rails to the cut list (${spec.railStileWidthMm}mm wide), then cut the ${spec.style === 'raised' ? 6 : spec.panelThicknessMm}mm groove centered on every inside edge.`,
            },
            {
              title: 'Cut the rail tenons',
              detail: 'Cope the rail ends (or cut stub tenons) to fill the stile grooves exactly — the shoulders set the frame square.',
            },
          );
        }
        if (spec.style === 'raised') {
          steps.push({
            title: 'Raise the panel',
            detail: `Glue up the ${spec.panelThicknessMm}mm panel blank, cut to the cut-list size, then raise all four edges with the ${spec.raiseProfile ?? 'cove'} cutter (${spec.raiseWidthMm ?? 38}mm raise) — end grain first, then long grain, sneaking up on a 6mm tongue that fits the groove.`,
          });
        }
        if (spec.kind === 'door' && spec.glassPanel) {
          steps.push(
            {
              title: 'Glue the frame and rout the glass rabbet',
              detail:
                'Glue the frame without a panel, check the diagonals, then rout away the back side of the groove to leave an open rabbet. Square the rabbet corners with a chisel.',
            },
            {
              title: 'Fit the glass',
              detail:
                'After finishing, bed the tempered pane in the rabbet on a thin bead of clear silicone and fix the retainer strips with brads — never glue the glass hard.',
            },
          );
        } else {
          steps.push({
            title: 'Fit the panel and glue up',
            detail:
              'Cut the panel 1mm under groove depth all around, insert with panel spacers, and glue ONLY the frame joints. Clamp flat on a known-flat surface and check the diagonals.',
          });
        }
      } else {
        steps.push({
          title: 'Prepare the slab',
          detail: 'Glue up (or cut) the slab to final size, then flatten both faces equally so internal stresses balance and the piece stays flat.',
        });
      }
      if (spec.kind === 'door' && spec.hingeBoring) {
        steps.push({
          title: 'Bore for hinges',
          detail: 'Drill the two 35mm hinge cups 12mm deep, centered 22.5mm from the hinge-side edge, ~80mm from each end.',
        });
      }
      steps.push({
        title: 'Break the edges',
        detail: 'Ease all arrises with a 1mm chamfer or light sanding — crisp but not sharp.',
      });
      break;
    }
    case 'endtable': {
      steps.push(
        {
          title: 'Dovetail the case',
          detail:
            'Cut the tails on the sides\u2019 top ends and the pins on the top panel \u2014 the pattern runs front to back. Dry-fit before moving on.',
        },
        {
          title: 'Dado the shelves and glue up',
          detail:
            'Cut stopped dados in the sides for the middle and bottom shelves, then glue the case square \u2014 check the diagonals while the rear rail goes in under the top.',
        },
        {
          title: 'Build and hang the drawer',
          detail:
            'Through-dovetail the drawer box, groove for the bottom, then mount the side slides level. Fit the inset front with an even 2mm reveal and fix it from inside.',
        },
      );
      break;
    }
    case 'drawerunit': {
      steps.push(
        {
          title: 'Assemble the carcass',
          detail:
            spec.caseJoinery === 'halfblind'
              ? 'Dovetail the carcass together — tails on the sides, half-blind pins on the full-width top and bottom with 1/16" laps so the top and bottom faces stay clean. Glue up square against the back panel, then fasten the back.'
              : 'Dovetail the carcass together — tails on the sides, through pins on the full-width top and bottom. Glue up square against the back panel, then fasten the back.',
        },
        {
          title: 'Mount the slides',
          detail: `Lay out ${spec.drawerCount * (spec.columnCount ?? 1)} slide positions with the jig and screw the cabinet members to the sides — identical heights left and right, or the drawers will rack.`,
        },
        {
          title: 'Build the drawer boxes',
          detail:
            'Build each box per the cut list (joinery, bottom groove, glue-up), then mount the drawer members of the slides centered on the box sides.',
        },
        {
          title: 'Fit the fronts',
          detail:
            spec.frontMount === 'inset'
              ? 'Fit each inset front to its opening with an even 2mm reveal all around — plane to fit, shimming off the divider rails, then fix from inside with the adjustment screws.'
              : 'With the boxes installed, attach each front using double-sided tape to position it, then fix from inside with the adjustment screws. Work bottom-up keeping an even 3mm reveal.',
        },
      );
      break;
    }
    case 'cabinet': {
      steps.push(
        {
          title: 'Prepare the panels',
          detail:
            'Drill the shelf-pin holes in both side panels, rout the back-panel rabbets, and drill the 35mm hinge-cup holes in the doors (centered 22.5mm from the edge).',
        },
        {
          title: 'Assemble the carcass',
          detail:
            'Join the bottom and top stretcher between the side panels with glue and dowels. Square the case against the back panel and fasten the back.',
        },
        {
          title: 'Attach the top and legs',
          detail: `Fasten the overhanging top from below through the stretcher${spec.legHeightMm > 0 ? `, then install the leg-mounting plates and thread on the four ${spec.legHeightMm}mm legs` : ''}.`,
        },
        {
          title: 'Hang the doors',
          detail: `Mount the euro hinges, hang the ${spec.doorCount} doors, and adjust the hinge screws until the reveals are an even 3mm all around. Fit the handles last.`,
        },
      );
      break;
    }
  }
  steps.push({
    title: 'Final finish',
    detail:
      'Sand any glue squeeze-out, vacuum the piece, and apply three coats of hardwax oil or water-based polyurethane, sanding lightly at 320 grit between coats.',
  });
  return steps;
}

function estimateHours(layout: FurnitureLayout): { min: number; max: number } {
  // Crude but useful: scale with distinct operations and part count.
  const partCount = layout.parts.filter((p) => p.role !== 'hardware').length;
  const baseByKind: Record<string, number> = {
    table: 8,
    cabinet: 12,
    bookshelf: 6,
    drawerbox: 2,
    door: 3,
    drawerfront: 2,
    drawerunit: 10,
    endtable: 7,
  };
  const base = baseByKind[layout.spec.kind] ?? 6;
  const min = base + Math.round(partCount * 0.5);
  return { min, max: Math.round(min * 1.8) };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
