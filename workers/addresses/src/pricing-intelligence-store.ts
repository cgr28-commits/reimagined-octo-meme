import {
  PRICING_INTELLIGENCE_TTL_SECONDS,
  buildDailyPricingReport,
  buildDungivenBhdSeedEvent,
  DUNGIVEN_BHD_SEED_DAY,
  pricingIntelligenceDayIndexKey,
  pricingIntelligenceEventKey,
  pricingIntelligenceLastDailyRunKey,
  pricingIntelligenceReportKey,
  pricingIntelligenceSeedFlagKey,
  type DailyPricingReport,
  type QuoteFunnelOutcome,
  type QuoteIntelligenceEvent,
} from "../shared/pricing-intelligence";

export function pricingIntelligenceStoreConfigured(
  store?: KVNamespace,
): store is KVNamespace {
  return Boolean(store);
}

async function readDayIds(store: KVNamespace, londonDay: string): Promise<string[]> {
  const raw = await store.get(pricingIntelligenceDayIndexKey(londonDay));
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function writeDayIds(store: KVNamespace, londonDay: string, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)].slice(-500);
  await store.put(pricingIntelligenceDayIndexKey(londonDay), JSON.stringify(unique), {
    expirationTtl: PRICING_INTELLIGENCE_TTL_SECONDS,
  });
}

export async function saveQuoteIntelligenceEvent(
  store: KVNamespace,
  event: QuoteIntelligenceEvent,
): Promise<void> {
  await store.put(pricingIntelligenceEventKey(event.id), JSON.stringify(event), {
    expirationTtl: PRICING_INTELLIGENCE_TTL_SECONDS,
  });
  const ids = await readDayIds(store, event.londonDay);
  if (!ids.includes(event.id)) {
    ids.push(event.id);
    await writeDayIds(store, event.londonDay, ids);
  }
}

export async function getQuoteIntelligenceEvent(
  store: KVNamespace,
  id: string,
): Promise<QuoteIntelligenceEvent | null> {
  const raw = await store.get(pricingIntelligenceEventKey(id), "json");
  return raw && typeof raw === "object" ? (raw as QuoteIntelligenceEvent) : null;
}

export async function listQuoteIntelligenceEventsForDay(
  store: KVNamespace,
  londonDay: string,
): Promise<QuoteIntelligenceEvent[]> {
  const ids = await readDayIds(store, londonDay);
  const events: QuoteIntelligenceEvent[] = [];
  for (const id of ids) {
    const event = await getQuoteIntelligenceEvent(store, id);
    if (event) events.push(event);
  }
  return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function findQuoteIntelligenceByFingerprint(
  store: KVNamespace,
  londonDay: string,
  fingerprint: string,
): Promise<QuoteIntelligenceEvent | null> {
  const events = await listQuoteIntelligenceEventsForDay(store, londonDay);
  return events.find((e) => e.fingerprint === fingerprint) ?? null;
}

export async function findQuoteIntelligenceByAnalyticsKey(
  store: KVNamespace,
  londonDay: string,
  analyticsKey: string,
): Promise<QuoteIntelligenceEvent | null> {
  const events = await listQuoteIntelligenceEventsForDay(store, londonDay);
  const matches = events.filter((e) => e.analyticsKey === analyticsKey);
  if (matches.length === 0) return null;
  return matches[matches.length - 1] ?? null;
}

export async function updateQuoteIntelligenceFunnel(
  store: KVNamespace,
  input: {
    fingerprint?: string;
    analyticsKey?: string;
    londonDay: string;
    event: "book_click" | "checkout_started" | "paid";
    atIso?: string;
  },
): Promise<QuoteIntelligenceEvent | null> {
  let existing: QuoteIntelligenceEvent | null = null;
  if (input.fingerprint?.trim()) {
    existing = await findQuoteIntelligenceByFingerprint(
      store,
      input.londonDay,
      input.fingerprint.trim(),
    );
  }
  if (!existing && input.analyticsKey?.trim()) {
    existing = await findQuoteIntelligenceByAnalyticsKey(
      store,
      input.londonDay,
      input.analyticsKey.trim(),
    );
  }
  if (!existing) return null;

  const at = input.atIso ?? new Date().toISOString();
  const next: QuoteIntelligenceEvent = { ...existing, updatedAt: at };
  if (input.event === "book_click") {
    next.bookClickedAt = next.bookClickedAt ?? at;
    if (next.outcome === "viewed" || next.outcome === "abandoned") {
      next.outcome = "book_clicked";
    }
  } else if (input.event === "checkout_started") {
    next.bookClickedAt = next.bookClickedAt ?? at;
    next.checkoutStartedAt = next.checkoutStartedAt ?? at;
    if (next.outcome !== "paid") next.outcome = "checkout_started";
  } else {
    next.bookClickedAt = next.bookClickedAt ?? at;
    next.checkoutStartedAt = next.checkoutStartedAt ?? at;
    next.paidAt = next.paidAt ?? at;
    next.outcome = "paid";
  }
  await saveQuoteIntelligenceEvent(store, next);
  return next;
}

export async function saveDailyPricingReport(
  store: KVNamespace,
  report: DailyPricingReport,
): Promise<void> {
  await store.put(pricingIntelligenceReportKey(report.londonDay), JSON.stringify(report), {
    expirationTtl: PRICING_INTELLIGENCE_TTL_SECONDS,
  });
}

export async function getDailyPricingReport(
  store: KVNamespace,
  londonDay: string,
): Promise<DailyPricingReport | null> {
  const raw = await store.get(pricingIntelligenceReportKey(londonDay), "json");
  return raw && typeof raw === "object" ? (raw as DailyPricingReport) : null;
}

export async function listRecentDailyPricingReports(
  store: KVNamespace,
  days: string[],
): Promise<DailyPricingReport[]> {
  const out: DailyPricingReport[] = [];
  for (const day of days) {
    const report = await getDailyPricingReport(store, day);
    if (report) out.push(report);
  }
  return out;
}

export async function getLastPricingIntelligenceDailyRun(
  store: KVNamespace,
): Promise<string | null> {
  return (await store.get(pricingIntelligenceLastDailyRunKey()))?.trim() || null;
}

export async function setLastPricingIntelligenceDailyRun(
  store: KVNamespace,
  londonDay: string,
): Promise<void> {
  await store.put(pricingIntelligenceLastDailyRunKey(), londonDay, {
    expirationTtl: PRICING_INTELLIGENCE_TTL_SECONDS,
  });
}

/**
 * Seeds the first historical comparison (Dungiven → BHD, £154 vs FonaCAB ~£130).
 * Idempotent via KV flag. Analytics only — does not change live pricing.
 */
export async function ensurePricingIntelSeed(store: KVNamespace): Promise<boolean> {
  const flag = await store.get(pricingIntelligenceSeedFlagKey());
  if (flag?.trim()) return false;

  const seed = buildDungivenBhdSeedEvent(DUNGIVEN_BHD_SEED_DAY);
  await saveQuoteIntelligenceEvent(store, seed);
  const report = buildDailyPricingReport(DUNGIVEN_BHD_SEED_DAY, [seed]);
  report.seedNotes = [
    "Seeded historical comparison: Dungiven → Belfast City Airport — MATNI £154 vs FonaCAB ~£130 (+£24 / +18.5%). Analytical flag HIGH. No live prices were changed.",
  ];
  await saveDailyPricingReport(store, report);
  await store.put(pricingIntelligenceSeedFlagKey(), new Date().toISOString(), {
    expirationTtl: PRICING_INTELLIGENCE_TTL_SECONDS,
  });
  return true;
}

export function advanceOutcomePriority(
  current: QuoteFunnelOutcome,
  next: QuoteFunnelOutcome,
): QuoteFunnelOutcome {
  const order: QuoteFunnelOutcome[] = [
    "viewed",
    "abandoned",
    "book_clicked",
    "checkout_started",
    "paid",
  ];
  return order.indexOf(next) >= order.indexOf(current) ? next : current;
}
