import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type { SmartOpsConfig } from "../../shared/smart-ops-config";
import type { SmartAvailabilityException, SmartAvailabilityRule } from "../../shared/smart-availability";
import type { SmartShadowRecord } from "../../shared/smart-shadow";

const WORKER_BASE = resolveWorkerBaseUrl();

export type SmartOpsState = {
  config: SmartOpsConfig;
  rules: SmartAvailabilityRule[];
  exceptions: SmartAvailabilityException[];
  links: Array<{
    id: string;
    parentBookingId: string;
    linkedBookingId?: string;
    linkedFareGbp: number;
    linkedMinGbp: number;
    standaloneMinGbp: number;
    createdAt: string;
  }>;
  updatedAt: string;
};

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
    throw new Error((body as { error?: string }).error || `Smart ops request failed (${response.status})`);
  }
  return body;
}

export async function fetchSmartOpsState(ownerKey: string): Promise<{
  state: SmartOpsState;
  shadow: SmartShadowRecord[];
}> {
  return ownerFetch("/owner/smart-ops", ownerKey) as Promise<{
    state: SmartOpsState;
    shadow: SmartShadowRecord[];
  }>;
}

export async function saveSmartOpsAction(
  ownerKey: string,
  body: Record<string, unknown>,
): Promise<{ state: SmartOpsState }> {
  return ownerFetch("/owner/smart-ops", ownerKey, {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<{ state: SmartOpsState }>;
}

export async function evaluateSmartOpsTest(ownerKey: string, body: Record<string, unknown>) {
  return ownerFetch("/owner/smart-ops/evaluate", ownerKey, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchSmartOpsCalendar(ownerKey: string, from: string, to: string) {
  const params = new URLSearchParams({ from, to });
  return ownerFetch(`/owner/smart-ops/calendar?${params.toString()}`, ownerKey);
}

export type EmptyLegsPreviewResponse = {
  ok: true;
  report: import("../../shared/empty-legs-preview").EmptyLegsPreviewReport;
  discountsActive: false;
  unlockBlocked: true;
  message: string;
};

export type EmptyLegsPreviewCsvResponse = {
  ok: true;
  csv: string;
  filename: string;
  assumptions: import("../../shared/empty-legs-preview").EmptyLegsPreviewReport["assumptions"];
  liveSmartReturnPricing: boolean;
  liveReturnCorridorMatching: boolean;
};

export async function fetchEmptyLegsPreview(
  ownerKey: string,
  from: string,
  to: string,
): Promise<EmptyLegsPreviewResponse> {
  const params = new URLSearchParams({ from, to });
  return ownerFetch(`/owner/smart-ops/empty-legs?${params.toString()}`, ownerKey) as Promise<EmptyLegsPreviewResponse>;
}

export async function fetchEmptyLegsPreviewCsv(
  ownerKey: string,
  from: string,
  to: string,
): Promise<EmptyLegsPreviewCsvResponse> {
  const params = new URLSearchParams({ from, to, format: "csv" });
  return ownerFetch(
    `/owner/smart-ops/empty-legs?${params.toString()}`,
    ownerKey,
  ) as Promise<EmptyLegsPreviewCsvResponse>;
}

export type EmptyRunSettingsPublic = {
  enabled: boolean;
  maxDiscountPercent: number;
  minFareGbp: number;
  updatedAt: string;
};

export async function fetchEmptyRunSettings(ownerKey: string): Promise<EmptyRunSettingsPublic> {
  const body = (await ownerFetch("/owner/smart-ops/empty-run", ownerKey)) as { settings: EmptyRunSettingsPublic };
  return body.settings;
}

export async function saveEmptyRunSettings(
  ownerKey: string,
  patch: Partial<Pick<EmptyRunSettingsPublic, "enabled" | "maxDiscountPercent" | "minFareGbp">>,
): Promise<EmptyRunSettingsPublic> {
  const body = (await ownerFetch("/owner/smart-ops/empty-run", ownerKey, {
    method: "POST",
    body: JSON.stringify(patch),
  })) as { settings: EmptyRunSettingsPublic };
  return body.settings;
}
