export const AIRPORT_PREFILL_KEY = "my-airport-taxi-ni-prefill-airport";

const HEADER_SCROLL_OFFSET = 96;

export function prefillQuoteAirport(airportCode: string) {
  sessionStorage.setItem(AIRPORT_PREFILL_KEY, airportCode);
  window.dispatchEvent(
    new CustomEvent("quote-prefill-airport", { detail: airportCode }),
  );
  scrollToQuoteForm();
}

export function scrollToQuoteForm() {
  const quoteEl = document.getElementById("quote");
  if (!quoteEl) {
    window.location.hash = "quote";
    return;
  }

  const top =
    quoteEl.getBoundingClientRect().top + window.scrollY - HEADER_SCROLL_OFFSET;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  window.history.replaceState(null, "", "#quote");
}

export function readPrefillAirport(): string | null {
  const code = sessionStorage.getItem(AIRPORT_PREFILL_KEY);
  if (code) {
    sessionStorage.removeItem(AIRPORT_PREFILL_KEY);
  }
  return code;
}
