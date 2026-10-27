/**
 * Worker-only drive-to-pickup charge.
 *
 * Every job starts and ends at the operating base. When the owner switches the
 * charge ON, an address ↔ airport transfer adds a whole-pound amount per leg for
 * the road miles between the base and the customer's address end, beyond the
 * owner's free radius. The amount is folded into the vehicle fare before the
 * Night & Weekend surcharge and the return discount, so every downstream total
 * (quote, receipt, payment, breakdown) composes it the normal way.
 *
 * Privacy: never return the base, the miles, or the charge as a separate line
 * to a public caller. Customers only ever see the combined journey fare.
 *
 * Only server-resolved coordinates may be passed in (place-ID resolution the
 * payment handler also uses). Browser-supplied lat/lng must never set a price.
 */

import { universalDrivingMilesFromKm } from "../shared/universal-distance-pricing";
import {
  isPositioningChargeActive,
  positioningChargeFromMilesGbp,
  type ProfitabilitySettings,
} from "../../../src/lib/owner-profitability-settings";
import { OPERATING_BASE } from "./operating-base";
import { fetchCachedLeg, type RoutePoint } from "./profitability";

export { isPositioningChargeActive };

export type PositioningChargeResult = {
  chargeGbp: number;
  /** Why no charge applied. Internal logging only. */
  reason: "off" | "not_airport_transfer" | "missing_point" | "routing_failed" | null;
};

function finitePoint(point: RoutePoint | null | undefined): RoutePoint | null {
  if (!point) return null;
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return null;
  return { lat: point.lat, lng: point.lng };
}

/**
 * Charge for one leg of an address ↔ airport transfer. Both legs of a return
 * share the same address end, so callers apply the same amount to each leg.
 *
 * Fails open (no charge) when routing fails, so a routing outage never blocks
 * a booking. Quote and payment use the same resolver and cache, so both sides
 * normally agree; a rare disagreement surfaces as the existing
 * "please refresh your quote" response rather than a wrong charge.
 */
export async function resolvePositioningChargeGbp(input: {
  settings: Pick<
    ProfitabilitySettings,
    "positioningChargeEnabled" | "positioningFreeMiles" | "positioningRatePerMileGbp"
  > | null | undefined;
  /** Address ↔ airport transfers only. Address-to-address and airport-to-airport get no charge. */
  airportTransfer: boolean;
  fromAirport: boolean;
  pickup: RoutePoint | null | undefined;
  dropoff: RoutePoint | null | undefined;
}): Promise<PositioningChargeResult> {
  if (!isPositioningChargeActive(input.settings)) return { chargeGbp: 0, reason: "off" };
  if (!input.airportTransfer) return { chargeGbp: 0, reason: "not_airport_transfer" };
  const addressEnd = finitePoint(input.fromAirport ? input.dropoff : input.pickup);
  if (!addressEnd) {
    console.warn("[positioning] no charge reason=missing_point");
    return { chargeGbp: 0, reason: "missing_point" };
  }
  const leg = await fetchCachedLeg(OPERATING_BASE, addressEnd);
  if (!leg) {
    console.warn("[positioning] no charge reason=routing_failed");
    return { chargeGbp: 0, reason: "routing_failed" };
  }
  const miles = universalDrivingMilesFromKm(leg.distanceKm);
  return { chargeGbp: positioningChargeFromMilesGbp(miles, input.settings), reason: null };
}
