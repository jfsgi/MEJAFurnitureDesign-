// Product-library export: each design piece becomes a parametric "product" —
// its overall dimensions, the child parts (cut list), AND the component params
// and adjustable dimensions, so the CRM can store it in the product library and
// later re-derive the parts when an overall dimension changes on a quote (by
// POSTing the edited params back to the recompute endpoint). Pure and
// serializable — the transport lives in the studio layer.

import type { LengthParam, ProjectDoc, Units } from './types';
import { effectiveParams, evaluateInstance, modelBBox } from './evaluate';
import { REGISTRY } from './components/registry';
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

/** An adjustable dimension of a product (a length parameter), in millimeters
 * (the native param unit the recompute endpoint consumes). */
export interface QuoteDimension {
  key: string;
  label: string;
  mm: number;
  minMm: number;
  maxMm: number;
  tier: string;
}

/** One product = one design piece: overall size, child parts, AND the
 * parametric source (component id + params + adjustable dimensions). */
export interface QuoteProduct {
  id: string;
  name: string;
  componentId: string;
  overall: { width: number; depth: number; height: number };
  materials: string[];
  boardFeet: number;
  /** Total piece count across all child parts. */
  partCount: number;
  /** Native component params (millimeters / enums). POST these — with edits —
   *  to the recompute endpoint to re-derive the parts. */
  params: Record<string, unknown>;
  /** The length params, with bounds (millimeters) — what a quote may change. */
  dimensions: QuoteDimension[];
  parts: QuotePart[];
}

export interface QuotePayload {
  source: 'Atelier3D';
  version: 1;
  project: string;
  units: 'in' | 'mm';
  generatedAt: string;
  /** How the CRM re-derives a product's parts when a dimension changes. */
  recompute: { url: string; method: 'POST'; body: string };
  products: QuoteProduct[];
}

const round = (n: number, d: number): number => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};
/** Model millimeters → the project's units, as a plain number. */
const toUnit = (mm: number, units: Units): number =>
  units === 'imperial' ? round(mm / MM_PER_INCH, 3) : round(mm, 1);

/** One product per instance: overall dimensions, every part as a child, and the
 * parametric source so the product can be re-derived from edited dimensions. */
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
    const def = REGISTRY[inst.componentId];
    const params = effectiveParams(inst);
    const dimensions: QuoteDimension[] = (def?.params ?? [])
      .filter((p): p is LengthParam => p.kind === 'length')
      .map((p) => ({
        key: p.key,
        label: p.label,
        mm: round(params[p.key] as number, 2),
        minMm: p.min,
        maxMm: p.max,
        tier: p.tier,
      }));
    return {
      id: inst.id,
      name: inst.name,
      componentId: inst.componentId,
      overall,
      materials: [...new Set(parts.map((p) => p.material))],
      boardFeet: round(parts.reduce((s, p) => s + p.boardFeet, 0), 2),
      partCount: parts.reduce((s, p) => s + p.qty, 0),
      params: params as Record<string, unknown>,
      dimensions,
      parts,
    };
  });
}

export function buildQuotePayload(doc: ProjectDoc, recomputeUrl = '/api/recompute'): QuotePayload {
  return {
    source: 'Atelier3D',
    version: 1,
    project: doc.name,
    units: doc.units === 'imperial' ? 'in' : 'mm',
    generatedAt: new Date().toISOString(),
    recompute: {
      url: recomputeUrl,
      method: 'POST',
      body: 'POST { componentId, params, units } with edited params; returns the product with recomputed parts.',
    },
    products: buildQuoteProducts(doc),
  };
}

export function quotePayloadJSON(doc: ProjectDoc, recomputeUrl?: string): string {
  return JSON.stringify(buildQuotePayload(doc, recomputeUrl), null, 2);
}
