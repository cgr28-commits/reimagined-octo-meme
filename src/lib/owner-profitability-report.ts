/**
 * Owner-tester response shape. Types only — no operating base and no fare formula.
 * Safe for the owner dashboard. Do not add home coordinates to this type.
 */

export type ProfitabilityRule =
  | "EXISTING FARE"
  | "MINIMUM FARE"
  | "PROFITABILITY FLOOR"
  | "NOT ACTIVE";

export type ProfitabilityLegReport = {
  passengerMiles: number;
  passengerMinutes: number;
  operationalMiles: number | null;
  operationalMinutes: number | null;
  existingCurveFareGbp: number;
  existingVehicleFareGbp: number;
  minimumSaloonFareGbp: number;
  fuelCostPerMileGbp: number | null;
  fuelCostGbp: number | null;
  wearCostGbp: number | null;
  targetTimeEarningsGbp: number | null;
  profitabilityFloorGbp: number | null;
  protectedSaloonFareGbp: number | null;
  protectedVehicleFareGbp: number | null;
  nightWeekendSurchargeGbp: number;
  rule: ProfitabilityRule;
};

export type OwnerProfitabilityReport = {
  protectionActive: boolean;
  fallbackReason: string | null;
  outbound: ProfitabilityLegReport;
  returnLeg: ProfitabilityLegReport | null;
  airportFixedCostsGbp: number;
  expressFeeGbp: number;
  existingCustomerFareGbp: number;
  journeyFareGbp: number;
  finalCustomerPriceGbp: number;
  directCostsGbp: number | null;
  estimatedRemainingAfterDirectCostsGbp: number | null;
  estimatedEarningsPerHourGbp: number | null;
};
