import { rawUniversalSaloonJourneyFareGbp } from "../../shared/universal-distance-pricing";
import type { OwnerPricingSettings, SaloonKnot } from "../../shared/owner-pricing-config";

export const LONG_DISTANCE_TIER_MILES = [125, 150, 200, 250, 300] as const;

/** Extend only the owner's draft; persistence still uses the normal reviewed save. */
export function addLongDistanceTiers(saloon: OwnerPricingSettings["saloon"]): OwnerPricingSettings["saloon"] {
  const knots = saloon.knots;
  if (knots.length < 2 || knots.some((knot, index) =>
    !Number.isFinite(knot.miles) || !Number.isFinite(knot.fareGbp) ||
    (index > 0 && knot.miles <= knots[index - 1]!.miles))) {
    throw new Error("Correct the existing mileage tiers before adding longer-distance tiers.");
  }
  const missing = LONG_DISTANCE_TIER_MILES.filter(miles => !knots.some(knot => knot.miles === miles));
  if (knots.length + missing.length > 30) {
    throw new Error("The pricing curve can contain up to 30 mileage tiers.");
  }
  const curve = { minimumGbp: saloon.minimumFareGbp, floorMiles: saloon.floorMiles,
    knots: knots.map(knot => [knot.miles, knot.fareGbp] as const) };
  const added: SaloonKnot[] = missing.map(miles => ({
    miles, fareGbp: rawUniversalSaloonJourneyFareGbp(miles, curve),
  }));
  return { ...saloon, knots: [...knots.map(knot => ({ ...knot })), ...added].sort((a, b) => a.miles - b.miles) };
}
