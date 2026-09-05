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
