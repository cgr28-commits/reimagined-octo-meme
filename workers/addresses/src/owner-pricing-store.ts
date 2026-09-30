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
} from "../shared/owner-pricing-config";
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
    if (!raw) return ownerPricingDefaults();
    return attachProfitability(raw, normalizeOwnerPricingSettings(raw));
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
      minibus: {
        ...defaultOwnerPricingSettings().minibus,
        publicEnabled: current.minibus.publicEnabled === true,
      },
      profitability: defaultProfitabilitySettings(),
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
  } else {
    const validated = validateOwnerPricingInput(input);
    if (!validated.ok) {
      throw new OwnerPricingValidationError(validated.errors);
    }
    const rawProfitability =
      input && typeof input === "object"
        ? (input as { profitability?: unknown }).profitability
        : undefined;
    const profitability =
      rawProfitability == null
        ? { ok: true as const, settings: current.profitability }
        : validateProfitabilitySettings(rawProfitability);
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
