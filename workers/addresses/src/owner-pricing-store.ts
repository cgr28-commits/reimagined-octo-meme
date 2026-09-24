/**
 * Owner pricing settings + lightweight audit history (KV).
 * Public Minibus never fails open. Corrupt payloads fall back to approved defaults.
 */

import {
  defaultOwnerPricingSettings,
  diffOwnerPricingSettings,
  normalizeOwnerPricingSettings,
  validateOwnerPricingInput,
  type OwnerPricingAuditEntry,
  type OwnerPricingSettings,
} from "../shared/owner-pricing-config";

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

export async function getOwnerPricingSettings(
  store: KVNamespace,
): Promise<OwnerPricingSettings> {
  try {
    const raw = await store.get(SETTINGS_KEY, "json");
    if (!raw) return defaultOwnerPricingSettings();
    return normalizeOwnerPricingSettings(raw);
  } catch {
    return defaultOwnerPricingSettings();
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
  settings: OwnerPricingSettings,
): Promise<OwnerPricingSettings> {
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
): Promise<{ settings: OwnerPricingSettings; audit: OwnerPricingAuditEntry[] }> {
  const current = await getOwnerPricingSettings(store);
  if (
    options.expectedVersion != null &&
    Number.isInteger(options.expectedVersion) &&
    current.updatedAt !== new Date(0).toISOString() &&
    options.expectedVersion !== current.version
  ) {
    throw new OwnerPricingConflictError();
  }

  let next: OwnerPricingSettings;
  if (options.restoreDefaults) {
    next = {
      ...defaultOwnerPricingSettings(new Date()),
      minibus: {
        ...defaultOwnerPricingSettings().minibus,
        publicEnabled: current.minibus.publicEnabled === true,
      },
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
  } else {
    const validated = validateOwnerPricingInput(input);
    if (!validated.ok) {
      throw new OwnerPricingValidationError(validated.errors);
    }
    next = {
      ...validated.settings,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
  }

  const changes = diffOwnerPricingSettings(current, next);
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
