// Cut list & BOM: a pure projection of the evaluated model (docs/05 §6).

import type { Instance, ProjectDoc, Units } from './types';
import { evaluateInstance } from './evaluate';
import { MATERIAL_BY_ID } from './materials';
import { MM_PER_INCH, formatLengthBare } from './units';

export interface CutRow {
  part: string;
  qty: number;
  length: number;
  width: number;
  thickness: number;
  material: string;
}

export interface CutGroup {
  instance: Instance;
  rows: CutRow[];
}

export function buildCutList(doc: ProjectDoc): CutGroup[] {
  return doc.instances.map((inst) => {
    const model = evaluateInstance(inst);
    const byKey = new Map<string, CutRow>();
    for (const part of model.parts) {
      const { length, width, thickness } = part.cut;
      const key = [part.name, length.toFixed(2), width.toFixed(2), thickness.toFixed(2), part.material].join('|');
      const row = byKey.get(key);
      if (row) {
        row.qty += 1;
      } else {
        byKey.set(key, { part: part.name, qty: 1, length, width, thickness, material: part.material });
      }
    }
    return { instance: inst, rows: [...byKey.values()] };
  });
}

/** Board feet for the row (all quantities included). */
export function boardFeet(row: CutRow): number {
  const inches = (row.length / MM_PER_INCH) * (row.width / MM_PER_INCH) * (row.thickness / MM_PER_INCH);
  return (inches / 144) * row.qty;
}

export function totalBoardFeet(groups: CutGroup[]): number {
  return groups.reduce((sum, g) => sum + g.rows.reduce((s, r) => s + boardFeet(r), 0), 0);
}

export function cutListCSV(doc: ProjectDoc, units: Units): string {
  const dim = (mm: number) => formatLengthBare(mm, units);
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const unitMark = units === 'imperial' ? 'in' : 'mm';
  const lines = [
    ['Item', 'Part', 'Qty', `Length (${unitMark})`, `Width (${unitMark})`, `Thickness (${unitMark})`, 'Material', 'Board ft']
      .map(esc)
      .join(','),
  ];
  for (const group of buildCutList(doc)) {
    for (const row of group.rows) {
      lines.push(
        [
          esc(group.instance.name),
          esc(row.part),
          String(row.qty),
          esc(dim(row.length)),
          esc(dim(row.width)),
          esc(dim(row.thickness)),
          esc(MATERIAL_BY_ID[row.material]?.name ?? row.material),
          boardFeet(row).toFixed(2),
        ].join(','),
      );
    }
  }
  return lines.join('\n');
}
