/**
 * Daily Quote Pricing & Competitor Intelligence — analytics only.
 * Never mutates pricing-config.json or live fares.
 */

import { UK_TIME_ZONE } from "./uk-time";
import type { QuoteLeadDetails } from "./quote-lead";

export const LONDON_TZ = UK_TIME_ZONE;

export type CompetitorId = "fonacab" | "ots";

export type PricingFlag = "HIGH" | "COMPETITIVE" | "LOW" | "UNKNOWN";

export type QuoteFunnelOutcome =
  | "viewed"
  | "book_clicked"
  | "checkout_started"
  | "paid"
  | "abandoned";

export type IntelligenceVehicleClass = "Saloon" | "Estate" | "Minibus" | "Other";

export type QuoteIntelligenceEvent = {
  id: string;
  fingerprint: string;
  /** Route + party + price key (excludes schedule) — links funnel steps after dates are filled. */
  analyticsKey: string;
  createdAt: string;
  updatedAt?: string;
  londonDay: string;
  tripLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  airportCode?: string;
  isAirportTrip: boolean;
  returnJourney: boolean;
  tripDate?: string;
  tripTime?: string;
  returnDate?: string;
  returnTime?: string;
  passengers: number;
  suitcases: number;
  vehicle: string;
  vehicleClass: IntelligenceVehicleClass;
  matniPriceGbp: number;
  matniPriceLabel: string;
  journeyMiles?: number;
  journeyDurationMinutes?: number;
  premiumApplied?: boolean;
  source?: "card" | "bot" | "seed";
  bookClickedAt?: string;
  checkoutStartedAt?: string;
  paidAt?: string;
  outcome: QuoteFunnelOutcome;
  competitors?: Partial<
    Record<
      CompetitorId,
      {
        priceGbp?: number;
        unavailableReason?: string;
        vehicleClass?: string;
        fetchedAt?: string;
      }
    >
  >;
};

export type DailyPricingReportRow = {
  journey: string;
  miles?: number;
  matniGbp: number;
  fonacabGbp?: number | null;
  otsGbp?: number | null;
  cheapestCompetitorGbp?: number | null;
  differenceGbp?: number | null;
  differencePct?: number | null;
  flag: PricingFlag;
  outcome: string;
  vehicleClass: IntelligenceVehicleClass;
  fingerprint: string;
};

export type DailyPricingReport = {
  londonDay: string;
  generatedAt: string;
  quoteCount: number;
  bookClicks: number;
  checkoutsStarted: number;
  paid: number;
  conversionPct: number;
  averageMatniGbp: number;
  averageDifferenceGbp: number | null;
  averageDifferencePct: number | null;
  highCount: number;
  competitiveCount: number;
  lowCount: number;
  rows: DailyPricingReportRow[];
  patterns: {
    byAirport: Record<string, number>;
    byMilesBand: Record<string, number>;
    byVehicle: Record<string, number>;
    unknownAreaHighFlags: number;
  };
  seedNotes?: string[];
};

export const PRICING_INTELLIGENCE_TTL_SECONDS = 60 * 60 * 24 * 120;

export function pricingIntelligenceEventKey(id: string): string {
  return `pricing-intel:event:${id}`;
}

export function pricingIntelligenceDayIndexKey(londonDay: string): string {
  return `pricing-intel:day:${londonDay}`;
}

export function pricingIntelligenceReportKey(londonDay: string): string {
  return `pricing-intel:report:${londonDay}`;
}

export function pricingIntelligenceLastDailyRunKey(): string {
  return "pricing-intel:last-daily-run";
}

export function pricingIntelligenceSeedFlagKey(): string {
  return "pricing-intel:seed:dungiven-bhd-v1";
}

/** Historical seed day for the first Dungiven → BHD comparison record. */
export const DUNGIVEN_BHD_SEED_DAY = "2026-08-19";

export function londonDayKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LONDON_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function londonHourNow(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TZ,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === "hour")?.value || "0");
}

/** Prefer ~23:55 Europe/London; Worker cron is hourly so run in the 23:00 hour. */
export function shouldRunDailyPricingIntelligence(now: Date = new Date()): boolean {
  return londonHourNow(now) === 23;
}

export function recentLondonDays(count: number, from: Date = new Date()): string[] {
  const days: string[] = [];
  for (let i = 0; i < count; i++) {
    days.push(londonDayKey(new Date(from.getTime() - i * 86400000)));
  }
  return days;
}

/** Agreed intelligence vehicle rule (report / competitor matching). */
export function intelligenceVehicleClass(
  passengers: number,
  suitcases: number,
): IntelligenceVehicleClass {
  if (passengers >= 5 && passengers <= 7) return "Minibus";
  if (passengers >= 5 || suitcases >= 5) return "Minibus";
  if (passengers >= 1 && passengers <= 4 && suitcases >= 3 && suitcases <= 4) return "Estate";
  if (passengers >= 1 && passengers <= 4 && suitcases >= 0 && suitcases <= 2) return "Saloon";
  return "Other";
}

/** Stable hash for KV event ids (no crypto dependency in Workers). */
export function stableShortHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Links funnel steps when schedule fields change after the initial quote view.
 * Excludes trip/return date-time so Book / checkout still match the viewed quote.
 */
export function buildQuoteAnalyticsKey(input: {
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney: boolean;
  estimatedPrice: string;
  vehicle: string;
  passengers: number;
  suitcases: number;
}): string {
  return [
    input.pickupLabel,
    input.dropoffLabel,
    input.returnJourney ? "1" : "0",
    input.estimatedPrice,
    input.vehicle,
    String(input.passengers),
    String(input.suitcases),
  ]
    .join("|")
    .toLowerCase();
}

export function quoteIntelligenceEventId(fingerprint: string, londonDay: string): string {
  return `qi-${londonDay}-${stableShortHash(fingerprint)}`;
}

export type QuoteLeadAnalyticsExtras = {
  premiumApplied?: boolean;
  airportCode?: string;
  source?: "card" | "bot";
};

export function quoteLeadToIntelligenceEvent(
  details: QuoteLeadDetails,
  fingerprint: string,
  extras: QuoteLeadAnalyticsExtras = {},
  now: Date = new Date(),
): QuoteIntelligenceEvent | null {
  const matniPriceGbp = parsePriceGbp(details.estimatedPrice);
  if (matniPriceGbp == null) return null;

  const londonDay = londonDayKey(now);
  const createdAt = now.toISOString();
  const analyticsKey = buildQuoteAnalyticsKey({
    pickupLabel: details.pickupLabel,
    dropoffLabel: details.dropoffLabel,
    returnJourney: details.returnJourney,
    estimatedPrice: details.estimatedPrice,
    vehicle: details.vehicle,
    passengers: details.passengers,
    suitcases: details.suitcases,
  });
  const airportCode =
    extras.airportCode?.trim() ||
    detectAirportCode({
      tripLabel: details.tripLabel,
      pickupLabel: details.pickupLabel,
      dropoffLabel: details.dropoffLabel,
      isAirportTrip: details.isAirportTrip,
    });

  return {
    id: quoteIntelligenceEventId(fingerprint, londonDay),
    fingerprint,
    analyticsKey,
    createdAt,
    updatedAt: createdAt,
    londonDay,
    tripLabel: details.tripLabel,
    pickupLabel: details.pickupLabel,
    dropoffLabel: details.dropoffLabel,
    airportCode,
    isAirportTrip: details.isAirportTrip,
    returnJourney: details.returnJourney,
    tripDate: details.tripDate,
    tripTime: details.tripTime,
    returnDate: details.returnDate,
    returnTime: details.returnTime,
    passengers: details.passengers,
    suitcases: details.suitcases,
    vehicle: details.vehicle,
    vehicleClass: intelligenceVehicleClass(details.passengers, details.suitcases),
    matniPriceGbp,
    matniPriceLabel: details.estimatedPrice,
    journeyMiles: parseMiles(details.journeyDistance),
    journeyDurationMinutes: parseDurationMinutes(details.journeyDuration),
    premiumApplied: extras.premiumApplied === true,
    source: extras.source ?? "card",
    outcome: "viewed",
  };
}

export function parsePriceGbp(label: string | number | undefined | null): number | null {
  if (typeof label === "number" && Number.isFinite(label)) {
    return Math.round(label * 100) / 100;
  }
  const raw = String(label ?? "").replace(/,/g, "");
  const match = raw.match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  return Math.round(Number(match[1]) * 100) / 100;
}

export function parseMiles(label: string | undefined | null): number | undefined {
  const match = String(label ?? "").match(/(\d+(?:\.\d+)?)\s*mi/i);
  if (!match) return undefined;
  return Number(match[1]);
}

export function parseDurationMinutes(label: string | undefined | null): number | undefined {
  const text = String(label ?? "");
  const hourMatch = text.match(/(\d+)\s*h/i);
  const minMatch = text.match(/(\d+)\s*m/i);
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const mins = minMatch ? Number(minMatch[1]) : 0;
  if (!hourMatch && !minMatch) return undefined;
  return hours * 60 + mins;
}

export function milesBand(miles?: number): string {
  if (miles == null || !Number.isFinite(miles)) return "unknown";
  if (miles < 20) return "0-20";
  if (miles < 40) return "20-40";
  if (miles < 60) return "40-60";
  return "60+";
}

export function detectAirportCode(input: {
  tripLabel?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  isAirportTrip?: boolean;
}): string | undefined {
  const blob = `${input.tripLabel ?? ""} ${input.pickupLabel ?? ""} ${input.dropoffLabel ?? ""}`.toLowerCase();
  if (blob.includes("belfast international") || blob.includes("bfs") || /\baldergrove\b/.test(blob)) {
    return "BFS";
  }
  if (
    blob.includes("belfast city") ||
    blob.includes("george best") ||
    blob.includes("bhd") ||
    blob.includes("city airport")
  ) {
    return "BHD";
  }
  if (blob.includes("dublin") || blob.includes("dub")) return "DUB";
  if (blob.includes("city of derry") || blob.includes("ldy") || blob.includes("eglinton")) {
    return "LDY";
  }
  return undefined;
}

/**
 * Analytical flags only — never used to rewrite fares.
 * HIGH when >10% OR >£10 above cheapest reliable competitor.
 * COMPETITIVE within ±£5 or ±5%.
 * LOW when materially below (≤ −£5 and ≤ −5%).
 */
export function flagMatniVsCompetitor(
  matniGbp: number,
  cheapestCompetitorGbp: number | null | undefined,
): PricingFlag {
  if (cheapestCompetitorGbp == null || !Number.isFinite(cheapestCompetitorGbp) || cheapestCompetitorGbp <= 0) {
    return "UNKNOWN";
  }
  const diff = matniGbp - cheapestCompetitorGbp;
  const pct = (diff / cheapestCompetitorGbp) * 100;
  if (diff > 10 || pct > 10) return "HIGH";
  if (diff < -5 && pct < -5) return "LOW";
  if (Math.abs(diff) <= 5 || Math.abs(pct) <= 5) return "COMPETITIVE";
  if (diff > 0) return "HIGH";
  return "LOW";
}

export function cheapestCompetitorGbp(
  competitors: QuoteIntelligenceEvent["competitors"] | undefined,
): number | null {
  const prices = [competitors?.fonacab?.priceGbp, competitors?.ots?.priceGbp].filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0,
  );
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

export function outcomeLabel(event: QuoteIntelligenceEvent): string {
  if (event.paidAt || event.outcome === "paid") return "Paid";
  if (event.checkoutStartedAt || event.outcome === "checkout_started") {
    return "Checkout started, not paid";
  }
  if (event.bookClickedAt || event.outcome === "book_clicked") {
    return "Book clicked, no checkout";
  }
  return "Viewed, no Book click";
}

export function buildDailyPricingReport(
  londonDay: string,
  events: QuoteIntelligenceEvent[],
  generatedAt = new Date().toISOString(),
): DailyPricingReport {
  const rows: DailyPricingReportRow[] = events.map((event) => {
    const cheap = cheapestCompetitorGbp(event.competitors);
    const diff =
      cheap != null ? Math.round((event.matniPriceGbp - cheap) * 100) / 100 : null;
    const pct =
      cheap != null && cheap > 0
        ? Math.round(((event.matniPriceGbp - cheap) / cheap) * 1000) / 10
        : null;
    return {
      journey: `${event.pickupLabel} → ${event.dropoffLabel}`,
      miles: event.journeyMiles,
      matniGbp: event.matniPriceGbp,
      fonacabGbp: event.competitors?.fonacab?.priceGbp ?? null,
      otsGbp: event.competitors?.ots?.priceGbp ?? null,
      cheapestCompetitorGbp: cheap,
      differenceGbp: diff,
      differencePct: pct,
      flag: flagMatniVsCompetitor(event.matniPriceGbp, cheap),
      outcome: outcomeLabel(event),
      vehicleClass: event.vehicleClass,
      fingerprint: event.fingerprint,
    };
  });

  const withCompetitor = rows.filter((r) => r.cheapestCompetitorGbp != null);
  const bookClicks = events.filter((e) => e.bookClickedAt || e.outcome === "book_clicked" || e.checkoutStartedAt || e.paidAt).length;
  const checkoutsStarted = events.filter((e) => e.checkoutStartedAt || e.outcome === "checkout_started" || e.paidAt).length;
  const paid = events.filter((e) => e.paidAt || e.outcome === "paid").length;
  const averageMatniGbp =
    events.length === 0
      ? 0
      : Math.round(
          (events.reduce((sum, e) => sum + e.matniPriceGbp, 0) / events.length) * 100,
        ) / 100;
  const averageDifferenceGbp =
    withCompetitor.length === 0
      ? null
      : Math.round(
          (withCompetitor.reduce((sum, r) => sum + (r.differenceGbp ?? 0), 0) /
            withCompetitor.length) *
            100,
        ) / 100;
  const averageDifferencePct =
    withCompetitor.length === 0
      ? null
      : Math.round(
          (withCompetitor.reduce((sum, r) => sum + (r.differencePct ?? 0), 0) /
            withCompetitor.length) *
            10,
        ) / 10;

  const byAirport: Record<string, number> = {};
  const byMilesBand: Record<string, number> = {};
  const byVehicle: Record<string, number> = {};
  let unknownAreaHighFlags = 0;
  for (const event of events) {
    const airport = event.airportCode || (event.isAirportTrip ? "airport-other" : "non-airport");
    byAirport[airport] = (byAirport[airport] ?? 0) + 1;
    const band = milesBand(event.journeyMiles);
    byMilesBand[band] = (byMilesBand[band] ?? 0) + 1;
    byVehicle[event.vehicleClass] = (byVehicle[event.vehicleClass] ?? 0) + 1;
    const cheap = cheapestCompetitorGbp(event.competitors);
    if (
      !event.airportCode &&
      event.isAirportTrip &&
      flagMatniVsCompetitor(event.matniPriceGbp, cheap) === "HIGH"
    ) {
      unknownAreaHighFlags += 1;
    }
  }

  return {
    londonDay,
    generatedAt,
    quoteCount: events.length,
    bookClicks,
    checkoutsStarted,
    paid,
    conversionPct:
      events.length === 0 ? 0 : Math.round((paid / events.length) * 1000) / 10,
    averageMatniGbp,
    averageDifferenceGbp,
    averageDifferencePct,
    highCount: rows.filter((r) => r.flag === "HIGH").length,
    competitiveCount: rows.filter((r) => r.flag === "COMPETITIVE").length,
    lowCount: rows.filter((r) => r.flag === "LOW").length,
    rows,
    patterns: { byAirport, byMilesBand, byVehicle, unknownAreaHighFlags },
  };
}

export function formatDailyPricingReportEmail(
  report: DailyPricingReport,
): { subject: string; body: string } {
  const subject = `My Airport Taxi NI — Daily Pricing Report — ${report.londonDay}`;
  const lines: string[] = [
    `Daily Quote Pricing & Competitor Report (${report.londonDay})`,
    "Analytics only — no live prices were changed.",
    "",
    `Quotes: ${report.quoteCount}`,
    `Book clicks: ${report.bookClicks}`,
    `Checkouts started: ${report.checkoutsStarted}`,
    `Paid: ${report.paid}`,
    `Quote → booking conversion: ${report.conversionPct}%`,
    `Average MATNI price: £${report.averageMatniGbp.toFixed(2)}`,
    `Average £ difference vs cheapest competitor: ${
      report.averageDifferenceGbp == null ? "n/a" : `£${report.averageDifferenceGbp.toFixed(2)}`
    }`,
    `Average % difference: ${
      report.averageDifferencePct == null ? "n/a" : `${report.averageDifferencePct}%`
    }`,
    `Flags — HIGH: ${report.highCount} · COMPETITIVE: ${report.competitiveCount} · LOW: ${report.lowCount}`,
    "",
    "Journey | Miles | MATNI | FonaCAB | OTS | Cheapest | £ diff | % diff | Flag | Outcome | Vehicle",
    "-".repeat(100),
  ];

  for (const row of report.rows.slice(0, 80)) {
    lines.push(
      [
        row.journey,
        row.miles == null ? "—" : `${row.miles}`,
        `£${row.matniGbp.toFixed(2)}`,
        row.fonacabGbp == null ? "—" : `£${row.fonacabGbp.toFixed(2)}`,
        row.otsGbp == null ? "—" : `£${row.otsGbp.toFixed(2)}`,
        row.cheapestCompetitorGbp == null ? "—" : `£${row.cheapestCompetitorGbp.toFixed(2)}`,
        row.differenceGbp == null ? "—" : `£${row.differenceGbp.toFixed(2)}`,
        row.differencePct == null ? "—" : `${row.differencePct}%`,
        row.flag,
        row.outcome,
        row.vehicleClass,
      ].join(" | "),
    );
  }

  if (report.seedNotes?.length) {
    lines.push("", "Notes:", ...report.seedNotes.map((n) => `- ${n}`));
  }

  lines.push(
    "",
    "HIGH = more than 10% or £10 above cheapest reliable competitor.",
    "These flags are analytical only. Do not auto-change pricing-config.json.",
  );

  return { subject, body: lines.join("\n") };
}

/** First historical comparison seed: Dungiven → Belfast City Airport. */
export function buildDungivenBhdSeedEvent(londonDay: string = DUNGIVEN_BHD_SEED_DAY): QuoteIntelligenceEvent {
  const createdAt = `${londonDay}T12:00:00.000Z`;
  const fingerprint = `seed|dungiven|bhd|154|saloon`;
  const analyticsKey = buildQuoteAnalyticsKey({
    pickupLabel: "Dungiven, Northern Ireland",
    dropoffLabel: "Belfast City Airport (George Best)",
    returnJourney: false,
    estimatedPrice: "£154.00",
    vehicle: "Standard Saloon (1–4 passengers)",
    passengers: 2,
    suitcases: 2,
  });
  return {
    id: `seed-dungiven-bhd-${londonDay}`,
    fingerprint,
    analyticsKey,
    createdAt,
    updatedAt: createdAt,
    londonDay,
    tripLabel: "Airport drop-off",
    pickupLabel: "Dungiven, Northern Ireland",
    dropoffLabel: "Belfast City Airport (George Best)",
    airportCode: "BHD",
    isAirportTrip: true,
    returnJourney: false,
    passengers: 2,
    suitcases: 2,
    vehicle: "Standard Saloon (1–4 passengers)",
    vehicleClass: "Saloon",
    matniPriceGbp: 154,
    matniPriceLabel: "£154.00",
    journeyMiles: 54,
    premiumApplied: false,
    source: "seed",
    outcome: "viewed",
    competitors: {
      fonacab: {
        priceGbp: 130,
        vehicleClass: "Saloon",
        fetchedAt: createdAt,
      },
      ots: {
        unavailableReason: "not_sampled_for_seed",
        fetchedAt: createdAt,
      },
    },
  };
}
