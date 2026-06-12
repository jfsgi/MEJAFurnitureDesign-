// Coastal end table, after the MEJA cherry original: sides through-dovetailed
// into the top (the only jointed corner — the sides run past the shelves to
// the floor), a full-width inset drawer under the top, a fixed shelf closing
// the drawer bay, open shelf bays below, and a bottom shelf raised a toe
// space off the floor. Back panel inset behind the shelves, shop standard.

import type { ComponentDef, Finding, GeneratedModel, ParamValues, Part, Primitive } from '../types';
import { formatLength, inch } from '../units';
import { HALF_BLIND_LIP, drawerBoxParts } from './drawerparts';
import { slideFitWarning } from './drawerbox';

const num = (p: ParamValues, k: string): number => p[k] as number;
const str = (p: ParamValues, k: string): string => p[k] as string;

const SLIDE_CLEARANCE = inch(0.5); // per side, standard side-mount slides
const BACK_OFFSET = inch(0.25); // back panel inset from the rear of the case
const DRAWER_BACK_GAP = inch(0.25); // drawer box to back panel
const BOX_HEIGHT_CLEARANCE = inch(1);
const MIN_BAY = inch(4);

export const coastalEndTable: ComponentDef = {
  id: 'coastal-end-table',
  name: 'Coastal end table',
  category: 'Tables',
  description: 'Dovetailed-top end table: inset drawer over open shelves.',
  params: [
    { kind: 'length', key: 'width', label: 'Width', default: inch(20), min: inch(12), max: inch(32), tier: 'basic' },
    { kind: 'length', key: 'depth', label: 'Depth', default: inch(15), min: inch(10), max: inch(24), tier: 'basic' },
    { kind: 'length', key: 'height', label: 'Height', default: inch(25), min: inch(18), max: inch(36), tier: 'basic' },
    { kind: 'count', key: 'shelfBays', label: 'Open shelf bays', default: 2, min: 1, max: 3, tier: 'basic' },
    { kind: 'material', key: 'material', label: 'Material', default: 'cherry', tier: 'basic' },
    { kind: 'enum', key: 'caseJoinery', label: 'Top joinery', default: 'through-dovetail', tier: 'advanced',
      options: [
        { value: 'through-dovetail', label: 'Through dovetail' },
        { value: 'half-blind-dovetail', label: 'Half-blind dovetail' },
        { value: 'box-joint', label: 'Box joint' },
        { value: 'butt', label: 'Butt / screwed' },
      ] },
    { kind: 'length', key: 'drawerHeight', label: 'Drawer opening', default: inch(5), min: inch(3), max: inch(8), tier: 'advanced' },
    { kind: 'material', key: 'boxMaterial', label: 'Drawer box material', default: 'cherry', tier: 'advanced' },
    { kind: 'length', key: 'thickness', label: 'Board thickness', default: inch(0.75), min: inch(0.5), max: inch(1), tier: 'advanced' },
    { kind: 'length', key: 'backThickness', label: 'Back thickness', default: inch(0.25), min: inch(0.125), max: inch(0.5), tier: 'advanced' },
    { kind: 'length', key: 'boxSideThickness', label: 'Box side thickness', default: inch(0.5), min: inch(0.375), max: inch(0.75), tier: 'advanced' },
    { kind: 'length', key: 'reveal', label: 'Front reveal', default: inch(0.0625), min: inch(0.03125), max: inch(0.1875), tier: 'advanced' },
    { kind: 'length', key: 'toeSpace', label: 'Bottom shelf lift', default: inch(0.75), min: 0, max: inch(3), tier: 'advanced' },
  ],
  generate(p): GeneratedModel {
    const W = num(p, 'width');
    const D = num(p, 'depth');
    const H = num(p, 'height');
    const bays = num(p, 'shelfBays');
    const t = num(p, 'thickness');
    const backT = num(p, 'backThickness');
    const sideT = num(p, 'boxSideThickness');
    const drawerH = num(p, 'drawerHeight');
    const reveal = num(p, 'reveal');
    const toe = num(p, 'toeSpace');
    const mat = str(p, 'material');
    const boxMat = str(p, 'boxMaterial');

    const innerW = W - 2 * t;

    const parts: Part[] = [];
    const findings: Finding[] = [];

    // The top is the table's one jointed corner pair: sides carry tails on
    // their top ends only (square at the floor); the full-width top carries
    // the pins. Half-blind keeps the lap on the top face.
    const caseJoinery = str(p, 'caseJoinery');
    const jointed = caseJoinery !== 'butt';
    const halfBlind = caseJoinery === 'half-blind-dovetail';
    const joint = caseJoinery === 'box-joint' ? ('box-joint' as const) : ('dovetail' as const);
    const lip = halfBlind ? HALF_BLIND_LIP : undefined;
    const jointTag = halfBlind
      ? ' (half-blind DT)'
      : caseJoinery === 'through-dovetail'
        ? ' (dovetail)'
        : caseJoinery === 'box-joint'
          ? ' (box joint)'
          : '';
    const sideLen = halfBlind ? H - HALF_BLIND_LIP : H;
    for (const sx of [-1, 1]) {
      const prim: Primitive = jointed
        ? {
            shape: 'jointedBoard',
            role: 'tails',
            length: sideLen,
            height: D,
            thickness: t,
            at: [sx * (W / 2 - t / 2), 0, sideLen / 2],
            lengthAxis: 'z',
            thicknessAxis: 'x',
            joint,
            jointDepth: t,
            lip,
            plainEnd: 'negative',
          }
        : { shape: 'box', size: [t, D, H], at: [sx * (W / 2 - t / 2), 0, H / 2] };
      parts.push({
        id: `side-${sx}`,
        name: `Side${jointTag}`,
        material: mat,
        primitives: [prim],
        cut: { length: sideLen, width: D, thickness: t },
      });
    }
    parts.push({
      id: 'top',
      name: `Top${jointTag}`,
      material: mat,
      primitives: [
        jointed
          ? {
              shape: 'jointedBoard',
              role: 'pins',
              length: W,
              height: D,
              thickness: t,
              at: [0, 0, H - t / 2],
              lengthAxis: 'x',
              thicknessAxis: 'z',
              outerSign: 1,
              joint,
              jointDepth: t,
              lip,
            }
          : { shape: 'box', size: [innerW, D, t], at: [0, 0, H - t / 2] },
      ],
      cut: { length: jointed ? W : innerW, width: D, thickness: t },
    });

    // Fixed shelves stop at the back panel; their front edges run flush.
    const shelfD = D - BACK_OFFSET - backT;
    const shelfY = (BACK_OFFSET + backT) / 2;
    const shelf = (id: string, name: string, z: number) => {
      parts.push({
        id,
        name,
        material: mat,
        primitives: [{ shape: 'box', size: [innerW, shelfD, t], at: [0, shelfY, z] }],
        cut: { length: innerW, width: shelfD, thickness: t },
      });
    };

    // Drawer bay under the top, closed by a fixed shelf; the open bays split
    // what remains down to the bottom shelf riding a toe space off the floor.
    const drawerShelfTop = H - t - drawerH;
    shelf('drawer-shelf', 'Drawer shelf', drawerShelfTop - t / 2);
    shelf('bottom-shelf', 'Bottom shelf', toe + t / 2);
    const bayRegion = drawerShelfTop - t - (toe + t);
    const bayH = (bayRegion - (bays - 1) * t) / bays;
    for (let i = 1; i < bays; i++) {
      shelf(`shelf-${i}`, 'Fixed shelf', toe + t + i * (bayH + t) - t / 2);
    }

    // Back panel behind the shelves and drawer, inset from the rear.
    const backBottom = toe + t;
    parts.push({
      id: 'back',
      name: 'Back panel',
      material: mat,
      primitives: [
        {
          shape: 'box',
          size: [innerW, backT, H - t - backBottom],
          at: [0, -(D / 2 - BACK_OFFSET - backT / 2), (H - t + backBottom) / 2],
        },
      ],
      cut: { length: H - t - backBottom, width: innerW, thickness: backT },
    });

    // Inset drawer: slab front flush with the case face, dovetailed box behind.
    parts.push({
      id: 'drawer-front',
      name: 'Drawer front',
      material: mat,
      primitives: [
        {
          shape: 'box',
          size: [innerW - 2 * reveal, t, drawerH - 2 * reveal],
          at: [0, D / 2 - t / 2, drawerShelfTop + drawerH / 2],
        },
      ],
      cut: { length: innerW - 2 * reveal, width: drawerH - 2 * reveal, thickness: t },
    });
    const boxW = innerW - 2 * SLIDE_CLEARANCE;
    const boxD = D - t - BACK_OFFSET - backT - DRAWER_BACK_GAP;
    parts.push(
      ...drawerBoxParts({
        idPrefix: 'drawer',
        boxW,
        boxD,
        boxH: Math.max(drawerH - BOX_HEIGHT_CLEARANCE, inch(0.75)),
        centerY: D / 2 - t - boxD / 2,
        bottomZ: drawerShelfTop + inch(0.25),
        sideT,
        bottomT: inch(0.25),
        material: boxMat,
        joinery: 'dovetail',
      }),
    );

    if (bayH < MIN_BAY) {
      findings.push({
        severity: 'warning',
        message: `Shelf bays come out under ${formatLength(MIN_BAY, 'imperial')}. Reduce the bay count or the drawer opening, or add height.`,
      });
    }
    const slideWarning = slideFitWarning(boxD);
    if (slideWarning) findings.push(slideWarning);

    return { parts, findings };
  },
};
