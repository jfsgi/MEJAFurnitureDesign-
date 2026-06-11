// Stock breakdown (docs/01 "board/sheet optimization"): sheet-good parts nest onto
// standard sheets with a shelf-packing layout; solid lumber rolls up to board feet
// with a purchase allowance. Pure projection of the evaluated model, like the cut list.

import type { ProjectDoc } from './types';
import { buildCutList } from './cutlist';
import { MATERIAL_BY_ID } from './materials';
import { MM_PER_INCH, inch } from './units';

export interface StockPart {
  name: string;
  instanceName: string;
  length: number;
  width: number;
  thickness: number;
  material: string;
}

export interface Placement {
  part: StockPart;
  x: number; // along the sheet length
  y: number; // across the sheet width
  w: number;
  h: number;
  rotated: boolean;
}

export interface SheetLayout {
  material: string;
  thickness: number;
  placements: Placement[];
  /** Fraction of the sheet covered by parts (not counting kerf). */
  usedFraction: number;
}

export interface LumberLine {
  material: string;
  thickness: number;
  boardFeet: number;
  /** Board feet to buy: parts plus the milling/defect allowance. */
  buyBoardFeet: number;
}

export interface StockBreakdown {
  sheets: SheetLayout[];
  lumber: LumberLine[];
  /** Parts too large for a sheet in either orientation. */
  unplaced: StockPart[];
}

export const SHEET_L = inch(96);
export const SHEET_W = inch(48);
const KERF = inch(0.125);
const LUMBER_WASTE = 0.15;
/** Parts this thin come from sheet stock (plywood backs/bottoms) whatever the species. */
const SHEET_THICKNESS_MAX = inch(0.375);

function isSheetPart(p: StockPart): boolean {
  return MATERIAL_BY_ID[p.material]?.sheet === true || p.thickness <= SHEET_THICKNESS_MAX + 1e-6;
}

interface Shelf {
  y: number;
  height: number;
  x: number;
}

interface OpenSheet {
  layout: SheetLayout;
  shelves: Shelf[];
  partArea: number;
}

/** Shelf packing, first-fit-decreasing: parts lie with their long side along the
 * sheet length, sorted by width; each new row opens a shelf across the sheet. */
function nestGroup(material: string, thickness: number, parts: StockPart[]): {
  sheets: SheetLayout[];
  unplaced: StockPart[];
} {
  const oriented = parts.map((part) => {
    const w = Math.max(part.length, part.width);
    const h = Math.min(part.length, part.width);
    return { part, w, h, rotated: part.width > part.length };
  });
  oriented.sort((a, b) => b.h - a.h || b.w - a.w);

  const sheets: OpenSheet[] = [];
  const unplaced: StockPart[] = [];

  for (const item of oriented) {
    if (item.w > SHEET_L || item.h > SHEET_W) {
      unplaced.push(item.part);
      continue;
    }
    let placed = false;
    for (const sheet of sheets) {
      for (const shelf of sheet.shelves) {
        if (item.h <= shelf.height && shelf.x + item.w <= SHEET_L) {
          sheet.layout.placements.push({ part: item.part, x: shelf.x, y: shelf.y, w: item.w, h: item.h, rotated: item.rotated });
          shelf.x += item.w + KERF;
          sheet.partArea += item.w * item.h;
          placed = true;
          break;
        }
      }
      if (placed) break;
      const yNext = sheet.shelves.length
        ? sheet.shelves[sheet.shelves.length - 1].y + sheet.shelves[sheet.shelves.length - 1].height + KERF
        : 0;
      if (yNext + item.h <= SHEET_W) {
        sheet.shelves.push({ y: yNext, height: item.h, x: item.w + KERF });
        sheet.layout.placements.push({ part: item.part, x: 0, y: yNext, w: item.w, h: item.h, rotated: item.rotated });
        sheet.partArea += item.w * item.h;
        placed = true;
        break;
      }
    }
    if (!placed) {
      const layout: SheetLayout = { material, thickness, placements: [], usedFraction: 0 };
      sheets.push({
        layout,
        shelves: [{ y: 0, height: item.h, x: item.w + KERF }],
        partArea: item.w * item.h,
      });
      layout.placements.push({ part: item.part, x: 0, y: 0, w: item.w, h: item.h, rotated: item.rotated });
    }
  }

  for (const sheet of sheets) {
    sheet.layout.usedFraction = sheet.partArea / (SHEET_L * SHEET_W);
  }
  return { sheets: sheets.map((s) => s.layout), unplaced };
}

export function buildStockBreakdown(doc: ProjectDoc): StockBreakdown {
  const parts: StockPart[] = [];
  for (const group of buildCutList(doc)) {
    for (const row of group.rows) {
      for (let i = 0; i < row.qty; i++) {
        parts.push({
          name: row.part,
          instanceName: group.instance.name,
          length: row.length,
          width: row.width,
          thickness: row.thickness,
          material: row.material,
        });
      }
    }
  }

  const sheetGroups = new Map<string, StockPart[]>();
  const lumberGroups = new Map<string, StockPart[]>();
  for (const part of parts) {
    const key = `${part.material}|${part.thickness.toFixed(2)}`;
    const target = isSheetPart(part) ? sheetGroups : lumberGroups;
    const list = target.get(key);
    if (list) list.push(part);
    else target.set(key, [part]);
  }

  const sheets: SheetLayout[] = [];
  const unplaced: StockPart[] = [];
  for (const group of sheetGroups.values()) {
    const result = nestGroup(group[0].material, group[0].thickness, group);
    sheets.push(...result.sheets);
    unplaced.push(...result.unplaced);
  }

  const lumber: LumberLine[] = [];
  for (const group of lumberGroups.values()) {
    const bf = group.reduce((sum, p) => {
      const cubicInches =
        (p.length / MM_PER_INCH) * (p.width / MM_PER_INCH) * (p.thickness / MM_PER_INCH);
      return sum + cubicInches / 144;
    }, 0);
    lumber.push({
      material: group[0].material,
      thickness: group[0].thickness,
      boardFeet: bf,
      buyBoardFeet: Math.ceil(bf * (1 + LUMBER_WASTE) * 2) / 2,
    });
  }
  lumber.sort((a, b) => b.boardFeet - a.boardFeet);

  return { sheets, lumber, unplaced };
}
