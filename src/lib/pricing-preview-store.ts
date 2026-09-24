/**
 * Isolated Owner Pricing store for Vercel/local preview only.
 * Never talks to the Worker. Never writes production KV.
 */

import {
  defaultOwnerPricingSettings,
  diffOwnerPricingSettings,
  toPublicOwnerPricingConfig,
  validateOwnerPricingInput,
  type OwnerPricingAuditEntry,
  type OwnerPricingSettings,
  type PublicOwnerPricingConfig,
} from "../../shared/owner-pricing-config";
import { hostnameIsPricingPreview } from "../../shared/pricing-preview-isolation";

const SETTINGS_KEY = "matni:preview-pricing-settings";
const AUDIT_KEY = "matni:preview-pricing-audit";
const MAX_AUDIT = 40;

export function isBrowserPricingPreview(): boolean {
  if (typeof window !== "undefined") {
    return hostnameIsPricingPreview(window.location.hostname);
  }
  return (
    process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.NODE_ENV === "development"
  );
}

export function previewMinibusQueryOverride(): boolean | null {
  if (typeof window === "undefined" || !isBrowserPricingPreview()) return null;
  const value = new URLSearchParams(window.location.search).get("previewMinibus");
  if (value === "1" || value === "on" || value === "true") return true;
  if (value === "0" || value === "off" || value === "false") return false;
  return null;
}

export function previewMinibusQueryEnabled(): boolean {
  return previewMinibusQueryOverride() === true;
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(key, JSON.stringify(value));
}

export function readPreviewPricingState(): {
  settings: OwnerPricingSettings;
  defaults: OwnerPricingSettings;
  audit: OwnerPricingAuditEntry[];
} {
  const defaults = defaultOwnerPricingSettings();
  const stored = readJson<OwnerPricingSettings>(SETTINGS_KEY);
  const audit = readJson<OwnerPricingAuditEntry[]>(AUDIT_KEY);
  return {
    settings: stored && typeof stored === "object" ? stored : defaults,
    defaults,
    audit: Array.isArray(audit) ? audit.slice(0, MAX_AUDIT) : [],
  };
}

function persistPreviewState(
  settings: OwnerPricingSettings,
  audit: OwnerPricingAuditEntry[],
): {
  settings: OwnerPricingSettings;
  defaults: OwnerPricingSettings;
  audit: OwnerPricingAuditEntry[];
} {
  writeJson(SETTINGS_KEY, settings);
  writeJson(AUDIT_KEY, audit);
  return { settings, defaults: defaultOwnerPricingSettings(), audit };
}

export function savePreviewPricingState(
  input: OwnerPricingSettings,
  expectedVersion: number,
): {
  settings: OwnerPricingSettings;
  defaults: OwnerPricingSettings;
  audit: OwnerPricingAuditEntry[];
} {
  const current = readPreviewPricingState();
  if (
    Number.isInteger(expectedVersion) &&
    current.settings.updatedAt !== new Date(0).toISOString() &&
    expectedVersion !== current.settings.version
  ) {
    const error = new Error("Pricing was updated in another preview session. Refresh and try again.") as Error & {
      status?: number;
      code?: string;
    };
    error.status = 409;
    error.code = "stale_pricing_config";
    throw error;
  }
  const validated = validateOwnerPricingInput(input);
  if (!validated.ok) {
    const error = new Error(validated.errors[0]?.message || "Pricing settings are invalid.") as Error & {
      status?: number;
      code?: string;
      errors?: Array<{ field: string; message: string }>;
    };
    error.status = 400;
    error.code = "invalid_pricing_config";
    error.errors = validated.errors;
    throw error;
  }
  const next: OwnerPricingSettings = {
    ...validated.settings,
    version: current.settings.version + 1,
    updatedAt: new Date().toISOString(),
  };
  const changes = diffOwnerPricingSettings(current.settings, next);
  const audit =
    changes.length > 0
      ? [
          {
            id: `preview-${next.version}-${Date.now()}`,
            at: next.updatedAt,
            actor: "preview",
            version: next.version,
            changes,
          },
          ...current.audit,
        ].slice(0, MAX_AUDIT)
      : current.audit;
  return persistPreviewState(next, audit);
}

export function restorePreviewPricingState(expectedVersion: number): {
  settings: OwnerPricingSettings;
  defaults: OwnerPricingSettings;
  audit: OwnerPricingAuditEntry[];
} {
  const current = readPreviewPricingState();
  const restored = {
    ...defaultOwnerPricingSettings(new Date()),
    minibus: {
      ...defaultOwnerPricingSettings().minibus,
      publicEnabled: current.settings.minibus.publicEnabled === true,
    },
    version: current.settings.version + 1,
    updatedAt: new Date().toISOString(),
  };
  void expectedVersion;
  const changes = diffOwnerPricingSettings(current.settings, restored);
  const audit =
    changes.length > 0
      ? [
          {
            id: `preview-${restored.version}-${Date.now()}`,
            at: restored.updatedAt,
            actor: "preview",
            version: restored.version,
            changes,
          },
          ...current.audit,
        ].slice(0, MAX_AUDIT)
      : current.audit;
  return persistPreviewState(restored, audit);
}

export function previewPublicPricingConfig(): PublicOwnerPricingConfig {
  const config = toPublicOwnerPricingConfig(readPreviewPricingState().settings);
  const override = previewMinibusQueryOverride();
  if (override == null) return config;
  return {
    ...config,
    minibus: { ...config.minibus, publicEnabled: override },
  };
}
