// Live quote hook: POSTs the product/parts payload to MEJA's quoting system —
// a separate Vercel + Supabase app. The target is configured at build time:
//
//   VITE_QUOTE_API_URL   the receiving endpoint. Either a Vercel API route in
//                        the quoting app (https://<quoting-app>/api/quotes) or
//                        a Supabase Edge Function
//                        (https://<ref>.supabase.co/functions/v1/<name>).
//   VITE_QUOTE_API_KEY   the bearer/service token. Sent as both
//                        `Authorization: Bearer …` and the Supabase `apikey`
//                        header, so the same value works for either target.
//
// When no endpoint is configured the caller falls back to downloading the
// JSON, so the export always produces something.

import type { ProjectDoc } from '../core/types';
import { quotePayloadJSON } from '../core/quote';

interface Endpoint {
  url?: string;
  apiKey?: string;
}

function endpoint(): Endpoint {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  return { url: env.VITE_QUOTE_API_URL, apiKey: env.VITE_QUOTE_API_KEY };
}

/** True when a live quote endpoint is configured at build time. */
export function quoteApiConfigured(): boolean {
  return !!endpoint().url;
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
  if (!url) {
    return { ok: false, sent: false, message: 'No quote API configured (set VITE_QUOTE_API_URL).' };
  }
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
