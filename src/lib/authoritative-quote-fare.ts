/**
 * The first fare a customer can see must already be authoritative.
 *
 * The browser live quote starts from default Night & Weekend settings (10% on).
 * Painting that total before the worker quote — or the loaded public pricing
 * config, if the worker quote cannot be used — flashes a higher fare, then
 * drops it when the real surcharge is £0.
 *
 * This does not change the 10% rule, eligibility, or rate.
 */
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
  if (input.serverFareReady) return true;
  if (!input.publicPricingLoaded) return false;
  return input.serverQuoteUnavailable || input.previewSkipsServer;
}
