import { RETURN_BOOKING_DISCOUNT_RETIRED, returnDiscountRateForRecord } from "../shared/return-journey-discount";
/**
 * Owner pricing settings + lightweight audit history (KV).
 * Public Minibus never fails open. Corrupt payloads fall back to approved defaults.
 */

import {
  defaultOwnerPricingSettings,
  diffOwnerPricingSettings,
  normalizeOwnerPricingSettings,
  validateOwnerPricingInput,
  type OwnerPricingAuditChange,
  type OwnerPricingAuditEntry,
  type OwnerPricingSettings,
  businessClassInstantFromMiles,
} from "../shared/owner-pricing-config";
import { postcodeRuleKey } from "../shared/postcode-pricing";
import {
  defaultProfitabilitySettings,
  diffProfitabilitySettings,
  normalizeProfitabilitySettings,
  validateProfitabilitySettings,
  type ProfitabilitySettings,
} from "../../../src/lib/owner-profitability-settings";

export type StoredOwnerPricingSettings = OwnerPricingSettings & {
  profitability: ProfitabilitySettings;
};

const SETTINGS_KEY = "owner:pricing-settings";
const AUDIT_KEY = "owner:pricing-audit";
const TTL = 60 * 60 * 24 * 365 * 5;
const MAX_AUDIT = 40;

export class OwnerPricingConflictError extends Error {
  readonly code = "stale_pricing_config";
  constructor() {
    super("Pricing was updated in another session. Refresh and try again.");
    this.name = "OwnerPricingConflictError";
  }
}

export class OwnerPricingValidationError extends Error {
  readonly code = "invalid_pricing_config";
  readonly errors: Array<{ field: string; message: string }>;
  constructor(errors: Array<{ field: string; message: string }>) {
    super(errors[0]?.message || "Pricing settings are invalid.");
    this.name = "OwnerPricingValidationError";
    this.errors = errors;
  }
}

function attachProfitability(
  raw: unknown,
  settings: OwnerPricingSettings,
): StoredOwnerPricingSettings {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  let next = settings;
  const storedUplift = (source.estate as { upliftGbp?: unknown } | undefined)?.upliftGbp;
  if (source.profitability == null && Number(storedUplift) === 6) {
    next = { ...settings, estate: { upliftGbp: defaultOwnerPricingSettings().estate.upliftGbp } };
  }
  return {
    ...next,
    profitability: normalizeProfitabilitySettings(source.profitability),
  };
}

/**
 * The automatic 5% return-booking discount is retired (owner, Nov 2026 — replaced by email
 * promo codes). Whatever rate an older saved pricing record holds, live pricing uses 0%.
 * Legacy saved quotes / Personal Quotes put their own rate back (see savedQuotePricingFor).
 */
export function retireReturnBookingDiscount<T extends { returnDiscount: { rate: number } }>(settings: T): T {
  if (!RETURN_BOOKING_DISCOUNT_RETIRED) return settings;
  return { ...settings, returnDiscount: { ...settings.returnDiscount, rate: 0 } };
}

/** A saved quote made before the retirement is re-priced with the 5% it was quoted with. */
export function savedQuotePricingFor<T extends { returnDiscount: { rate: number } }>(
  settings: T,
  record: { returnDiscountRate?: number | null },
): T {
  const rate = returnDiscountRateForRecord(record);
  return rate === settings.returnDiscount.rate ? settings : { ...settings, returnDiscount: { ...settings.returnDiscount, rate } };
}

export function ownerPricingDefaults(): StoredOwnerPricingSettings {
  return {
    ...defaultOwnerPricingSettings(),
    profitability: defaultProfitabilitySettings(),
  };
}

export async function getOwnerPricingSettings(
  store: KVNamespace,
): Promise<StoredOwnerPricingSettings> {
  try {
    const raw = await store.get(SETTINGS_KEY, "json");
    if (!raw) return retireReturnBookingDiscount(ownerPricingDefaults());
    return retireReturnBookingDiscount(attachProfitability(raw, normalizeOwnerPricingSettings(raw)));
  } catch {
    return ownerPricingDefaults();
  }
}

export async function listOwnerPricingAudit(
  store: KVNamespace,
): Promise<OwnerPricingAuditEntry[]> {
  try {
    const raw = await store.get(AUDIT_KEY, "json");
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry) => entry && typeof entry === "object").slice(0, MAX_AUDIT);
  } catch {
    return [];
  }
}

async function putOwnerPricingSettings(
  store: KVNamespace,
  settings: StoredOwnerPricingSettings,
): Promise<StoredOwnerPricingSettings> {
  await store.put(SETTINGS_KEY, JSON.stringify(settings), { expirationTtl: TTL });
  return settings;
}

async function appendOwnerPricingAudit(
  store: KVNamespace,
  entry: OwnerPricingAuditEntry,
): Promise<void> {
  const current = await listOwnerPricingAudit(store);
  const next = [entry, ...current].slice(0, MAX_AUDIT);
  await store.put(AUDIT_KEY, JSON.stringify(next), { expirationTtl: TTL });
}

export async function saveOwnerPricingSettings(
  store: KVNamespace,
  input: unknown,
  options: { expectedVersion?: number; actor?: string; restoreDefaults?: boolean } = {},
): Promise<{ settings: StoredOwnerPricingSettings; audit: OwnerPricingAuditEntry[] }> {
  const current = await getOwnerPricingSettings(store);
  if (
    options.expectedVersion != null &&
    Number.isInteger(options.expectedVersion) &&
    current.updatedAt !== new Date(0).toISOString() &&
    options.expectedVersion !== current.version
  ) {
    throw new OwnerPricingConflictError();
  }

  let next: StoredOwnerPricingSettings;
  if (options.restoreDefaults) {
    next = {
      ...defaultOwnerPricingSettings(new Date()),
      postcodeRules: current.postcodeRules ?? [],
      postcodePricingEnabled: current.postcodePricingEnabled === true,
      minibus: {
        ...defaultOwnerPricingSettings().minibus,
        publicEnabled: current.minibus.publicEnabled === true,
        requestQuote: current.minibus.requestQuote === true,
      },
      executive: {
        ...defaultOwnerPricingSettings().executive,
        publicEnabled: current.executive.publicEnabled !== false,
        requestQuote: current.executive.requestQuote === true,
        instantFromMiles: businessClassInstantFromMiles(current),
      },
      profitability: defaultProfitabilitySettings(),
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
  } else {
    // Older clients must not silently erase separately managed postcode rules.
    const validated = validateOwnerPricingInput(input && typeof input === "object"
      ? { ...input, terminalAccess: (input as { terminalAccess?: unknown }).terminalAccess ?? current.terminalAccess, evening: (input as { evening?: unknown }).evening === undefined ? current.evening : (input as { evening?: unknown }).evening, christmas: (input as { christmas?: unknown }).christmas === undefined ? current.christmas : (input as { christmas?: unknown }).christmas, bfsMinimumSaloonFareGbp: (input as { bfsMinimumSaloonFareGbp?: unknown }).bfsMinimumSaloonFareGbp === undefined ? current.bfsMinimumSaloonFareGbp : (input as { bfsMinimumSaloonFareGbp?: unknown }).bfsMinimumSaloonFareGbp, bhdMinimumSaloonFareGbp: (input as { bhdMinimumSaloonFareGbp?: unknown }).bhdMinimumSaloonFareGbp === undefined ? current.bhdMinimumSaloonFareGbp : (input as { bhdMinimumSaloonFareGbp?: unknown }).bhdMinimumSaloonFareGbp, saloonFormula: (input as { saloonFormula?: unknown }).saloonFormula ?? current.saloonFormula, postcodeRules: (input as { postcodeRules?: unknown }).postcodeRules ?? current.postcodeRules ?? [], postcodePricingEnabled: (input as { postcodePricingEnabled?: unknown }).postcodePricingEnabled ?? current.postcodePricingEnabled ?? false }
      : input);
    if (!validated.ok) {
      throw new OwnerPricingValidationError(validated.errors);
    }
    const rawProfitability =
      input && typeof input === "object"
        ? (input as { profitability?: unknown }).profitability
        : undefined;
    // Fields an older dashboard does not send (e.g. the drive-to-pickup charge)
    // keep their saved values instead of silently resetting to defaults.
    const profitability =
      rawProfitability == null
        ? { ok: true as const, settings: current.profitability }
        : validateProfitabilitySettings(
            rawProfitability && typeof rawProfitability === "object"
              ? { ...current.profitability, ...(rawProfitability as Record<string, unknown>) }
              : rawProfitability,
          );
    if (!profitability.ok) {
      throw new OwnerPricingValidationError(profitability.errors);
    }
    next = {
      ...validated.settings,
      profitability: profitability.settings,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
  }

  if (!options.restoreDefaults) {
    // Server-owned timestamps: imports/clients cannot forge when a fare changed.
    next.postcodeRules = (next.postcodeRules ?? []).map(rule => {
      const previous = current.postcodeRules?.find(r => postcodeRuleKey(r) === postcodeRuleKey(rule));
      const content = ({ updatedAt: _at, ...rest }: typeof rule) => JSON.stringify(rest);
      return { ...rule, updatedAt: previous && content(previous) === content(rule) ? previous.updatedAt : next.updatedAt };
    });
    for (const airport of ["BFS", "BHD", "DUB"] as const) {
      if (next.meetGreetEmail?.enabled[airport]) {
        next.meetGreetEmail.enabledSince[airport] = current.meetGreetEmail?.enabled[airport]
          ? current.meetGreetEmail.enabledSince[airport] ?? new Date().toISOString() : new Date().toISOString();
      }
    }
  }

  const changes: OwnerPricingAuditChange[] = [
    ...diffOwnerPricingSettings(current, next),
    ...diffProfitabilitySettings(current.profitability, next.profitability),
  ];
  await putOwnerPricingSettings(store, next);
  if (changes.length > 0) {
    await appendOwnerPricingAudit(store, {
      id: `pricing-${next.version}-${Date.now()}`,
      at: next.updatedAt,
      actor: options.actor,
      version: next.version,
      changes,
    });
  }
  return { settings: next, audit: await listOwnerPricingAudit(store) };
}
