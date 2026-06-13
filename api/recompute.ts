// Vercel serverless function: re-derive a product's parts from edited params.
//
// The CRM calls this when an overall dimension changes on a quote — it POSTs
// the product's componentId plus the edited params, and gets back the product
// with its child parts recomputed. Pure core logic (no three.js / DOM), so it
// runs server-side.
//
//   POST /api/recompute
//   { "componentId": "entry-bench", "params": { "width": 1524, ... },
//     "units": "imperial", "joints": {...}, "jointConfig": {...} }
//   → the QuoteProduct (overall + dimensions + child parts), recomputed.

import { buildQuoteProducts } from '../src/core/quote';

export default function handler(req: { method?: string; body?: unknown }, res: ResLike): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }
  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as {
      componentId?: string;
      name?: string;
      params?: Record<string, unknown>;
      joints?: Record<string, string>;
      jointConfig?: unknown;
      units?: string;
    };
    if (!body.componentId) {
      res.status(400).json({ error: 'componentId is required' });
      return;
    }
    const units = body.units === 'mm' || body.units === 'metric' ? 'metric' : 'imperial';
    const product = buildQuoteProducts({
      schema: 1,
      name: body.name ?? body.componentId,
      units,
      instances: [
        {
          id: 'p',
          componentId: body.componentId,
          name: body.name ?? body.componentId,
          position: [0, 0],
          rotationZ: 0,
          params: (body.params ?? {}) as never,
          joints: body.joints as never,
          jointConfig: body.jointConfig as never,
        },
      ],
    })[0];
    if (!product) {
      res.status(404).json({ error: `Unknown componentId "${body.componentId}"` });
      return;
    }
    res.status(200).json(product);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
}

interface ResLike {
  setHeader(k: string, v: string): void;
  status(code: number): ResLike;
  json(body: unknown): void;
  end(): void;
}
