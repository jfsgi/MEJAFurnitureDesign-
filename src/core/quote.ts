// Quote export: each design piece becomes a "product" carrying its overall
// dimensions and a flat list of its child parts (the cut list), ready to post
// to MEJA's quoting system to build the product and its parts. Pure and
// serializable — the transport (live API or file) lives in the studio layer.

import type { ProjectDoc, Units } from './types';
import { evaluateInstance, modelBBox } from './evaluate';
import { boardFeet, buildCutList } from './cutlist';
import { MATERIAL_BY_ID } from './materials';
import { MM_PER_INCH } from './units';

/** A child part of a product: a cut-list row, dimensions in the export units. */
export interface QuotePart {
  name: string;
  qty: number;
  length: number;
  width: number;
  thickness: number;
  /** Display material name and its stable id. */
  material: string;
  materialId: string;
  boardFeet: number;
  /** Shop note (joinery, slide base, dowel Ø, …). */
  note?: string;
}

/** One product = one design piece, with overall size and its child parts. */
export interface QuoteProduct {
  id: string;
  name: string;
  componentId: string;
  overall: { width: number; depth: number; height: number };
  materials: string[];
  boardFeet: number;
  /** Total piece count across all child parts. */
  partCount: number;
  parts: QuotePart[];
}

export interface QuotePayload {
  source: 'Atelier3D';
  version: 1;
  project: string;
  units: 'in' | 'mm';
  generatedAt: string;
  products: QuoteProduct[];
}

const round = (n: number, d: number): number => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};
/** Model millimeters → the project's units, as a plain number. */
const toUnit = (mm: number, units: Units): number =>
  units === 'imperial' ? round(mm / MM_PER_INCH, 3) : round(mm, 1);

/** One product per instance: overall dimensions + every part as a child. */
export function buildQuoteProducts(doc: ProjectDoc): QuoteProduct[] {
  const units = doc.units;
  return doc.instances.map((inst) => {
    const model = evaluateInstance(inst);
    const box = modelBBox(model);
    const rows = buildCutList({ ...doc, instances: [inst] })[0]?.rows ?? [];
    const parts: QuotePart[] = rows.map((r) => ({
      name: r.part,
      qty: r.qty,
      length: toUnit(r.length, units),
      width: toUnit(r.width, units),
      thickness: toUnit(r.thickness, units),
      material: MATERIAL_BY_ID[r.material]?.name ?? r.material,
      materialId: r.material,
      boardFeet: round(boardFeet(r), 2),
      note: r.note,
    }));
    const overall = box
      ? {
          width: toUnit(box.max[0] - box.min[0], units),
          depth: toUnit(box.max[1] - box.min[1], units),
          height: toUnit(box.max[2] - box.min[2], units),
        }
      : { width: 0, depth: 0, height: 0 };
    return {
      id: inst.id,
      name: inst.name,
      componentId: inst.componentId,
      overall,
      materials: [...new Set(parts.map((p) => p.material))],
      boardFeet: round(parts.reduce((s, p) => s + p.boardFeet, 0), 2),
      partCount: parts.reduce((s, p) => s + p.qty, 0),
      parts,
    };
  });
}

export function buildQuotePayload(doc: ProjectDoc): QuotePayload {
  return {
    source: 'Atelier3D',
    version: 1,
    project: doc.name,
    units: doc.units === 'imperial' ? 'in' : 'mm',
    generatedAt: new Date().toISOString(),
    products: buildQuoteProducts(doc),
  };
}

export function quotePayloadJSON(doc: ProjectDoc): string {
  return JSON.stringify(buildQuotePayload(doc), null, 2);
}
