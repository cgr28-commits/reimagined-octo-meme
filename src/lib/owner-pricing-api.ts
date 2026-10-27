import { DEFAULT_TERMINAL_ACCESS_FEES } from "../../shared/terminal-access-config";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import { withRequestDeadline } from "@/lib/request-deadline";
import type {
  OwnerPricingAuditEntry,
  OwnerPricingSettings,
  PublicOwnerPricingConfig,
} from "../../shared/owner-pricing-config";
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig, validateOwnerPricingInput } from "../../shared/owner-pricing-config";
import type { OwnerProfitabilityReport } from "@/lib/owner-profitability-report";
import {
  isBrowserPricingPreview,
  hasPreviewPricingOverrides,
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
  saloonFormulaEditorVersion?: number;
  postcodeRulesEditorVersion?: number;
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
    body: JSON.stringify({ settings, expectedVersion, postcodeRulesEditorVersion: 2 }),
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

export async function previewOwnerProfitability(
  ownerKey: string,
  input: {
    pickupAddress: string;
    dropoffAddress: string;
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    outboundDate: string;
    outboundTime: string;
    returnJourney: boolean;
    returnDate: string;
    returnTime: string;
    vehicleType: string;
    expressSelected: boolean;
  },
): Promise<{ report: OwnerProfitabilityReport; positioningChargeGbp?: number }> {
  return ownerFetch("/owner/profitability-test", ownerKey, {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ report: OwnerProfitabilityReport; positioningChargeGbp?: number }>;
}

export async function fetchPublicPricingConfig(
  options: { strict?: boolean; signal?: AbortSignal } = {},
): Promise<PublicOwnerPricingConfig> {
  if (hasPreviewPricingOverrides()) {
    return previewPublicPricingConfig();
  }
  try {
    const config = await withRequestDeadline(async (signal) => {
      const response = await fetch(`${WORKER_BASE}/pricing/public`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal,
      });
      const body = await response.json();
      if (!response.ok || !body || typeof body !== "object" || !body.config || typeof body.config !== "object") {
        throw new Error("Could not load pricing settings");
      }
      if (options.strict && !validateOwnerPricingInput(body.config).ok) {
        throw new Error("Invalid pricing settings");
      }
      return body.config as PublicOwnerPricingConfig;
    }, 10_000, options.signal);
    return {
      ...config,
      terminalAccess: config.terminalAccess ?? { ...DEFAULT_TERMINAL_ACCESS_FEES },
      minibus: {
        ...config.minibus,
        publicEnabled: config.minibus?.publicEnabled === true,
      },
    };
  } catch (error) {
    if (options.strict || options.signal?.aborted) throw error;
    return toPublicOwnerPricingConfig(defaultOwnerPricingSettings());
  }
}

export type PostcodeProfitabilityPreview = {
  fareGbp: number; totalMiles: number; drivingMinutes: number; passengerMiles: number;
  fuelCostGbp: number; wearCostGbp: number; airportCostsGbp: number; directCostsGbp: number;
  contributionGbp: number; hourlyGbp: number; targetHourlyGbp: number; belowTarget: boolean; measuredAt: string;
};

export function previewOwnerPostcodeRule(ownerKey: string, input: {
  rule: import("../../shared/postcode-pricing").PostcodePricingRule;
  address: string; lat: number; lng: number; vehicle: "saloon" | "estate";
}): Promise<{ preview: PostcodeProfitabilityPreview }> {
  return ownerFetch("/owner/postcode-preview", ownerKey, { method: "POST", body: JSON.stringify(input) }) as Promise<{ preview: PostcodeProfitabilityPreview }>;
}
