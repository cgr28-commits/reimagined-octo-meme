import { OPERATING_MODELS } from "./constants.js";

/**
 * Independent profitability per operating model (and per half-/full-day variant). Pure.
 * Unknown inputs stay unconfigured: the result lists exactly what is missing and NEVER guesses a value.
 * Airport profitability settings are not read or inherited. All money is integer pence.
 *
 * Home-to-home: the business runs from home, so every job includes positioning (home to first pick-up and last drop-off
 * to home). That mileage is charged at the vehicle running cost and that time counts as working time.
 *
 * Operating models:
 *  - owner                         own driving; vehicle cost applies; earnings per working hour reported
 *  - paidDriver                    driver uses a SUPPLIED vehicle: wage per working hour + vehicle cost
 *  - subcontractorOwnVehicle       subcontractor brings their own vehicle: payout (% of price) covers vehicle and time
 *  - subcontractorSuppliedVehicle  subcontractor drives a SUPPLIED vehicle: payout (% of price) + our vehicle cost
 */
export function resolveUnit(tour, variantId = null) {
  if (tour.variants.length) {
    if (!variantId) return { error: "variant-required", variants: tour.variants.map((v) => v.id) };
    const v = tour.variants.find((x) => x.id === variantId);
    return v ? { unit: v } : { error: "unknown-variant" };
  }
  if (variantId) return { error: "unknown-variant" };
  return { unit: tour };
}

export function profitability(settings, tourId, model, variantId = null) {
  const fin = settings.commercial.finance;
  const tour = settings.commercial.tours.find((t) => t.id === tourId);
  if (!tour) return { status: "unknown-tour" };
  if (!OPERATING_MODELS.includes(model)) return { status: "unknown-model" };
  const resolved = resolveUnit(tour, variantId);
  if (resolved.error) return { status: resolved.error, variants: resolved.variants };
  const unit = resolved.unit;
  const v = (x) => (x && x.value !== null && x.value !== undefined ? x.value : null);
  const usesBusinessVehicle = model !== "subcontractorOwnVehicle";
  const inputs = {
    "tour.provisionalPricePence": v(unit.provisionalPricePence),
    "tour.durationHours": v(unit.durationHours),
    "tour.estimatedMiles": v(unit.estimatedMiles),
    "tour.homePositioningMiles": v(unit.homePositioningMiles),
    "tour.homePositioningHours": v(unit.homePositioningHours),
    "finance.paymentProcessingFeePercent": v(fin.paymentProcessingFeePercent),
    "finance.paymentProcessingFeeFixedPence": v(fin.paymentProcessingFeeFixedPence),
    "finance.administrativeCostPencePerBooking": v(fin.administrativeCostPencePerBooking),
    "finance.advertisingAcquisitionCostPence": v(fin.advertisingAcquisitionCostPence),
    "finance.marginFloorPercent": v(fin.marginFloorPercent),
  };
  if (usesBusinessVehicle) inputs["finance.vehicleRunningCostPencePerMile"] = v(fin.vehicleRunningCostPencePerMile);
  if (model === "paidDriver") inputs["finance.paidDriverHourlyPence"] = v(fin.paidDriverHourlyPence);
  if (model === "subcontractorOwnVehicle") inputs["finance.subcontractorOwnVehicleCeilingPercent"] = v(fin.subcontractorOwnVehicleCeilingPercent);
  if (model === "subcontractorSuppliedVehicle") inputs["finance.subcontractorSuppliedVehicleFeePercent"] = v(fin.subcontractorSuppliedVehicleFeePercent);
  if (model === "owner") inputs["finance.selfDrivingHourlyEarningsTargetPence"] = v(fin.selfDrivingHourlyEarningsTargetPence);
  const missing = Object.keys(inputs).filter((k) => inputs[k] === null);
  if (missing.length) return { status: "unconfigured", missing, variantId };

  const price = inputs["tour.provisionalPricePence"];
  const workingHours = inputs["tour.durationHours"] + inputs["tour.homePositioningHours"];
  const totalMiles = inputs["tour.estimatedMiles"] + inputs["tour.homePositioningMiles"];
  const vehicle = usesBusinessVehicle ? Math.round(totalMiles * inputs["finance.vehicleRunningCostPencePerMile"]) : 0;
  const processing = Math.round((price * inputs["finance.paymentProcessingFeePercent"]) / 100) + inputs["finance.paymentProcessingFeeFixedPence"];
  const admin = inputs["finance.administrativeCostPencePerBooking"];
  const advertising = inputs["finance.advertisingAcquisitionCostPence"];
  let labour = 0; // owner driving is rewarded through profit, not a cost line
  if (model === "paidDriver") labour = Math.round(workingHours * inputs["finance.paidDriverHourlyPence"]);
  if (model === "subcontractorOwnVehicle") labour = Math.round((price * inputs["finance.subcontractorOwnVehicleCeilingPercent"]) / 100);
  if (model === "subcontractorSuppliedVehicle") labour = Math.round((price * inputs["finance.subcontractorSuppliedVehicleFeePercent"]) / 100);
  const cost = vehicle + processing + admin + advertising + labour;
  const profit = price - cost;
  const margin = price > 0 ? Math.round((profit / price) * 1000) / 10 : 0;
  const result = {
    status: "ok",
    model,
    variantId,
    pricePence: price,
    costPence: cost,
    profitPence: profit,
    marginPercent: margin,
    belowMarginFloor: margin < inputs["finance.marginFloorPercent"],
    workingHours,
    totalMiles,
    breakdown: { vehicle, labour, processing, admin, advertising },
  };
  if (model === "owner") {
    result.hourlyEarningsPence = Math.round(profit / workingHours);
    result.belowHourlyEarningsTarget = result.hourlyEarningsPence < inputs["finance.selfDrivingHourlyEarningsTargetPence"];
  }
  return result;
}
