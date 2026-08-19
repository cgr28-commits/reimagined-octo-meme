import type { CompetitorQuoteRequest, CompetitorQuoteResult, CompetitorPricingAdapter } from "./types";
import { fonacabCompetitorAdapter } from "./fonacab";
import { otsCompetitorAdapter } from "./ots";

export type { CompetitorQuoteRequest, CompetitorQuoteResult, CompetitorPricingAdapter } from "./types";
export { fonacabCompetitorAdapter } from "./fonacab";
export { otsCompetitorAdapter } from "./ots";

/** Independent adapters — more companies can be added later. */
const ADAPTERS: CompetitorPricingAdapter[] = [fonacabCompetitorAdapter, otsCompetitorAdapter];

export async function fetchCompetitorQuotes(
  request: CompetitorQuoteRequest,
): Promise<CompetitorQuoteResult[]> {
  return Promise.all(ADAPTERS.map((adapter) => adapter.fetchQuote(request)));
}

export async function fetchFonacabCompetitorQuote(
  request: CompetitorQuoteRequest,
): Promise<CompetitorQuoteResult> {
  return fonacabCompetitorAdapter.fetchQuote(request);
}

export async function fetchOtsCompetitorQuote(
  request: CompetitorQuoteRequest,
): Promise<CompetitorQuoteResult> {
  return otsCompetitorAdapter.fetchQuote(request);
}
