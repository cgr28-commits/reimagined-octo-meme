import { OPERATING_MODELS } from "./constants.js";

/**
 * Independent profitability per operating model. Pure. Unknown inputs stay unconfigured: the result lists exactly
 * what is missing and NEVER guesses a value. Airport profitability settings are not read or inherited.
 * All money is integer pence.
 */
export function profitability(settings, tourId, model) {
  const fin = settings.commercial.finance;
  const tour = settings.commercial.tours.find((t) => t.id === tourId);
  if (!tour) return { status: "unknown-tour" };
  if (!OPERATING_MODELS.includes(model)) return { status: "unknown-model" };
  const v = (x) => (x && x.value !== null && x.value !== undefined ? x.value : null);
  const inputs = {
    "tour.provisionalPricePence": v(tour.provisionalPricePence),
    "tour.durationHours": v(tour.durationHours),
    "tour.estimatedMiles": v(tour.estimatedMiles),
    "finance.vehicleRunningCostPencePerMile": v(fin.vehicleRunningCostPencePerMile),
    "finance.paymentProcessingFeePercent": v(fin.paymentProcessingFeePercent),
    "finance.paymentProcessingFeeFixedPence": v(fin.paymentProcessingFeeFixedPence),
    "finance.administrativeCostPencePerBooking": v(fin.administrativeCostPencePerBooking),
    "finance.advertisingAcquisitionCostPence": v(fin.advertisingAcquisitionCostPence),
    "finance.marginFloorPercent": v(fin.marginFloorPercent),
  };
  if (model === "paidDriver") inputs["finance.paidDriverHourlyPence"] = v(fin.paidDriverHourlyPence);
  if (model === "subcontractor") inputs["finance.subcontractorCostCeilingPercent"] = v(fin.subcontractorCostCeilingPercent);
  if (model === "owner") inputs["finance.selfDrivingHourlyEarningsTargetPence"] = v(fin.selfDrivingHourlyEarningsTargetPence);
  const missing = Object.keys(inputs).filter((k) => inputs[k] === null);
  if (missing.length) return { status: "unconfigured", missing };

  const price = inputs["tour.provisionalPricePence"];
  const hours = inputs["tour.durationHours"];
  const vehicle = Math.round(inputs["tour.estimatedMiles"] * inputs["finance.vehicleRunningCostPencePerMile"]);
  const processing = Math.round((price * inputs["finance.paymentProcessingFeePercent"]) / 100) + inputs["finance.paymentProcessingFeeFixedPence"];
  const common = vehicle + processing + inputs["finance.administrativeCostPencePerBooking"] + inputs["finance.advertisingAcquisitionCostPence"];
  let labour = 0; // owner driving is rewarded through profit, not a cost line
  if (model === "paidDriver") labour = Math.round(hours * inputs["finance.paidDriverHourlyPence"]);
  if (model === "subcontractor") labour = Math.round((price * inputs["finance.subcontractorCostCeilingPercent"]) / 100);
  const cost = common + labour;
  const profit = price - cost;
  const marginPercent = price > 0 ? (profit / price) * 100 : -100;
  const result = {
    status: "ok",
    model,
    pricePence: price,
    costPence: cost,
    profitPence: profit,
    marginPercent: Math.round(marginPercent * 100) / 100,
    belowMarginFloor: marginPercent < inputs["finance.marginFloorPercent"],
  };
  if (model === "owner") {
    result.hourlyEarningsPence = Math.round(profit / hours);
    result.belowHourlyEarningsTarget = result.hourlyEarningsPence < inputs["finance.selfDrivingHourlyEarningsTargetPence"];
  }
  return result;
}
