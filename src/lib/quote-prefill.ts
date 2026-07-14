export const AIRPORT_PREFILL_KEY = "my-airport-taxi-ni-prefill-airport";

export function prefillQuoteAirport(airportCode: string) {
  sessionStorage.setItem(AIRPORT_PREFILL_KEY, airportCode);
  window.dispatchEvent(
    new CustomEvent("quote-prefill-airport", { detail: airportCode }),
  );

  document.getElementById("quote")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export function readPrefillAirport(): string | null {
  const code = sessionStorage.getItem(AIRPORT_PREFILL_KEY);
  if (code) {
    sessionStorage.removeItem(AIRPORT_PREFILL_KEY);
  }
  return code;
}
