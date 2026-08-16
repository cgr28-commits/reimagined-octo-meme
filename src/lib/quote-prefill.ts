export const AIRPORT_PREFILL_KEY = "my-airport-taxi-ni-prefill-airport";
export const QUOTE_DRAFT_PREFILL_KEY = "my-airport-taxi-ni-prefill-quote-draft";

/** Kept for callers that need a numeric offset; `#quote` uses CSS scroll-mt. */
export const HEADER_SCROLL_OFFSET = 152;

export type QuoteDraftPrefill = {
  source?: "assistant";
  airportCode?: string;
  direction?: "to-airport" | "from-airport";
  address?: string;
  passengers?: number;
  suitcases?: number;
  vehicle?: string;
  returnJourney?: boolean;
  tripDate?: string;
  tripTime?: string;
  returnDate?: string;
  returnTime?: string;
};

export function prefillQuoteAirport(airportCode: string) {
  sessionStorage.setItem(AIRPORT_PREFILL_KEY, airportCode);
  window.dispatchEvent(
    new CustomEvent("quote-prefill-airport", { detail: airportCode }),
  );
  scrollToQuoteForm();
}

/** Hand a completed chat quote into the live quote tool for booking. */
export function prefillQuoteFromAssistant(draft: QuoteDraftPrefill) {
  const payload: QuoteDraftPrefill = { ...draft, source: "assistant" };
  sessionStorage.setItem(QUOTE_DRAFT_PREFILL_KEY, JSON.stringify(payload));
  if (draft.airportCode) {
    sessionStorage.setItem(AIRPORT_PREFILL_KEY, draft.airportCode);
  }
  window.dispatchEvent(
    new CustomEvent("quote-prefill-draft", { detail: payload }),
  );
  scrollToQuoteForm();
}

export function scrollToQuoteForm() {
  const quoteEl = document.getElementById("quote");
  if (!quoteEl) {
    const onHome =
      window.location.pathname === "/" || window.location.pathname === "";
    if (onHome) {
      window.location.hash = "quote";
      return;
    }
    window.location.assign("/#quote");
    return;
  }

  // CSS scroll-margin-top on `#quote` keeps the form clear of the sticky header.
  quoteEl.scrollIntoView({ behavior: "smooth", block: "start" });

  const path = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, "", `${path}#quote`);
}

export function readPrefillAirport(): string | null {
  const code = sessionStorage.getItem(AIRPORT_PREFILL_KEY);
  if (code) {
    sessionStorage.removeItem(AIRPORT_PREFILL_KEY);
  }
  return code;
}

export function readPrefillQuoteDraft(): QuoteDraftPrefill | null {
  const raw = sessionStorage.getItem(QUOTE_DRAFT_PREFILL_KEY);
  if (!raw) {
    return null;
  }
  sessionStorage.removeItem(QUOTE_DRAFT_PREFILL_KEY);
  try {
    return JSON.parse(raw) as QuoteDraftPrefill;
  } catch {
    return null;
  }
}
