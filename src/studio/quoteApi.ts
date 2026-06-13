// Live quote hook: POSTs the product/parts payload to MEJA's quoting system —
// the MEJA CRM & Order Management app (Next.js + Supabase on Vercel). It POSTs
// to the public deployment by default; both the URL and the (optional) token
// are overridable at build time:
//
//   VITE_QUOTE_API_URL   receiving endpoint (default: the public CRM intake
//                        route). Point it elsewhere for staging, or at a
//                        Supabase Edge Function.
//   VITE_QUOTE_API_KEY   token, only if the route requires one (the public
//                        route does not). Sent as both `Authorization: Bearer …`
//                        and the Supabase `apikey` header.

import type { ProjectDoc } from '../core/types';
import { quotePayloadJSON } from '../core/quote';

/** MEJA CRM & Order Management — public Vercel deployment, quote intake route. */
const DEFAULT_QUOTE_URL = 'https://meja-crm-order-management.vercel.app/api/quotes';

interface Endpoint {
  url: string;
  apiKey?: string;
}

function endpoint(): Endpoint {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  return { url: env.VITE_QUOTE_API_URL || DEFAULT_QUOTE_URL, apiKey: env.VITE_QUOTE_API_KEY };
}

/** The quote endpoint Atelier3D will POST to. */
export function quoteApiUrl(): string {
  return endpoint().url;
}

export interface QuoteSendResult {
  /** The request was accepted (2xx). */
  ok: boolean;
  /** A request was actually attempted (false = no endpoint configured). */
  sent: boolean;
  status?: number;
  message: string;
}

/** POSTs the quote payload to the configured quoting API. */
export async function sendQuote(doc: ProjectDoc): Promise<QuoteSendResult> {
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
      body: quotePayloadJSON(doc),
    });
    const text = await res.text().catch(() => '');
    return {
      ok: res.ok,
      sent: true,
      status: res.status,
      message: res.ok
        ? `Quote sent to the quoting system (${res.status}).`
        : `Quote API returned ${res.status}${text ? `: ${text.slice(0, 140)}` : ''}`,
    };
  } catch (e) {
    return { ok: false, sent: true, message: `Could not reach the quote API: ${String(e)}` };
  }
}
