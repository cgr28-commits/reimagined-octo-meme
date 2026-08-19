/**
 * Daily pricing intelligence job — analytics only.
 * Does NOT modify pricing-config.json or live fares.
 */

import {
  buildDailyPricingReport,
  formatDailyPricingReportEmail,
  londonDayKey,
  recentLondonDays,
  shouldRunDailyPricingIntelligence,
  type QuoteIntelligenceEvent,
} from "../shared/pricing-intelligence";
import { fetchCompetitorQuotes } from "./competitor-adapters";
import {
  ensurePricingIntelSeed,
  getDailyPricingReport,
  getLastPricingIntelligenceDailyRun,
  listQuoteIntelligenceEventsForDay,
  listRecentDailyPricingReports,
  saveDailyPricingReport,
  saveQuoteIntelligenceEvent,
  setLastPricingIntelligenceDailyRun,
} from "./pricing-intelligence-store";
import { sendEmail, type WorkerEmailEnv } from "./worker-email";

export type PricingIntelJobEnv = WorkerEmailEnv & {
  TRACKING_STORE?: KVNamespace;
};

const OWNER_EMAIL = "cormacgarvin@hotmail.com";

export { shouldRunDailyPricingIntelligence, ensurePricingIntelSeed };

/**
 * Enrich a subset of day's quotes with competitor prices (rate-limited).
 * OTS uses the public airporttaxis-uk.co.uk quote form when safe.
 * FonaCAB remains unavailable until a legitimate public channel exists.
 */
export async function enrichQuoteEventsWithCompetitors(
  events: QuoteIntelligenceEvent[],
  opts: { maxEnrichments?: number } = {},
): Promise<QuoteIntelligenceEvent[]> {
  const max = Math.max(0, Math.min(opts.maxEnrichments ?? 12, events.length));
  const out = [...events];
  let enriched = 0;

  for (let i = 0; i < out.length && enriched < max; i++) {
    const ev = out[i];
    if (ev.source === "seed") continue;
    if (!ev.isAirportTrip) continue;
    if (ev.competitors?.ots?.priceGbp != null || ev.competitors?.fonacab?.priceGbp != null) {
      continue;
    }

    try {
      const results = await fetchCompetitorQuotes({
        pickupLabel: ev.pickupLabel,
        dropoffLabel: ev.dropoffLabel,
        tripDate: ev.tripDate,
        tripTime: ev.tripTime,
        passengers: ev.passengers,
        suitcases: ev.suitcases,
        vehicleClass: ev.vehicleClass,
        returnJourney: ev.returnJourney,
      });

      const competitors: NonNullable<QuoteIntelligenceEvent["competitors"]> = {
        ...(ev.competitors ?? {}),
      };
      for (const result of results) {
        competitors[result.competitor] = {
          priceGbp: result.priceGbp,
          unavailableReason: result.unavailableReason,
          vehicleClass: result.vehicleClass,
          fetchedAt: result.fetchedAt,
        };
      }

      out[i] = {
        ...ev,
        competitors,
        updatedAt: new Date().toISOString(),
      };
      enriched += 1;
    } catch {
      // leave event unchanged — never invent competitor prices
    }
  }

  return out;
}

export async function runDailyPricingIntelligenceReport(
  env: PricingIntelJobEnv,
  opts: {
    dayKey?: string;
    now?: Date;
    skipEmail?: boolean;
    enrich?: boolean;
    force?: boolean;
  } = {},
): Promise<{ ok: boolean; dayKey: string; skipped?: boolean; error?: string }> {
  if (!env.TRACKING_STORE) {
    return { ok: false, dayKey: opts.dayKey || "", error: "TRACKING_STORE unavailable" };
  }

  const now = opts.now || new Date();
  const dayKey = opts.dayKey || londonDayKey(now);

  await ensurePricingIntelSeed(env.TRACKING_STORE);

  if (!opts.force) {
    const lastRun = await getLastPricingIntelligenceDailyRun(env.TRACKING_STORE);
    if (lastRun === dayKey) {
      return { ok: true, dayKey, skipped: true };
    }
  }

  let events = await listQuoteIntelligenceEventsForDay(env.TRACKING_STORE, dayKey);

  if (opts.enrich !== false && events.length > 0) {
    const enriched = await enrichQuoteEventsWithCompetitors(events, { maxEnrichments: 12 });
    for (const ev of enriched) {
      const prev = events.find((e) => e.id === ev.id);
      if (prev && JSON.stringify(ev.competitors) !== JSON.stringify(prev.competitors)) {
        await saveQuoteIntelligenceEvent(env.TRACKING_STORE, ev);
      }
    }
    events = enriched;
  }

  const report = buildDailyPricingReport(dayKey, events);
  await saveDailyPricingReport(env.TRACKING_STORE, report);
  await setLastPricingIntelligenceDailyRun(env.TRACKING_STORE, dayKey);

  if (!opts.skipEmail) {
    const { subject, body } = formatDailyPricingReportEmail(report);
    try {
      await sendEmail(env, {
        to: OWNER_EMAIL,
        subject,
        body,
      });
    } catch (error) {
      console.error("Pricing intelligence daily email failed", error);
      // report still saved
    }
  }

  return { ok: true, dayKey };
}

export async function getPricingIntelligenceDashboard(
  env: PricingIntelJobEnv,
): Promise<{
  today: Awaited<ReturnType<typeof getDailyPricingReport>>;
  last7: NonNullable<Awaited<ReturnType<typeof getDailyPricingReport>>>[];
  last30: NonNullable<Awaited<ReturnType<typeof getDailyPricingReport>>>[];
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
}> {
  if (!env.TRACKING_STORE) {
    return {
      today: null,
      last7: [],
      last30: [],
      biggestOverpricing: [],
      biggestUnderpricing: [],
      conversionPct7d: 0,
      quoteCount7d: 0,
      paid7d: 0,
    };
  }

  await ensurePricingIntelSeed(env.TRACKING_STORE);

  const todayKey = londonDayKey();
  let today = await getDailyPricingReport(env.TRACKING_STORE, todayKey);
  if (!today) {
    const events = await listQuoteIntelligenceEventsForDay(env.TRACKING_STORE, todayKey);
    today = buildDailyPricingReport(todayKey, events);
  }

  const days7 = recentLondonDays(7);
  const days30 = recentLondonDays(30);
  const last7 = await listRecentDailyPricingReports(env.TRACKING_STORE, days7);
  const last30 = await listRecentDailyPricingReports(env.TRACKING_STORE, days30);

  const quoteCount7d = last7.reduce((sum, r) => sum + r.quoteCount, 0);
  const paid7d = last7.reduce((sum, r) => sum + r.paid, 0);
  const conversionPct7d =
    quoteCount7d === 0 ? 0 : Math.round((paid7d / quoteCount7d) * 1000) / 10;

  const gapRows = last30.flatMap((report) =>
    report.rows
      .filter((row) => row.differenceGbp != null)
      .map((row) => ({
        journey: row.journey,
        differenceGbp: row.differenceGbp ?? null,
        differencePct: row.differencePct ?? null,
        day: report.londonDay,
      })),
  );

  const biggestOverpricing = [...gapRows]
    .filter((r) => (r.differenceGbp ?? 0) > 0)
    .sort((a, b) => (b.differenceGbp ?? 0) - (a.differenceGbp ?? 0))
    .slice(0, 8);

  const biggestUnderpricing = [...gapRows]
    .filter((r) => (r.differenceGbp ?? 0) < 0)
    .sort((a, b) => (a.differenceGbp ?? 0) - (b.differenceGbp ?? 0))
    .slice(0, 8);

  return {
    today,
    last7,
    last30,
    biggestOverpricing,
    biggestUnderpricing,
    conversionPct7d,
    quoteCount7d,
    paid7d,
  };
}
