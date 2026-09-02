/**
 * Owner-authenticated Ad Fraud dashboard API client.
 */

import { resolveWorkerBaseUrl } from "./worker-api";
import type {
  AdFraudReviewStatus,
  AdFraudRiskLevel,
  AdFraudVisitorRecord,
} from "../../shared/ad-fraud";

const WORKER_BASE = resolveWorkerBaseUrl();

export type AdFraudDashboardSummary = {
  paidVisitsToday: number;
  paidVisitsLast7Days: number;
  uniqueVisitorHashes: number;
  suspiciousVisitors: number;
  highRiskVisitors: number;
  visitorsWithQuotes: number;
  visitorsWithBookings: number;
};

export type AdFraudVisitorRow = {
  visitorHash: string;
  anonymisedId: string;
  risk: AdFraudRiskLevel;
  score: number;
  firstSeenAt: string;
  lastSeenAt: string;
  paidVisitsToday: number;
  paidVisits7Days: number;
  landingPaths: string[];
  campaigns: string[];
  quotes: number;
  bookings: number;
  whatsappClicks: number;
  phoneClicks: number;
  engagement: string;
  reasons: string[];
  reviewStatus: AdFraudReviewStatus;
  notes?: string;
};

export type AdFraudDashboardResponse = {
  ok: boolean;
  disclaimer?: string;
  blockingEnabled?: boolean;
  summary?: AdFraudDashboardSummary;
  visitors?: AdFraudVisitorRow[];
  error?: string;
};

export type AdFraudVisitorDetailResponse = {
  ok: boolean;
  disclaimer?: string;
  visitor?: AdFraudVisitorRecord & { anonymisedId: string };
  error?: string;
};

export async function fetchAdFraudDashboard(input: {
  ownerKey: string;
  range: "1" | "7" | "30";
  risk: "all" | AdFraudRiskLevel;
  campaign?: string;
}): Promise<AdFraudDashboardResponse> {
  const params = new URLSearchParams({
    range: input.range,
    risk: input.risk,
  });
  if (input.campaign?.trim()) params.set("campaign", input.campaign.trim());

  const response = await fetch(`${WORKER_BASE}/admin/ad-fraud?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Owner-Key": input.ownerKey,
    },
  });
  const payload = (await response.json().catch(() => null)) as AdFraudDashboardResponse | null;
  if (!response.ok || !payload) {
    return { ok: false, error: payload?.error || `Request failed (${response.status})` };
  }
  return payload;
}

export async function fetchAdFraudVisitor(input: {
  ownerKey: string;
  visitorHash: string;
}): Promise<AdFraudVisitorDetailResponse> {
  const response = await fetch(
    `${WORKER_BASE}/admin/ad-fraud/visitor/${encodeURIComponent(input.visitorHash)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Owner-Key": input.ownerKey,
      },
    },
  );
  const payload = (await response.json().catch(() => null)) as AdFraudVisitorDetailResponse | null;
  if (!response.ok || !payload) {
    return { ok: false, error: payload?.error || `Request failed (${response.status})` };
  }
  return payload;
}

export async function updateAdFraudVisitorReview(input: {
  ownerKey: string;
  visitorHash: string;
  reviewStatus: AdFraudReviewStatus;
  notes?: string;
}): Promise<AdFraudVisitorDetailResponse> {
  const response = await fetch(
    `${WORKER_BASE}/admin/ad-fraud/visitor/${encodeURIComponent(input.visitorHash)}`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Owner-Key": input.ownerKey,
      },
      body: JSON.stringify({
        reviewStatus: input.reviewStatus,
        notes: input.notes,
      }),
    },
  );
  const payload = (await response.json().catch(() => null)) as AdFraudVisitorDetailResponse | null;
  if (!response.ok || !payload) {
    return { ok: false, error: payload?.error || `Request failed (${response.status})` };
  }
  return payload;
}
