/**
 * KV persistence for Ad Fraud monitoring (TRACKING_STORE).
 */

import {
  AD_FRAUD_DAY_INDEX_CAP,
  AD_FRAUD_EVENT_TTL_SECONDS,
  AD_FRAUD_INGEST_RATE_LIMIT,
  AD_FRAUD_VISITOR_EVENT_CAP,
  AD_FRAUD_VISITOR_TTL_SECONDS,
  adFraudDayKey,
  adFraudEventKey,
  adFraudRateKey,
  adFraudVisitorKey,
  generateAdFraudEventId,
  hashAdFraudIp,
  hashAdFraudVisitorId,
  hashClickIdHint,
  normalizeUserAgent,
  recomputeVisitorScore,
  utcDayString,
  type AdFraudEventRecord,
  type AdFraudEventType,
  type AdFraudReviewStatus,
  type AdFraudRiskLevel,
  type AdFraudVisitorRecord,
} from "../shared/ad-fraud";
import type { AdsAttribution as Attr } from "../shared/ads-attribution";

export type AdFraudStoreEnv = {
  TRACKING_STORE?: KVNamespace;
  AD_FRAUD_HASH_SALT?: string;
};

function uniquePush(list: string[], value: string | undefined, cap: number): string[] {
  if (!value) return list;
  const next = list.includes(value) ? list : [...list, value];
  return next.slice(-cap);
}

function emptyVisitor(visitorHash: string, nowIso: string): AdFraudVisitorRecord {
  return {
    visitorHash,
    firstSeenAt: nowIso,
    lastSeenAt: nowIso,
    paidVisitCount: 0,
    quoteStartedCount: 0,
    quoteCompletedCount: 0,
    bookingStartedCount: 0,
    bookingCompletedCount: 0,
    paymentStartedCount: 0,
    paymentCompletedCount: 0,
    whatsappClickCount: 0,
    phoneClickCount: 0,
    landingPaths: [],
    campaigns: [],
    events: [],
    score: 0,
    risk: "normal",
    reasons: ["No elevated suspicion indicators"],
    reviewStatus: "unreviewed",
  };
}

function bumpCounter(visitor: AdFraudVisitorRecord, eventType: AdFraudEventType): void {
  switch (eventType) {
    case "paid_visit":
      visitor.paidVisitCount += 1;
      break;
    case "quote_started":
      visitor.quoteStartedCount += 1;
      break;
    case "quote_completed":
      visitor.quoteCompletedCount += 1;
      break;
    case "booking_started":
      visitor.bookingStartedCount += 1;
      break;
    case "booking_completed":
      visitor.bookingCompletedCount += 1;
      break;
    case "payment_started":
      visitor.paymentStartedCount += 1;
      break;
    case "payment_completed":
      visitor.paymentCompletedCount += 1;
      break;
    case "whatsapp_clicked":
      visitor.whatsappClickCount += 1;
      break;
    case "phone_clicked":
      visitor.phoneClickCount += 1;
      break;
  }
}

export function adFraudStoreConfigured(store?: KVNamespace): store is KVNamespace {
  return Boolean(store);
}

export function resolveAdFraudSalt(env: AdFraudStoreEnv): string | null {
  const salt = env.AD_FRAUD_HASH_SALT?.trim();
  return salt && salt.length >= 8 ? salt : null;
}

export async function consumeAdFraudIngestQuota(
  store: KVNamespace,
  ipHash: string,
): Promise<"ok" | "limited"> {
  const hour = new Date().toISOString().slice(0, 13);
  const key = adFraudRateKey(ipHash || "unknown", hour);
  const raw = await store.get<{ count: number }>(key, "json");
  const count = Number(raw?.count) || 0;
  if (count >= AD_FRAUD_INGEST_RATE_LIMIT) return "limited";
  await store.put(key, JSON.stringify({ count: count + 1 }), {
    expirationTtl: 60 * 60 * 2,
  });
  return "ok";
}

export async function getAdFraudVisitor(
  store: KVNamespace,
  visitorHash: string,
): Promise<AdFraudVisitorRecord | null> {
  if (!visitorHash) return null;
  const record = await store.get<AdFraudVisitorRecord>(adFraudVisitorKey(visitorHash), "json");
  if (!record?.visitorHash) return null;
  return record;
}

export async function saveAdFraudVisitor(
  store: KVNamespace,
  visitor: AdFraudVisitorRecord,
): Promise<void> {
  await store.put(adFraudVisitorKey(visitor.visitorHash), JSON.stringify(visitor), {
    expirationTtl: AD_FRAUD_VISITOR_TTL_SECONDS,
  });
}

async function indexVisitorDay(
  store: KVNamespace,
  visitorHash: string,
  day: string,
): Promise<void> {
  const key = adFraudDayKey(day);
  const existing = await store.get<string[]>(key, "json");
  const list = Array.isArray(existing) ? existing : [];
  if (list.includes(visitorHash)) return;
  list.push(visitorHash);
  await store.put(key, JSON.stringify(list.slice(-AD_FRAUD_DAY_INDEX_CAP)), {
    expirationTtl: AD_FRAUD_EVENT_TTL_SECONDS,
  });
}

export async function recordAdFraudEvent(
  env: AdFraudStoreEnv,
  input: {
    eventType: AdFraudEventType;
    sessionId?: string;
    landingPath?: string;
    referrerHost?: string;
    userAgentNorm?: string;
    attribution?: Attr;
    meta?: Record<string, string>;
    clientIp?: string;
    requestUserAgent?: string;
  },
): Promise<{ ok: true; visitorHash: string; eventId: string } | { ok: false; error: string; status: number }> {
  if (!adFraudStoreConfigured(env.TRACKING_STORE)) {
    return { ok: false, error: "Ad fraud store is not configured", status: 503 };
  }
  const salt = resolveAdFraudSalt(env);
  if (!salt) {
    return { ok: false, error: "AD_FRAUD_HASH_SALT is not configured", status: 503 };
  }

  const store = env.TRACKING_STORE;
  const ipHash = input.clientIp ? await hashAdFraudIp(input.clientIp, salt) : undefined;
  const quota = await consumeAdFraudIngestQuota(store, ipHash || "noip");
  if (quota === "limited") {
    return { ok: false, error: "Rate limit exceeded", status: 429 };
  }

  const userAgentNorm =
    input.userAgentNorm || normalizeUserAgent(input.requestUserAgent) || undefined;
  const visitorHash = await hashAdFraudVisitorId({
    salt,
    sessionId: input.sessionId,
    ipHash,
    userAgentNorm,
  });

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const clickRaw =
    input.attribution?.gclid || input.attribution?.gbraid || input.attribution?.wbraid;
  const clickIdHint = await hashClickIdHint(clickRaw, salt);

  const event: AdFraudEventRecord = {
    id: generateAdFraudEventId(),
    timestamp: nowIso,
    eventType: input.eventType,
    visitorHash,
    ...(ipHash ? { ipHash } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(userAgentNorm ? { userAgentNorm } : {}),
    ...(input.landingPath ? { landingPath: input.landingPath } : {}),
    ...(input.referrerHost ? { referrerHost: input.referrerHost } : {}),
    ...(input.attribution ? { attribution: input.attribution } : {}),
    ...(clickIdHint ? { clickIdHint } : {}),
    ...(input.meta ? { meta: input.meta } : {}),
  };

  await store.put(adFraudEventKey(event.id), JSON.stringify(event), {
    expirationTtl: AD_FRAUD_EVENT_TTL_SECONDS,
  });

  const existing = (await getAdFraudVisitor(store, visitorHash)) ?? emptyVisitor(visitorHash, nowIso);
  bumpCounter(existing, input.eventType);
  existing.lastSeenAt = nowIso;
  existing.landingPaths = uniquePush(existing.landingPaths, input.landingPath, 12);
  existing.campaigns = uniquePush(
    existing.campaigns,
    input.attribution?.utm_campaign,
    8,
  );
  existing.events = [...existing.events, event].slice(-AD_FRAUD_VISITOR_EVENT_CAP);

  const scored = recomputeVisitorScore(existing, now);
  existing.score = scored.score;
  existing.risk = scored.risk;
  existing.reasons = scored.reasons;

  await saveAdFraudVisitor(store, existing);
  await indexVisitorDay(store, visitorHash, utcDayString(now));

  return { ok: true, visitorHash, eventId: event.id };
}

export async function updateAdFraudVisitorReview(
  store: KVNamespace,
  visitorHash: string,
  input: { reviewStatus: AdFraudReviewStatus; notes?: string },
): Promise<AdFraudVisitorRecord | null> {
  const existing = await getAdFraudVisitor(store, visitorHash);
  if (!existing) return null;
  const next: AdFraudVisitorRecord = {
    ...existing,
    reviewStatus: input.reviewStatus,
    notes: input.notes?.trim().slice(0, 500) || existing.notes,
    reviewedAt: new Date().toISOString(),
  };
  await saveAdFraudVisitor(store, next);
  return next;
}

function dayRange(days: number, nowMs: number = Date.now()): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i += 1) {
    out.push(utcDayString(nowMs - i * 24 * 60 * 60 * 1000));
  }
  return out;
}

async function loadVisitorsForDays(
  store: KVNamespace,
  days: number,
): Promise<AdFraudVisitorRecord[]> {
  const hashes = new Set<string>();
  for (const day of dayRange(days)) {
    const list = await store.get<string[]>(adFraudDayKey(day), "json");
    if (Array.isArray(list)) {
      for (const hash of list) {
        if (typeof hash === "string" && hash) hashes.add(hash);
      }
    }
  }
  const visitors: AdFraudVisitorRecord[] = [];
  for (const hash of hashes) {
    const visitor = await getAdFraudVisitor(store, hash);
    if (visitor) visitors.push(visitor);
  }
  return visitors;
}

export type AdFraudDashboardFilters = {
  rangeDays: 1 | 7 | 30;
  risk?: AdFraudRiskLevel | "all";
  campaign?: string;
};

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

function engagementLabel(visitor: AdFraudVisitorRecord): string {
  const parts: string[] = [];
  if (visitor.quoteCompletedCount > 0) parts.push("quote");
  else if (visitor.quoteStartedCount > 0) parts.push("quote started");
  if (visitor.bookingCompletedCount > 0) parts.push("booking");
  else if (visitor.bookingStartedCount > 0) parts.push("booking started");
  if (visitor.paymentCompletedCount > 0) parts.push("paid");
  else if (visitor.paymentStartedCount > 0) parts.push("payment started");
  if (visitor.whatsappClickCount > 0) parts.push("WhatsApp");
  if (visitor.phoneClickCount > 0) parts.push("phone");
  return parts.length > 0 ? parts.join(", ") : "none";
}

export async function buildAdFraudDashboard(
  store: KVNamespace,
  filters: AdFraudDashboardFilters,
  anonymise: (hash: string) => string,
): Promise<{ summary: AdFraudDashboardSummary; visitors: AdFraudVisitorRow[] }> {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const visitors = await loadVisitorsForDays(store, Math.max(filters.rangeDays, 7));

  const inRange = visitors.filter((visitor) => {
    const last = Date.parse(visitor.lastSeenAt);
    return Number.isFinite(last) && last >= now - filters.rangeDays * dayMs;
  });

  const paidVisitsToday = inRange.reduce(
    (sum, visitor) =>
      sum +
      visitor.events.filter(
        (event) =>
          event.eventType === "paid_visit" && Date.parse(event.timestamp) >= now - dayMs,
      ).length,
    0,
  );
  const paidVisitsLast7Days = visitors.reduce(
    (sum, visitor) =>
      sum +
      visitor.events.filter(
        (event) =>
          event.eventType === "paid_visit" && Date.parse(event.timestamp) >= now - 7 * dayMs,
      ).length,
    0,
  );

  let rows: AdFraudVisitorRow[] = inRange.map((visitor) => {
    const paidToday = visitor.events.filter(
      (event) =>
        event.eventType === "paid_visit" && Date.parse(event.timestamp) >= now - dayMs,
    ).length;
    const paid7 = visitor.events.filter(
      (event) =>
        event.eventType === "paid_visit" && Date.parse(event.timestamp) >= now - 7 * dayMs,
    ).length;
    return {
      visitorHash: visitor.visitorHash,
      anonymisedId: anonymise(visitor.visitorHash),
      risk: visitor.risk,
      score: visitor.score,
      firstSeenAt: visitor.firstSeenAt,
      lastSeenAt: visitor.lastSeenAt,
      paidVisitsToday: paidToday,
      paidVisits7Days: paid7,
      landingPaths: visitor.landingPaths,
      campaigns: visitor.campaigns,
      quotes: visitor.quoteCompletedCount || visitor.quoteStartedCount,
      bookings: visitor.bookingCompletedCount || visitor.bookingStartedCount,
      whatsappClicks: visitor.whatsappClickCount,
      phoneClicks: visitor.phoneClickCount,
      engagement: engagementLabel(visitor),
      reasons: visitor.reasons,
      reviewStatus: visitor.reviewStatus,
      notes: visitor.notes,
    };
  });

  if (filters.risk && filters.risk !== "all") {
    rows = rows.filter((row) => row.risk === filters.risk);
  }
  if (filters.campaign?.trim()) {
    const needle = filters.campaign.trim().toLowerCase();
    rows = rows.filter((row) =>
      row.campaigns.some((campaign) => campaign.toLowerCase().includes(needle)),
    );
  }

  rows.sort((a, b) => {
    const riskRank = { high: 3, medium: 2, low: 1, normal: 0 } as const;
    const diff = riskRank[b.risk] - riskRank[a.risk];
    if (diff !== 0) return diff;
    return Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);
  });

  const summary: AdFraudDashboardSummary = {
    paidVisitsToday,
    paidVisitsLast7Days,
    uniqueVisitorHashes: inRange.length,
    suspiciousVisitors: inRange.filter((visitor) => visitor.risk !== "normal").length,
    highRiskVisitors: inRange.filter((visitor) => visitor.risk === "high").length,
    visitorsWithQuotes: inRange.filter(
      (visitor) => visitor.quoteStartedCount + visitor.quoteCompletedCount > 0,
    ).length,
    visitorsWithBookings: inRange.filter(
      (visitor) => visitor.bookingStartedCount + visitor.bookingCompletedCount > 0,
    ).length,
  };

  return { summary, visitors: rows };
}

/**
 * Retention relies primarily on KV expirationTtl.
 * This hourly sweep drops stale events from visitor aggregates older than 90 days.
 */
export async function pruneAdFraudVisitorEvents(
  store: KVNamespace,
  limitDays = 3,
): Promise<{ visitorsTouched: number }> {
  const now = Date.now();
  const cutoff = now - AD_FRAUD_EVENT_TTL_SECONDS * 1000;
  const visitors = await loadVisitorsForDays(store, limitDays);
  let touched = 0;
  for (const visitor of visitors) {
    const before = visitor.events.length;
    visitor.events = visitor.events.filter((event) => Date.parse(event.timestamp) >= cutoff);
    if (visitor.events.length !== before) {
      const scored = recomputeVisitorScore(visitor, now);
      visitor.score = scored.score;
      visitor.risk = scored.risk;
      visitor.reasons = scored.reasons;
      await saveAdFraudVisitor(store, visitor);
      touched += 1;
    }
  }
  return { visitorsTouched: touched };
}
