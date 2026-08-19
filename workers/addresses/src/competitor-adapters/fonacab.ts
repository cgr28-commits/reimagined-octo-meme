/**
 * FonaCAB adapter — no safe public automated quote endpoint identified.
 * Quotes appear to be app-mediated; do not scrape protected surfaces.
 * Returns unavailable rather than inventing a price.
 */
import type { CompetitorPricingAdapter, CompetitorQuoteRequest, CompetitorQuoteResult } from "./types";

export const fonacabCompetitorAdapter: CompetitorPricingAdapter = {
  id: "fonacab",
  async fetchQuote(_request: CompetitorQuoteRequest): Promise<CompetitorQuoteResult> {
    return {
      competitor: "fonacab",
      unavailableReason:
        "no_safe_public_quote_api — FonaCAB quotes are app-mediated; automated web quoting not available without bypassing protections",
      fetchedAt: new Date().toISOString(),
    };
  },
};
