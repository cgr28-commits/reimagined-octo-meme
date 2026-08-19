import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type { DailyPricingReport } from "../../shared/pricing-intelligence";

const WORKER_BASE = resolveWorkerBaseUrl();

export type PricingIntelligenceDashboard = {
  today: DailyPricingReport | null;
  last7: DailyPricingReport[];
  last30: DailyPricingReport[];
  biggestOverpricing: {
    journey: string;
    differenceGbp: number | null;
    differencePct: number | null;
    day: string;
  }[];
  biggestUnderpricing: {
    journey: string;
    differenceGbp: number | null;
    differencePct: number | null;
    day: string;
  }[];
  conversionPct7d: number;
  quoteCount7d: number;
  paid7d: number;
};

export async function fetchOwnerPricingIntelligence(
  ownerKey: string,
): Promise<PricingIntelligenceDashboard> {
  const response = await fetch(`${WORKER_BASE}/owner/pricing-intelligence`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Owner-Key": ownerKey,
    },
  });

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    data?: PricingIntelligenceDashboard;
    error?: string;
  } | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "Could not load pricing intelligence");
  }

  return payload.data;
}
