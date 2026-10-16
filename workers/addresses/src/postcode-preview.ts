import { validatePostcodeRules, postcodeDistrict, postcodeTerminalAccessGbp } from "../shared/postcode-pricing";
import { SERVED_AIRPORTS } from "../shared/served-airports";
import { getAirportLegFixedCostGbp } from "../shared/airport-fixed-costs";
import { roundGbp } from "../shared/gbp";
import { fuelCostPerMileGbp } from "../../../src/lib/owner-profitability-settings";
import { fetchCachedLeg, measureOperationalJob } from "./profitability";
import type { StoredOwnerPricingSettings } from "./owner-pricing-store";

/** Owner-authorised caller only. Pure read-only routing preview; never saves a rule or applies a floor. */
export async function previewPostcodeRule(body: Record<string, unknown>, settings: StoredOwnerPricingSettings) {
  const checked = validatePostcodeRules([body.rule]);
  if (checked.errors.length) throw new Error(checked.errors[0]);
  const rule = checked.rules[0];
  const address = String(body.address ?? "").trim();
  if (postcodeDistrict(address) !== rule.district) throw new Error("Select a full address in the rule’s postcode district.");
  const lat = body.lat, lng = body.lng;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 53.8 || lat > 55.5 || lng < -8.3 || lng > -5.3) throw new Error("Choose a Northern Ireland address from the existing suggestions.");
  const airport = SERVED_AIRPORTS.find(a => a.code === rule.airportCode);
  if (!airport) throw new Error("Select a supported airport.");
  const from = rule.direction === "from-airport";
  const point = { lat, lng };
  const pickup = from ? airport : point, dropoff = from ? point : airport;
  const passenger = await fetchCachedLeg(pickup, dropoff);
  if (!passenger) throw new Error("Routing unavailable. No mileage or profitability estimate has been invented.");
  const operations = await measureOperationalJob({ pickup, dropoff, passenger });
  if (!operations || operations.operationalMinutes <= 0) throw new Error("Home positioning route unavailable. Please try again.");
  const perMile = fuelCostPerMileGbp(settings.profitability.dieselPricePerLitreGbp, settings.profitability.vehicleMpg);
  if (perMile == null) throw new Error("Set a valid vehicle MPG in Pricing before estimating profitability.");
  const airportCosts = getAirportLegFixedCostGbp(rule.airportCode, from) + postcodeTerminalAccessGbp(rule.airportCode);
  const fuel = roundGbp(operations.operationalMiles * perMile);
  const wear = roundGbp(operations.operationalMiles * settings.profitability.wearAllowancePerMileGbp);
  const directCostsGbp = roundGbp(fuel + wear + airportCosts);
  const saloonPence = Math.round(rule.saloonFareGbp * 100);
  const fareGbp = (saloonPence + (body.vehicle === "estate" ? Math.round(settings.estate.upliftGbp * 100) : 0)) / 100;
  const contributionGbp = roundGbp(fareGbp - directCostsGbp);
  const hourlyGbp = roundGbp(contributionGbp / (operations.operationalMinutes / 60));
  return { fareGbp, totalMiles: Math.round(operations.operationalMiles * 10) / 10, drivingMinutes: Math.round(operations.operationalMinutes), passengerMiles: Math.round(passenger.distanceKm / 1.609344 * 10) / 10,
    fuelCostGbp: fuel, wearCostGbp: wear, airportCostsGbp: airportCosts, directCostsGbp, contributionGbp, hourlyGbp, targetHourlyGbp: 40, belowTarget: hourlyGbp < 40, measuredAt: new Date().toISOString() };
}
