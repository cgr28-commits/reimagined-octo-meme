/**
 * The first fare a customer can see must already be authoritative.
 *
 * The browser live quote starts from default Night & Weekend settings (10% on).
 * Painting that total before the worker quote flashes a higher fare, then
 * drops it when the real surcharge is £0.
 *
 * A failed worker quote must not fall back to the public curve. Profitability
 * protection is not in that curve, so the number can differ from the fare the
 * worker would approve. Preview hosts may still paint after public config loads.
 *
 * This does not change the 10% rule, eligibility, or rate.
 */
export const AUTHORITATIVE_QUOTE_UNAVAILABLE_MESSAGE =
  "We couldn’t load your price. Please try again.";

export function mayPaintAuthoritativeFare(input: {
  /** Worker split matches the current vehicle, party, and schedule. */
  serverFareReady: boolean;
  /** fetchPublicPricingConfig has replaced the default settings. */
  publicPricingLoaded: boolean;
  /** The worker quote finished without a usable fare. */
  serverQuoteUnavailable: boolean;
  /** Preview hosts that intentionally skip the worker quote. */
  previewSkipsServer: boolean;
}): boolean {
  // Kept so callers can still report a failed quote. Failure never paints a fare.
  void input.serverQuoteUnavailable;
  if (input.serverFareReady) return true;
  if (input.previewSkipsServer && input.publicPricingLoaded) return true;
  return false;
}
