import { scheduleBookingNavAfterRender } from "@/lib/quote-step-nav-scroll";

export const AIRPORT_PREFILL_KEY = "my-airport-taxi-ni-prefill-airport";
export const QUOTE_DRAFT_PREFILL_KEY = "my-airport-taxi-ni-prefill-quote-draft";
export const QUOTE_DIRECTION_PREFILL_KEY = "my-airport-taxi-ni-prefill-direction";

/** Approximate sticky header height; `#quote` also uses measured offset via booking-nav. */
export const HEADER_SCROLL_OFFSET = 144;

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

export type OpenQuoteOptions = {
  airport?: string;
  direction?: "to-airport" | "from-airport";
  /** Preserve existing quote draft when only scrolling (default true). */
  preserveState?: boolean;
};

/**
 * Shared quote-opening handler for header CTAs, airport cards, flight cards,
 * and page-local “Get a Quote” buttons. Works even when the URL already has #quote.
 */
export function openQuote(options: OpenQuoteOptions = {}) {
  const { airport, direction, preserveState = true } = options;

  if (airport) {
    sessionStorage.setItem(AIRPORT_PREFILL_KEY, airport);
    window.dispatchEvent(
      new CustomEvent("quote-prefill-airport", { detail: airport }),
    );
  }

  if (direction) {
    sessionStorage.setItem(QUOTE_DIRECTION_PREFILL_KEY, direction);
    window.dispatchEvent(
      new CustomEvent("quote-prefill-direction", { detail: direction }),
    );
  }

  if (!preserveState && !airport && !direction) {
    // Explicit no-op placeholder for future reset+open flows.
  }

  scrollToQuoteForm();
}

export function prefillQuoteAirport(airportCode: string) {
  openQuote({ airport: airportCode });
}

/** Hand a completed chat quote into the live quote tool for booking. */
export function prefillQuoteFromAssistant(draft: QuoteDraftPrefill) {
  const payload: QuoteDraftPrefill = { ...draft, source: "assistant" };
  sessionStorage.setItem(QUOTE_DRAFT_PREFILL_KEY, JSON.stringify(payload));
  if (draft.airportCode) {
    sessionStorage.setItem(AIRPORT_PREFILL_KEY, draft.airportCode);
  }
  if (draft.direction) {
    sessionStorage.setItem(QUOTE_DIRECTION_PREFILL_KEY, draft.direction);
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

  scheduleBookingNavAfterRender("quote", { focusHeading: true });
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

export function readPrefillDirection(): "to-airport" | "from-airport" | null {
  const raw = sessionStorage.getItem(QUOTE_DIRECTION_PREFILL_KEY);
  if (raw) {
    sessionStorage.removeItem(QUOTE_DIRECTION_PREFILL_KEY);
  }
  if (raw === "to-airport" || raw === "from-airport") return raw;
  return null;
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
