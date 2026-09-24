import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type {
  OwnerPricingAuditEntry,
  OwnerPricingSettings,
  PublicOwnerPricingConfig,
} from "../../shared/owner-pricing-config";
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from "../../shared/owner-pricing-config";
import {
  isBrowserPricingPreview,
  previewPublicPricingConfig,
  readPreviewPricingState,
  restorePreviewPricingState,
  savePreviewPricingState,
} from "@/lib/pricing-preview-store";

const WORKER_BASE = resolveWorkerBaseUrl();

async function ownerFetch(path: string, ownerKey: string, init?: RequestInit) {
  const response = await fetch(`${WORKER_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Owner-Key": ownerKey.trim(),
      ...(init?.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      (body as { error?: string }).error || `Pricing request failed (${response.status})`,
    ) as Error & { status?: number; code?: string; errors?: Array<{ field: string; message: string }> };
    error.status = response.status;
    error.code = (body as { code?: string }).code;
    error.errors = (body as { errors?: Array<{ field: string; message: string }> }).errors;
    throw error;
  }
  return body;
}

export async function fetchOwnerPricing(ownerKey: string): Promise<{
  settings: OwnerPricingSettings;
  defaults: OwnerPricingSettings;
  audit: OwnerPricingAuditEntry[];
}> {
  if (isBrowserPricingPreview()) {
    return readPreviewPricingState();
  }
  return ownerFetch("/owner/pricing", ownerKey) as Promise<{
    settings: OwnerPricingSettings;
    defaults: OwnerPricingSettings;
    audit: OwnerPricingAuditEntry[];
  }>;
}

export async function saveOwnerPricing(
  ownerKey: string,
  settings: OwnerPricingSettings,
  expectedVersion: number,
): Promise<{
  settings: OwnerPricingSettings;
  defaults: OwnerPricingSettings;
  audit: OwnerPricingAuditEntry[];
}> {
  if (isBrowserPricingPreview()) {
    return savePreviewPricingState(settings, expectedVersion);
  }
  return ownerFetch("/owner/pricing", ownerKey, {
    method: "POST",
    body: JSON.stringify({ settings, expectedVersion }),
  }) as Promise<{
    settings: OwnerPricingSettings;
    defaults: OwnerPricingSettings;
    audit: OwnerPricingAuditEntry[];
  }>;
}

export async function restoreOwnerPricingDefaults(
  ownerKey: string,
  expectedVersion: number,
): Promise<{
  settings: OwnerPricingSettings;
  defaults: OwnerPricingSettings;
  audit: OwnerPricingAuditEntry[];
}> {
  if (isBrowserPricingPreview()) {
    return restorePreviewPricingState(expectedVersion);
  }
  return ownerFetch("/owner/pricing", ownerKey, {
    method: "POST",
    body: JSON.stringify({ action: "restore-defaults", expectedVersion }),
  }) as Promise<{
    settings: OwnerPricingSettings;
    defaults: OwnerPricingSettings;
    audit: OwnerPricingAuditEntry[];
  }>;
}

export async function fetchPublicPricingConfig(): Promise<PublicOwnerPricingConfig> {
  if (isBrowserPricingPreview()) {
    return previewPublicPricingConfig();
  }
  try {
    const response = await fetch(`${WORKER_BASE}/pricing/public`, {
      headers: { Accept: "application/json" },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== "object" || !(body as { config?: unknown }).config) {
      return toPublicOwnerPricingConfig(defaultOwnerPricingSettings());
    }
    const config = (body as { config: PublicOwnerPricingConfig }).config;
    return {
      ...config,
      minibus: {
        ...config.minibus,
        publicEnabled: config.minibus?.publicEnabled === true,
      },
    };
  } catch {
    return toPublicOwnerPricingConfig(defaultOwnerPricingSettings());
  }
}
