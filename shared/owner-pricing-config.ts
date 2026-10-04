/**
 * Owner-configurable pricing overlay.
 *
 * The Worker remains the authoritative pricing engine. This module only
 * describes configuration, validation, safe fallbacks, and preview helpers.
 * Missing or corrupt configuration MUST resolve to the current approved
 * code defaults so introducing this file does not change customer prices.
 *
 * Public 7 Seater Minibus defaults OFF and must never fail open.
 */

import {
  UNIVERSAL_ESTATE_PREMIUM_GBP,
  UNIVERSAL_SALOON_FLOOR_MILES,
  UNIVERSAL_SALOON_KNOTS,
  UNIVERSAL_SALOON_MINIMUM_GBP,
  calculateUniversalEstateJourneyFareGbp,
  calculateUniversalJourneyFareGbp,
  calculateUniversalSaloonJourneyFareGbp,
  type UniversalVehicleKind,
} from "./universal-distance-pricing";
import { RETURN_JOURNEY_DISCOUNT_RATE } from "./return-journey-discount";
import { NIGHT_WEEKEND_SURCHARGE_RATE } from "./night-weekend-surcharge";

export const OWNER_PRICING_SCHEMA_VERSION = 1 as const;

export const DEFAULT_ESTATE_UPLIFT_GBP = UNIVERSAL_ESTATE_PREMIUM_GBP;
export const DEFAULT_MINIBUS_MULTIPLIER = 1.55;
export const DEFAULT_RETURN_DISCOUNT_RATE = RETURN_JOURNEY_DISCOUNT_RATE;
export const DEFAULT_NIGHT_SURCHARGE_RATE = NIGHT_WEEKEND_SURCHARGE_RATE;
export const DEFAULT_WEEKEND_SURCHARGE_RATE = NIGHT_WEEKEND_SURCHARGE_RATE;
/** Current approved Night window: Mon–Fri 22:00–05:59 (06:00 is not Night). */
export const DEFAULT_NIGHT_START_MINUTES = 22 * 60;
export const DEFAULT_NIGHT_END_MINUTES = 6 * 60;
/** Current approved Weekend: all day Saturday and Sunday (Europe/London). */
export const DEFAULT_WEEKEND_DAYS = [0, 6] as const;
export const DEFAULT_PUBLIC_MINIBUS_ENABLED = false;

export const PUBLIC_MINIBUS_UNAVAILABLE_CODE = "vehicle_unavailable";
export const PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE =
  "7 Seater Minibus is currently unavailable for online booking. Please choose another vehicle or contact us.";

export const PRICE_CHANGED_CODE = "fare_mismatch";
export const PRICE_CHANGED_MESSAGE = "The price for this journey has been updated.";

export const SURCHARGE_STACKING_RULE = "highest_applicable" as const;
export const SURCHARGE_STACKING_EXPLANATION =
  "When more than one premium period applies, the highest applicable surcharge is used. Night and Weekend currently use one combined window, so a qualifying journey receives only one surcharge — they are not added together.";

export const BANK_HOLIDAY_BEHAVIOUR_NOTE =
  "Daytime bank holidays are not an extra surcharge. There is no separate Bank Holiday calendar. Saturday and Sunday already qualify as Weekend. A weekday bank-holiday daytime journey is charged at the standard weekday rate unless it also falls inside Night hours.";

export const MINIBUS_LUGGAGE_DECISION_NOTE =
  "When public 7 Seater Minibus is ON, the public selector allows 0–7 large bags and 1–7 passengers. 5–7 passengers and 5–7 large bags require 7 Seater Minibus; Saloon/Estate keep their existing 1–4 passenger and 0–2 / 3–4 suitcase rules. 7 passengers + 7 large bags is accepted as a Minibus quote only — physical fit of every 7-seat vehicle for that combination has not been validated and is not treated as a Request Quote rule.";

export type OwnerPricingSchemaVersion = typeof OWNER_PRICING_SCHEMA_VERSION;

export type SaloonKnot = {
  miles: number;
  fareGbp: number;
};

export type OwnerPricingSettings = {
  schemaVersion: OwnerPricingSchemaVersion;
  version: number;
  updatedAt: string;
  saloon: {
    minimumFareGbp: number;
    floorMiles: number;
    knots: SaloonKnot[];
  };
  estate: {
    upliftGbp: number;
  };
  minibus: {
    publicEnabled: boolean;
    multiplier: number;
  };
  returnDiscount: {
    rate: number;
  };
  night: {
    enabled: boolean;
    surchargeRate: number;
    startMinutes: number;
    endMinutes: number;
  };
  weekend: {
    enabled: boolean;
    surchargeRate: number;
    days: number[];
  };
  bankHoliday: {
    sharesWeekendSurcharge: true;
    daytimeExtraSurcharge: false;
  };
  surchargeStacking: typeof SURCHARGE_STACKING_RULE;
};

export type OwnerPricingAuditChange = {
  setting: string;
  oldValue: string;
  newValue: string;
};

export type OwnerPricingAuditEntry = {
  id: string;
  at: string;
  actor?: string;
  version: number;
  changes: OwnerPricingAuditChange[];
};

export type OwnerPricingValidationError = {
  field: string;
  message: string;
};

export type OwnerPricingValidationResult =
  | { ok: true; settings: OwnerPricingSettings }
  | { ok: false; errors: OwnerPricingValidationError[] };

export type PublicOwnerPricingConfig = {
  schemaVersion: OwnerPricingSchemaVersion;
  version: number;
  updatedAt: string;
  saloon: OwnerPricingSettings["saloon"];
  estate: OwnerPricingSettings["estate"];
  minibus: {
    publicEnabled: boolean;
    multiplier: number;
  };
  returnDiscount: OwnerPricingSettings["returnDiscount"];
  night: OwnerPricingSettings["night"];
  weekend: OwnerPricingSettings["weekend"];
  surchargeStacking: typeof SURCHARGE_STACKING_RULE;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function minutesFromMidnight(value: unknown): number | null {
  if (isFiniteNumber(value) && Number.isInteger(value) && value >= 0 && value < 24 * 60) {
    return value;
  }
  if (typeof value === "string" && /^\d{1,2}:\d{2}$/.test(value.trim())) {
    const [hoursRaw, minutesRaw] = value.trim().split(":");
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    if (
      Number.isInteger(hours) &&
      Number.isInteger(minutes) &&
      hours >= 0 &&
      hours <= 23 &&
      minutes >= 0 &&
      minutes <= 59
    ) {
      return hours * 60 + minutes;
    }
  }
  return null;
}

export function formatMinutesAsTime(minutes: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.trunc(minutes)));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function parseOwnerTimeInput(value: unknown): number | null {
  return minutesFromMidnight(value);
}

function defaultSaloonKnots(): SaloonKnot[] {
  return UNIVERSAL_SALOON_KNOTS.map(([miles, fareGbp]) => ({ miles, fareGbp }));
}

export function defaultOwnerPricingSettings(
  now: Date = new Date(0),
): OwnerPricingSettings {
  return {
    schemaVersion: OWNER_PRICING_SCHEMA_VERSION,
    version: 1,
    updatedAt: now.toISOString(),
    saloon: {
      minimumFareGbp: UNIVERSAL_SALOON_MINIMUM_GBP,
      floorMiles: UNIVERSAL_SALOON_FLOOR_MILES,
      knots: defaultSaloonKnots(),
    },
    estate: {
      upliftGbp: DEFAULT_ESTATE_UPLIFT_GBP,
    },
    minibus: {
      publicEnabled: DEFAULT_PUBLIC_MINIBUS_ENABLED,
      multiplier: DEFAULT_MINIBUS_MULTIPLIER,
    },
    returnDiscount: {
      rate: DEFAULT_RETURN_DISCOUNT_RATE,
    },
    night: {
      enabled: true,
      surchargeRate: DEFAULT_NIGHT_SURCHARGE_RATE,
      startMinutes: DEFAULT_NIGHT_START_MINUTES,
      endMinutes: DEFAULT_NIGHT_END_MINUTES,
    },
    weekend: {
      enabled: true,
      surchargeRate: DEFAULT_WEEKEND_SURCHARGE_RATE,
      days: [...DEFAULT_WEEKEND_DAYS],
    },
    bankHoliday: {
      sharesWeekendSurcharge: true,
      daytimeExtraSurcharge: false,
    },
    surchargeStacking: SURCHARGE_STACKING_RULE,
  };
}

function reject(errors: OwnerPricingValidationError[], field: string, message: string) {
  errors.push({ field, message });
}

function readRate(value: unknown, field: string, errors: OwnerPricingValidationError[]): number | null {
  if (value == null || value === "") {
    reject(errors, field, "This value cannot be blank.");
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || Number.isNaN(n)) {
    reject(errors, field, "Enter a valid number. Blank, NaN and Infinity are not accepted.");
    return null;
  }
  if (!Number.isFinite(n) || n === Number.POSITIVE_INFINITY || n === Number.NEGATIVE_INFINITY) {
    reject(errors, field, "Infinity is not a valid rate.");
    return null;
  }
  return n;
}

export function validateOwnerPricingInput(
  raw: unknown,
): OwnerPricingValidationResult {
  const errors: OwnerPricingValidationError[] = [];
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      errors: [{ field: "settings", message: "Pricing settings are missing or not an object." }],
    };
  }
  const input = raw as Record<string, unknown>;
  const defaults = defaultOwnerPricingSettings();

  const saloonRaw = (input.saloon ?? {}) as Record<string, unknown>;
  const estateRaw = (input.estate ?? {}) as Record<string, unknown>;
  const minibusRaw = (input.minibus ?? {}) as Record<string, unknown>;
  const returnRaw = (input.returnDiscount ?? {}) as Record<string, unknown>;
  const nightRaw = (input.night ?? {}) as Record<string, unknown>;
  const weekendRaw = (input.weekend ?? {}) as Record<string, unknown>;

  const minimumFareGbp = readRate(saloonRaw.minimumFareGbp, "saloon.minimumFareGbp", errors);
  if (minimumFareGbp != null && (minimumFareGbp < 1 || minimumFareGbp > 250)) {
    reject(
      errors,
      "saloon.minimumFareGbp",
      "Saloon minimum fare must be between £1.00 and £250.00.",
    );
  }

  const floorMiles = readRate(saloonRaw.floorMiles, "saloon.floorMiles", errors);
  if (floorMiles != null && (floorMiles < 0 || floorMiles > 20 || !Number.isInteger(floorMiles))) {
    reject(errors, "saloon.floorMiles", "Saloon floor miles must be a whole number from 0 to 20.");
  }

  const knotsRaw = Array.isArray(saloonRaw.knots) ? saloonRaw.knots : null;
  if (!knotsRaw) {
    reject(errors, "saloon.knots", "Saloon distance points are required.");
  }
  const knots: SaloonKnot[] = [];
  if (knotsRaw) {
    if (knotsRaw.length < 2 || knotsRaw.length > 30) {
      reject(errors, "saloon.knots", "Saloon distance points must include between 2 and 30 entries.");
    }
    let previousMiles = -1;
    knotsRaw.forEach((entry, index) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const miles = readRate(row.miles, `saloon.knots.${index}.miles`, errors);
      const fareGbp = readRate(row.fareGbp, `saloon.knots.${index}.fareGbp`, errors);
      if (miles == null || fareGbp == null) return;
      if (miles <= previousMiles) {
        reject(
          errors,
          `saloon.knots.${index}.miles`,
          "Distance points must increase with each row.",
        );
      }
      if (miles < 0 || miles > 400) {
        reject(errors, `saloon.knots.${index}.miles`, "Each distance point must be between 0 and 400 miles.");
      }
      if (fareGbp < 1 || fareGbp > 800) {
        reject(errors, `saloon.knots.${index}.fareGbp`, "Each Saloon fare must be between £1.00 and £800.00.");
      }
      previousMiles = miles;
      knots.push({ miles, fareGbp });
    });
  }

  const estateUplift = readRate(estateRaw.upliftGbp, "estate.upliftGbp", errors);
  if (estateUplift != null && (estateUplift < 0 || estateUplift > 40)) {
    reject(errors, "estate.upliftGbp", "Estate uplift must be between £0.00 and £40.00.");
  }

  if (minibusRaw.publicEnabled != null && typeof minibusRaw.publicEnabled !== "boolean") {
    reject(errors, "minibus.publicEnabled", "Offer online must be on or off.");
  }

  const minibusMultiplier = readRate(minibusRaw.multiplier, "minibus.multiplier", errors);
  if (minibusMultiplier != null) {
    if (minibusMultiplier <= 0) {
      reject(errors, "minibus.multiplier", "7 Seater multiplier must be greater than zero.");
    } else if (minibusMultiplier < 1 || minibusMultiplier > 3) {
      reject(
        errors,
        "minibus.multiplier",
        "7 Seater multiplier must be between 1.00 and 3.00. Invalid values are rejected, not adjusted.",
      );
    }
  }

  const returnRate = readRate(returnRaw.rate, "returnDiscount.rate", errors);
  if (returnRate != null && (returnRate < 0 || returnRate > 0.5)) {
    reject(
      errors,
      "returnDiscount.rate",
      "Return Booking Discount must be between 0% and 50%.",
    );
  }

  if (nightRaw.enabled != null && typeof nightRaw.enabled !== "boolean") {
    reject(errors, "night.enabled", "Night pricing enabled must be on or off.");
  }
  const nightRate = readRate(nightRaw.surchargeRate, "night.surchargeRate", errors);
  if (nightRate != null && (nightRate < 0 || nightRate > 1)) {
    reject(errors, "night.surchargeRate", "Night surcharge must be between 0% and 100%.");
  }
  const nightStart = parseOwnerTimeInput(nightRaw.startMinutes ?? nightRaw.startTime);
  const nightEnd = parseOwnerTimeInput(nightRaw.endMinutes ?? nightRaw.endTime);
  if (nightStart == null) {
    reject(errors, "night.startMinutes", "Enter a valid Night start time.");
  }
  if (nightEnd == null) {
    reject(errors, "night.endMinutes", "Enter a valid Night end time.");
  }
  if (nightStart != null && nightEnd != null && nightStart === nightEnd) {
    reject(errors, "night.endMinutes", "Night start and end cannot be the same time.");
  }

  if (weekendRaw.enabled != null && typeof weekendRaw.enabled !== "boolean") {
    reject(errors, "weekend.enabled", "Weekend pricing enabled must be on or off.");
  }
  const weekendRate = readRate(weekendRaw.surchargeRate, "weekend.surchargeRate", errors);
  if (weekendRate != null && (weekendRate < 0 || weekendRate > 1)) {
    reject(errors, "weekend.surchargeRate", "Weekend surcharge must be between 0% and 100%.");
  }
  const weekendDaysRaw = Array.isArray(weekendRaw.days) ? weekendRaw.days : defaults.weekend.days;
  const weekendDays = weekendDaysRaw
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  if (weekendDays.length === 0) {
    reject(errors, "weekend.days", "Select at least one Weekend day.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const expectedVersion = Number(input.version);
  return {
    ok: true,
    settings: {
      schemaVersion: OWNER_PRICING_SCHEMA_VERSION,
      version: Number.isInteger(expectedVersion) && expectedVersion > 0 ? expectedVersion : defaults.version,
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : defaults.updatedAt,
      saloon: {
        minimumFareGbp: minimumFareGbp ?? defaults.saloon.minimumFareGbp,
        floorMiles: floorMiles ?? defaults.saloon.floorMiles,
        knots: knots.length >= 2 ? knots : defaults.saloon.knots,
      },
      estate: {
        upliftGbp: estateUplift ?? defaults.estate.upliftGbp,
      },
      minibus: {
        publicEnabled: minibusRaw.publicEnabled === true,
        multiplier: minibusMultiplier ?? defaults.minibus.multiplier,
      },
      returnDiscount: {
        rate: returnRate ?? defaults.returnDiscount.rate,
      },
      night: {
        enabled: nightRaw.enabled !== false,
        surchargeRate: nightRate ?? defaults.night.surchargeRate,
        startMinutes: nightStart ?? defaults.night.startMinutes,
        endMinutes: nightEnd ?? defaults.night.endMinutes,
      },
      weekend: {
        enabled: weekendRaw.enabled !== false,
        surchargeRate: weekendRate ?? defaults.weekend.surchargeRate,
        days: weekendDays,
      },
      bankHoliday: {
        sharesWeekendSurcharge: true,
        daytimeExtraSurcharge: false,
      },
      surchargeStacking: SURCHARGE_STACKING_RULE,
    },
  };
}

/**
 * Safe read path. Corrupt, partial, or unknown-schema objects fall back to
 * approved defaults. Public Minibus never fails open.
 */
export function normalizeOwnerPricingSettings(raw: unknown): OwnerPricingSettings {
  const defaults = defaultOwnerPricingSettings();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }
  const input = raw as Record<string, unknown>;
  const schemaVersion = Number(input.schemaVersion);
  if (schemaVersion !== OWNER_PRICING_SCHEMA_VERSION && Number.isFinite(schemaVersion) && schemaVersion > OWNER_PRICING_SCHEMA_VERSION) {
    return defaults;
  }

  const validated = validateOwnerPricingInput(raw);
  if (!validated.ok) {
    return defaults;
  }

  return {
    ...validated.settings,
    minibus: {
      ...validated.settings.minibus,
      publicEnabled: (input.minibus as { publicEnabled?: unknown } | undefined)?.publicEnabled === true,
    },
    bankHoliday: defaults.bankHoliday,
    surchargeStacking: SURCHARGE_STACKING_RULE,
  };
}

export function toPublicOwnerPricingConfig(
  settings: OwnerPricingSettings,
): PublicOwnerPricingConfig {
  return {
    schemaVersion: settings.schemaVersion,
    version: settings.version,
    updatedAt: settings.updatedAt,
    saloon: settings.saloon,
    estate: settings.estate,
    minibus: {
      publicEnabled: settings.minibus.publicEnabled === true,
      multiplier: settings.minibus.multiplier,
    },
    returnDiscount: settings.returnDiscount,
    night: settings.night,
    weekend: settings.weekend,
    surchargeStacking: SURCHARGE_STACKING_RULE,
  };
}

export function ownerPricingEngineOptions(settings?: OwnerPricingSettings | PublicOwnerPricingConfig | null) {
  const resolved = settings ? normalizeOwnerPricingSettings(settings) : defaultOwnerPricingSettings();
  return {
    estatePremiumGbp: resolved.estate.upliftGbp,
    minibusMultiplier: resolved.minibus.multiplier,
    saloonMinimumGbp: resolved.saloon.minimumFareGbp,
    saloonFloorMiles: resolved.saloon.floorMiles,
    saloonKnots: resolved.saloon.knots.map((knot) => [knot.miles, knot.fareGbp] as const),
    returnDiscountRate: resolved.returnDiscount.rate,
    nightEnabled: resolved.night.enabled,
    nightRate: resolved.night.surchargeRate,
    nightStartMinutes: resolved.night.startMinutes,
    nightEndMinutes: resolved.night.endMinutes,
    weekendEnabled: resolved.weekend.enabled,
    weekendRate: resolved.weekend.surchargeRate,
    weekendDays: resolved.weekend.days,
    publicMinibusEnabled: resolved.minibus.publicEnabled === true,
  };
}

export function formatPercentFromRate(rate: number): string {
  const pct = Math.round(Number(rate) * 1000) / 10;
  if (!Number.isFinite(pct)) return "0%";
  return Number.isInteger(pct) ? `${pct}%` : `${pct}%`;
}

export function describeOwnerPricingValue(path: string, settings: OwnerPricingSettings): string {
  switch (path) {
    case "saloon.minimumFareGbp":
      return `£${settings.saloon.minimumFareGbp.toFixed(2)}`;
    case "saloon.floorMiles":
      return `${settings.saloon.floorMiles} miles`;
    case "saloon.knots":
      return settings.saloon.knots.map((knot) => `${knot.miles}mi £${knot.fareGbp}`).join(", ");
    case "estate.upliftGbp":
      return `£${settings.estate.upliftGbp.toFixed(2)}`;
    case "minibus.publicEnabled":
      return settings.minibus.publicEnabled ? "ON" : "OFF";
    case "minibus.multiplier":
      return String(settings.minibus.multiplier);
    case "returnDiscount.rate":
      return formatPercentFromRate(settings.returnDiscount.rate);
    case "night.enabled":
      return settings.night.enabled ? "ON" : "OFF";
    case "night.surchargeRate":
      return formatPercentFromRate(settings.night.surchargeRate);
    case "night.startMinutes":
      return formatMinutesAsTime(settings.night.startMinutes);
    case "night.endMinutes":
      return formatMinutesAsTime(settings.night.endMinutes);
    case "weekend.enabled":
      return settings.weekend.enabled ? "ON" : "OFF";
    case "weekend.surchargeRate":
      return formatPercentFromRate(settings.weekend.surchargeRate);
    case "weekend.days":
      return settings.weekend.days
        .map((day) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day] ?? String(day))
        .join(", ");
    default:
      return "";
  }
}

const DIFF_PATHS = [
  "saloon.minimumFareGbp",
  "saloon.floorMiles",
  "saloon.knots",
  "estate.upliftGbp",
  "minibus.publicEnabled",
  "minibus.multiplier",
  "returnDiscount.rate",
  "night.enabled",
  "night.surchargeRate",
  "night.startMinutes",
  "night.endMinutes",
  "weekend.enabled",
  "weekend.surchargeRate",
  "weekend.days",
] as const;

const DIFF_LABELS: Record<(typeof DIFF_PATHS)[number], string> = {
  "saloon.minimumFareGbp": "Saloon minimum fare",
  "saloon.floorMiles": "Saloon floor distance",
  "saloon.knots": "Saloon distance rates",
  "estate.upliftGbp": "Estate uplift",
  "minibus.publicEnabled": "7 Seater Minibus offer online",
  "minibus.multiplier": "7 Seater Minibus multiplier",
  "returnDiscount.rate": "Return Booking Discount",
  "night.enabled": "Night pricing",
  "night.surchargeRate": "Night surcharge",
  "night.startMinutes": "Night starts",
  "night.endMinutes": "Night ends",
  "weekend.enabled": "Weekend pricing",
  "weekend.surchargeRate": "Weekend surcharge",
  "weekend.days": "Weekend days",
};

export function diffOwnerPricingSettings(
  previous: OwnerPricingSettings,
  next: OwnerPricingSettings,
): OwnerPricingAuditChange[] {
  return DIFF_PATHS.flatMap((path) => {
    const oldValue = describeOwnerPricingValue(path, previous);
    const newValue = describeOwnerPricingValue(path, next);
    if (oldValue === newValue) return [];
    return [{ setting: DIFF_LABELS[path], oldValue, newValue }];
  });
}

export function minibusBaseFareFromSaloon(
  saloonGbp: number,
  settings?: OwnerPricingSettings | PublicOwnerPricingConfig | null,
): { estateGbp: number; minibusExactGbp: number; minibusQuotedGbp: number } {
  const options = ownerPricingEngineOptions(settings);
  const estateGbp = calculateUniversalEstateJourneyFareGbp(saloonGbp, options.estatePremiumGbp);
  const minibusExactGbp = Math.round(estateGbp * options.minibusMultiplier * 100) / 100;
  const quoted = calculateUniversalJourneyFareGbp(0, "Minibus (5–7 passengers)", {
    estatePremiumGbp: options.estatePremiumGbp,
    minibusMultiplier: options.minibusMultiplier,
    saloonFareGbp: saloonGbp,
  });
  return {
    estateGbp,
    minibusExactGbp,
    minibusQuotedGbp: quoted.journeyFareGbp,
  };
}

export function previewVehicleFaresFromSaloon(
  saloonGbp: number,
  settings?: OwnerPricingSettings | PublicOwnerPricingConfig | null,
) {
  const options = ownerPricingEngineOptions(settings);
  const estateGbp = calculateUniversalEstateJourneyFareGbp(saloonGbp, options.estatePremiumGbp);
  const minibus = minibusBaseFareFromSaloon(saloonGbp, settings);
  return {
    saloonGbp: Math.round(Number(saloonGbp) || 0),
    estateGbp,
    minibusExactGbp: minibus.minibusExactGbp,
    minibusQuotedGbp: minibus.minibusQuotedGbp,
    estateUpliftGbp: options.estatePremiumGbp,
    minibusMultiplier: options.minibusMultiplier,
  };
}

export function previewSurchargeOnBase(
  baseGbp: number,
  rate: number,
): { surchargeGbp: number; totalGbp: number } {
  const base = Number(baseGbp) || 0;
  const surchargeGbp = Math.round(base * rate * 100) / 100;
  return { surchargeGbp, totalGbp: Math.round((base + surchargeGbp) * 100) / 100 };
}

export function isPublicMinibusVehicle(vehicleType: string | null | undefined): boolean {
  return String(vehicleType ?? "").toLowerCase().includes("minibus");
}

export function publicMaxPassengers(publicMinibusEnabled: boolean): number {
  return publicMinibusEnabled === true ? 7 : 4;
}

export function publicMaxSuitcases(publicMinibusEnabled: boolean): number {
  return publicMinibusEnabled === true ? 5 : 4;
}

export function publicMinibusAllowed(
  vehicleType: string,
  options: { publicMinibusEnabled: boolean; ownerMode?: boolean },
): boolean {
  if (!isPublicMinibusVehicle(vehicleType)) return true;
  if (options.ownerMode) return true;
  return options.publicMinibusEnabled === true;
}

export type PremiumWindowRules = {
  nightEnabled: boolean;
  nightStartMinutes: number;
  nightEndMinutes: number;
  weekendEnabled: boolean;
  weekendDays: number[];
};

export function defaultPremiumWindowRules(): PremiumWindowRules {
  return {
    nightEnabled: true,
    nightStartMinutes: DEFAULT_NIGHT_START_MINUTES,
    nightEndMinutes: DEFAULT_NIGHT_END_MINUTES,
    weekendEnabled: true,
    weekendDays: [...DEFAULT_WEEKEND_DAYS],
  };
}

export function isWeekendDay(day: number, rules: PremiumWindowRules = defaultPremiumWindowRules()): boolean {
  return rules.weekendEnabled && rules.weekendDays.includes(day);
}

export function isNightMinutes(
  minutes: number,
  rules: PremiumWindowRules = defaultPremiumWindowRules(),
): boolean {
  if (!rules.nightEnabled) return false;
  const start = rules.nightStartMinutes;
  const end = rules.nightEndMinutes;
  if (start === end) return false;
  if (start > end) {
    return minutes >= start || minutes < end;
  }
  return minutes >= start && minutes < end;
}

export function surchargeRateForDateTime(input: {
  day: number;
  minutes: number;
  nightRate: number;
  weekendRate: number;
  rules?: PremiumWindowRules;
}): number {
  const rules = input.rules ?? defaultPremiumWindowRules();
  const weekend = isWeekendDay(input.day, rules);
  const night = !weekend && isNightMinutes(input.minutes, rules);
  const weekendAlsoNight = weekend && isNightMinutes(input.minutes, rules);
  const rates: number[] = [];
  if (night && rules.nightEnabled) rates.push(input.nightRate);
  if (weekend && rules.weekendEnabled) rates.push(input.weekendRate);
  if (weekendAlsoNight && rules.nightEnabled) rates.push(input.nightRate);
  if (rates.length === 0) return 0;
  return Math.max(...rates);
}

export function nightWeekendSurchargeLabel(settings?: OwnerPricingSettings | PublicOwnerPricingConfig | null): string {
  const options = ownerPricingEngineOptions(settings);
  const nightPct = formatPercentFromRate(options.nightRate);
  const weekendPct = formatPercentFromRate(options.weekendRate);
  if (nightPct === weekendPct) {
    return `Night & Weekend Surcharge (${nightPct})`;
  }
  return `Night ${nightPct} / Weekend ${weekendPct} surcharge`;
}

export function nightWeekendSurchargeExplanation(
  settings?: OwnerPricingSettings | PublicOwnerPricingConfig | null,
): string {
  const options = ownerPricingEngineOptions(settings);
  const nightPct = formatPercentFromRate(options.nightRate);
  const weekendPct = formatPercentFromRate(options.weekendRate);
  const start = formatMinutesAsTime(options.nightStartMinutes);
  const end = formatMinutesAsTime(options.nightEndMinutes);
  const weekendDays = options.weekendDays
    .slice()
    .sort((a, b) => a - b)
    .map((day) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day])
    .join(" and ");
  if (nightPct === weekendPct) {
    return `A ${nightPct} surcharge applies to journeys booked for pickup between ${start} and ${end} Monday–Friday, and all day ${weekendDays}.`;
  }
  return `A ${nightPct} Night surcharge applies between ${start} and ${end} Monday–Friday. A ${weekendPct} Weekend surcharge applies all day ${weekendDays}. When both apply, the higher surcharge is used.`;
}

export function quoteIncludesSurchargeLabel(
  settings?: OwnerPricingSettings | PublicOwnerPricingConfig | null,
): string {
  const options = ownerPricingEngineOptions(settings);
  const nightPct = formatPercentFromRate(options.nightRate);
  const weekendPct = formatPercentFromRate(options.weekendRate);
  if (nightPct === weekendPct) {
    return `Includes ${nightPct} Night & Weekend Surcharge`;
  }
  return `Includes Night ${nightPct} / Weekend ${weekendPct} surcharge`;
}

export function classifyConfiguredVehicle(vehicleType: string): UniversalVehicleKind {
  const value = String(vehicleType);
  if (value.includes("Estate")) return "estate";
  if (value.includes("Executive")) return "executive";
  if (value.toLowerCase().includes("minibus")) return "minibus";
  return "saloon";
}

export function calculateConfiguredSaloonFareGbp(
  roadMiles: number,
  settings?: OwnerPricingSettings | PublicOwnerPricingConfig | null,
): number {
  const options = ownerPricingEngineOptions(settings);
  return calculateUniversalSaloonJourneyFareGbp(roadMiles, {
    minimumGbp: options.saloonMinimumGbp,
    floorMiles: options.saloonFloorMiles,
    knots: options.saloonKnots,
  });
}
