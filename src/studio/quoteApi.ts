// Product-library hook: POSTs the parametric product payload to MEJA's CRM &
// Order Management app (Next.js + Supabase on Vercel) so each design lands in
// the product library. From a quote, the CRM re-derives a product's parts when
// a dimension changes by POSTing the edited params to Atelier3D's own
// /api/recompute endpoint (carried in the payload). Configurable at build time:
//
//   VITE_PRODUCT_API_URL (or VITE_QUOTE_API_URL)  receiving endpoint
//        (default: the public CRM product-library route).
//   VITE_PRODUCT_API_KEY (or VITE_QUOTE_API_KEY)  token, only if required;
//        sent as both `Authorization: Bearer …` and the Supabase `apikey` header.
//   VITE_RECOMPUTE_URL   Atelier3D's recompute endpoint advertised to the CRM
//        (default: this app's own origin + /api/recompute).

import type { ProjectDoc } from '../core/types';
import { quotePayloadJSON } from '../core/quote';

/** MEJA CRM & Order Management — public Vercel deployment, product-library route. */
const DEFAULT_PRODUCT_URL = 'https://meja-crm-order-management.vercel.app/api/products';

interface Endpoint {
  url: string;
  apiKey?: string;
}

function env(): Record<string, string | undefined> {
  return import.meta.env as unknown as Record<string, string | undefined>;
}

function endpoint(): Endpoint {
  const e = env();
  return {
    url: e.VITE_PRODUCT_API_URL || e.VITE_QUOTE_API_URL || DEFAULT_PRODUCT_URL,
    apiKey: e.VITE_PRODUCT_API_KEY || e.VITE_QUOTE_API_KEY,
  };
}

/** Atelier3D's own recompute endpoint, advertised to the CRM in the payload. */
function recomputeUrl(): string {
  const e = env();
  if (e.VITE_RECOMPUTE_URL) return e.VITE_RECOMPUTE_URL;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/api/recompute`;
}

/** The product-library endpoint Atelier3D will POST to. */
export function productApiUrl(): string {
  return endpoint().url;
}

export interface ProductSendResult {
  /** The request was accepted (2xx). */
  ok: boolean;
  status?: number;
  message: string;
}

/** POSTs the parametric product payload to the CRM's product library. */
export async function sendProduct(doc: ProjectDoc): Promise<ProductSendResult> {
  const { url, apiKey } = endpoint();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Supabase Edge Functions / REST want both headers; a Vercel route
        // reads whichever it expects and ignores the other.
        ...(apiKey ? { Authorization: `Bearer ${apiKey}`, apikey: apiKey } : {}),
      },
      body: quotePayloadJSON(doc, recomputeUrl()),
    });
    const text = await res.text().catch(() => '');
    return {
      ok: res.ok,
      status: res.status,
      message: res.ok
        ? `Sent to the product library (${res.status}).`
        : `Product library returned ${res.status}${text ? `: ${text.slice(0, 140)}` : ''}`,
    };
  } catch (e) {
    return { ok: false, message: `Could not reach the product library: ${String(e)}` };
  }
}
