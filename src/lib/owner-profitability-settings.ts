/**
 * Owner-only profitability settings.
 *
 * Imported by the Owner Dashboard pricing tab and the Worker.
 * Do not import this module from public quote pages. It must not contain the
 * operating base, dead-mile routes, or home coordinates.
 */

export const DEFAULT_TARGET_HOURLY_EARNINGS_GBP = 40;
/** All-distance protected Saloon minimum. Separate from the £29 / 0–4 mile curve floor. */
export const DEFAULT_MINIMUM_SALOON_ONE_WAY_GBP = 38;
export const DEFAULT_DIESEL_PRICE_PER_LITRE_GBP = 2;
export const DEFAULT_WEAR_ALLOWANCE_PER_MILE_GBP = 0.1;
/**
 * Approved production MPG from the vehicle's 30-day average.
 * Not applied while saved MPG is blank. Saving this value is what activates
 * protection, and that save must wait for explicit deployment approval.
 */
export const APPROVED_PRODUCTION_VEHICLE_MPG = 47;
/**
 * Drive-to-pickup charge (owner option, OFF by default).
 * Every job starts and ends at the operating base. When ON, airport transfers
 * add a charge for the road miles between the base and the customer's address
 * end beyond a free radius. Independent of MPG / profitability protection.
 */
export const DEFAULT_POSITIONING_CHARGE_ENABLED = false;
export const DEFAULT_POSITIONING_FREE_MILES = 4;
export const DEFAULT_POSITIONING_RATE_PER_MILE_GBP = 1;
export const POSITIONING_FREE_MILES_MAX = 30;
export const POSITIONING_RATE_PER_MILE_MAX_GBP = 5;

/** UK gallon → litres. Fuel per mile = (diesel £/L × this) / MPG. */
export const UK_GALLON_LITRES = 4.54609;

export type ProfitabilitySettings = {
  targetHourlyEarningsGbp: number;
  minimumSaloonOneWayGbp: number;
  dieselPricePerLitreGbp: number;
  /** Blank until the owner enters a real figure. Protection stays off. */
  vehicleMpg: number | null;
  wearAllowancePerMileGbp: number;
  /** Charge for the drive from the base to the customer's address end. */
  positioningChargeEnabled: boolean;
  /** Road miles from the base that are never charged. */
  positioningFreeMiles: number;
  /** £ per road mile beyond the free miles, rounded to whole pounds per leg. */
  positioningRatePerMileGbp: number;
};

export type ProfitabilityValidationError = {
  field: string;
  message: string;
};

export function defaultProfitabilitySettings(): ProfitabilitySettings {
  return {
    targetHourlyEarningsGbp: DEFAULT_TARGET_HOURLY_EARNINGS_GBP,
    minimumSaloonOneWayGbp: DEFAULT_MINIMUM_SALOON_ONE_WAY_GBP,
    dieselPricePerLitreGbp: DEFAULT_DIESEL_PRICE_PER_LITRE_GBP,
    vehicleMpg: null,
    wearAllowancePerMileGbp: DEFAULT_WEAR_ALLOWANCE_PER_MILE_GBP,
    positioningChargeEnabled: DEFAULT_POSITIONING_CHARGE_ENABLED,
    positioningFreeMiles: DEFAULT_POSITIONING_FREE_MILES,
    positioningRatePerMileGbp: DEFAULT_POSITIONING_RATE_PER_MILE_GBP,
  };
}

/** Approved production preset. Callers must not write this to KV until deployment is approved. */
export function approvedProductionProfitabilitySettings(): ProfitabilitySettings {
  return {
    ...defaultProfitabilitySettings(),
    vehicleMpg: APPROVED_PRODUCTION_VEHICLE_MPG,
  };
}

export function isProfitabilityProtectionActive(
  settings: Pick<ProfitabilitySettings, "vehicleMpg"> | null | undefined,
): boolean {
  const mpg = settings?.vehicleMpg;
  return typeof mpg === "number" && Number.isFinite(mpg) && mpg > 0;
}

export function isPositioningChargeActive(
  settings:
    | Pick<ProfitabilitySettings, "positioningChargeEnabled" | "positioningRatePerMileGbp">
    | null
    | undefined,
): boolean {
  return (
    settings?.positioningChargeEnabled === true &&
    typeof settings.positioningRatePerMileGbp === "number" &&
    Number.isFinite(settings.positioningRatePerMileGbp) &&
    settings.positioningRatePerMileGbp > 0
  );
}

/**
 * Whole-pound charge for one leg. `milesFromBase` is road miles between the
 * operating base and the customer's address end. Zero when OFF or inside the
 * free radius.
 */
export function positioningChargeFromMilesGbp(
  milesFromBase: number,
  settings:
    | Pick<
        ProfitabilitySettings,
        "positioningChargeEnabled" | "positioningFreeMiles" | "positioningRatePerMileGbp"
      >
    | null
    | undefined,
): number {
  if (!isPositioningChargeActive(settings) || !settings) return 0;
  if (!Number.isFinite(milesFromBase) || milesFromBase <= 0) return 0;
  const chargeable = milesFromBase - Math.max(0, settings.positioningFreeMiles);
  if (chargeable <= 0) return 0;
  return Math.round(chargeable * settings.positioningRatePerMileGbp);
}

/** Read-only fuel cost. Null until a valid MPG is set. */
export function fuelCostPerMileGbp(
  dieselPricePerLitreGbp: number,
  vehicleMpg: number | null | undefined,
): number | null {
  if (typeof vehicleMpg !== "number" || !Number.isFinite(vehicleMpg) || vehicleMpg <= 0) {
    return null;
  }
  if (!Number.isFinite(dieselPricePerLitreGbp) || dieselPricePerLitreGbp < 0) {
    return null;
  }
  return (dieselPricePerLitreGbp * UK_GALLON_LITRES) / vehicleMpg;
}

function readBounded(
  value: unknown,
  field: string,
  errors: ProfitabilityValidationError[],
  bounds: { min: number; max: number; fallback: number },
): number {
  if (value == null || value === "") return bounds.fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    errors.push({ field, message: "Enter a valid number." });
    return bounds.fallback;
  }
  if (n < bounds.min || n > bounds.max) {
    errors.push({
      field,
      message: `Enter a value from ${bounds.min} to ${bounds.max}.`,
    });
    return bounds.fallback;
  }
  return Math.round(n * 100) / 100;
}

function readBoolean(
  value: unknown,
  field: string,
  errors: ProfitabilityValidationError[],
  fallback: boolean,
): boolean {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  errors.push({ field, message: "Choose ON or OFF." });
  return fallback;
}

function readPositioning(
  input: Record<string, unknown>,
  errors: ProfitabilityValidationError[],
  defaults: ProfitabilitySettings,
): Pick<
  ProfitabilitySettings,
  "positioningChargeEnabled" | "positioningFreeMiles" | "positioningRatePerMileGbp"
> {
  return {
    positioningChargeEnabled: readBoolean(
      input.positioningChargeEnabled,
      "profitability.positioningChargeEnabled",
      errors,
      defaults.positioningChargeEnabled,
    ),
    positioningFreeMiles: readBounded(
      input.positioningFreeMiles,
      "profitability.positioningFreeMiles",
      errors,
      { min: 0, max: POSITIONING_FREE_MILES_MAX, fallback: defaults.positioningFreeMiles },
    ),
    positioningRatePerMileGbp: readBounded(
      input.positioningRatePerMileGbp,
      "profitability.positioningRatePerMileGbp",
      errors,
      {
        min: 0,
        max: POSITIONING_RATE_PER_MILE_MAX_GBP,
        fallback: defaults.positioningRatePerMileGbp,
      },
    ),
  };
}

function readMpg(
  value: unknown,
  errors: ProfitabilityValidationError[],
): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 200) {
    errors.push({
      field: "profitability.vehicleMpg",
      message: "Enter a vehicle MPG above 0, or leave it blank. Blank keeps protection off.",
    });
    return null;
  }
  return Math.round(n * 10) / 10;
}

/**
 * Safe read. Missing or corrupt profitability settings disable protection
 * (MPG blank) and never reject the rest of the pricing document.
 */
export function normalizeProfitabilitySettings(raw: unknown): ProfitabilitySettings {
  const defaults = defaultProfitabilitySettings();
  if (!raw || typeof raw !== "object") return defaults;
  const input = raw as Record<string, unknown>;
  const errors: ProfitabilityValidationError[] = [];
  const vehicleMpg = readMpg(input.vehicleMpg, errors);
  return {
    targetHourlyEarningsGbp: readBounded(
      input.targetHourlyEarningsGbp,
      "profitability.targetHourlyEarningsGbp",
      errors,
      { min: 0, max: 250, fallback: defaults.targetHourlyEarningsGbp },
    ),
    minimumSaloonOneWayGbp: readBounded(
      input.minimumSaloonOneWayGbp,
      "profitability.minimumSaloonOneWayGbp",
      errors,
      { min: 1, max: 250, fallback: defaults.minimumSaloonOneWayGbp },
    ),
    dieselPricePerLitreGbp: readBounded(
      input.dieselPricePerLitreGbp,
      "profitability.dieselPricePerLitreGbp",
      errors,
      { min: 0.5, max: 5, fallback: defaults.dieselPricePerLitreGbp },
    ),
    vehicleMpg: errors.some((item) => item.field === "profitability.vehicleMpg")
      ? null
      : vehicleMpg,
    wearAllowancePerMileGbp: readBounded(
      input.wearAllowancePerMileGbp,
      "profitability.wearAllowancePerMileGbp",
      errors,
      { min: 0, max: 2, fallback: defaults.wearAllowancePerMileGbp },
    ),
    // Corrupt values fall back to OFF / defaults rather than rejecting pricing.
    ...readPositioning(input, [], defaults),
  };
}

export function validateProfitabilitySettings(
  raw: unknown,
):
  | { ok: true; settings: ProfitabilitySettings }
  | { ok: false; errors: ProfitabilityValidationError[] } {
  const defaults = defaultProfitabilitySettings();
  const input =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!input) {
    return {
      ok: false,
      errors: [{ field: "profitability", message: "Profitability settings are missing." }],
    };
  }
  const errors: ProfitabilityValidationError[] = [];
  const vehicleMpg = readMpg(input.vehicleMpg, errors);
  const settings: ProfitabilitySettings = {
    targetHourlyEarningsGbp: readBounded(
      input.targetHourlyEarningsGbp,
      "profitability.targetHourlyEarningsGbp",
      errors,
      { min: 0, max: 250, fallback: defaults.targetHourlyEarningsGbp },
    ),
    minimumSaloonOneWayGbp: readBounded(
      input.minimumSaloonOneWayGbp,
      "profitability.minimumSaloonOneWayGbp",
      errors,
      { min: 1, max: 250, fallback: defaults.minimumSaloonOneWayGbp },
    ),
    dieselPricePerLitreGbp: readBounded(
      input.dieselPricePerLitreGbp,
      "profitability.dieselPricePerLitreGbp",
      errors,
      { min: 0.5, max: 5, fallback: defaults.dieselPricePerLitreGbp },
    ),
    vehicleMpg,
    wearAllowancePerMileGbp: readBounded(
      input.wearAllowancePerMileGbp,
      "profitability.wearAllowancePerMileGbp",
      errors,
      { min: 0, max: 2, fallback: defaults.wearAllowancePerMileGbp },
    ),
    ...readPositioning(input, errors, defaults),
  };
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, settings };
}

export function describeProfitabilityValue(
  path: keyof ProfitabilitySettings,
  settings: ProfitabilitySettings,
): string {
  switch (path) {
    case "targetHourlyEarningsGbp":
      return `£${settings.targetHourlyEarningsGbp.toFixed(2)}/hour`;
    case "minimumSaloonOneWayGbp":
      return `£${settings.minimumSaloonOneWayGbp.toFixed(2)}`;
    case "dieselPricePerLitreGbp":
      return `£${settings.dieselPricePerLitreGbp.toFixed(2)}/litre`;
    case "vehicleMpg":
      return settings.vehicleMpg == null ? "Not set" : String(settings.vehicleMpg);
    case "wearAllowancePerMileGbp":
      return `£${settings.wearAllowancePerMileGbp.toFixed(2)}/mile`;
    case "positioningChargeEnabled":
      return settings.positioningChargeEnabled ? "ON" : "OFF";
    case "positioningFreeMiles":
      return `${settings.positioningFreeMiles} miles`;
    case "positioningRatePerMileGbp":
      return `£${settings.positioningRatePerMileGbp.toFixed(2)}/mile`;
    default:
      return "";
  }
}

const PROFITABILITY_DIFFS: Array<{ path: keyof ProfitabilitySettings; label: string }> = [
  { path: "targetHourlyEarningsGbp", label: "Target earnings after direct costs" },
  { path: "minimumSaloonOneWayGbp", label: "Minimum Saloon one-way fare" },
  { path: "dieselPricePerLitreGbp", label: "Diesel price" },
  { path: "vehicleMpg", label: "Vehicle MPG" },
  { path: "wearAllowancePerMileGbp", label: "Vehicle wear and maintenance" },
  { path: "positioningChargeEnabled", label: "Drive-to-pickup charge" },
  { path: "positioningFreeMiles", label: "Drive-to-pickup free miles" },
  { path: "positioningRatePerMileGbp", label: "Drive-to-pickup rate" },
];

export function diffProfitabilitySettings(
  previous: ProfitabilitySettings,
  next: ProfitabilitySettings,
): Array<{ setting: string; oldValue: string; newValue: string }> {
  return PROFITABILITY_DIFFS.flatMap(({ path, label }) => {
    const oldValue = describeProfitabilityValue(path, previous);
    const newValue = describeProfitabilityValue(path, next);
    if (oldValue === newValue) return [];
    return [{ setting: label, oldValue, newValue }];
  });
}
