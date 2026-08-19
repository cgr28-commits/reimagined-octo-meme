/**
 * Saved Quote HTTP handlers + hourly reminder processor.
 * Persistence: Cloudflare KV (TRACKING_STORE). Emails: existing worker-email stack.
 * Fixed price is locked at save time — never recalculated on open or pay.
 */

import {
  buildSavedQuoteCustomerUrl,
  evaluateSavedQuoteAccess,
  formatSavedQuoteAmount,
  normalizeSavedQuoteToken,
  shouldSendFinalReminder,
  shouldSendFirstReminder,
  toSavedQuotePublicSummary,
  type SavedQuoteJourneySnapshot,
  type SavedQuotePricingSnapshot,
  type SavedQuoteRecord,
} from "../shared/saved-quote";
import {
  buildSavedQuoteFinalReminderEmail,
  buildSavedQuoteFirstReminderEmail,
  buildSavedQuoteInitialEmail,
} from "../shared/saved-quote-emails";
import { corsHeaders } from "../shared/google-places";
import {
  createSavedQuote,
  getSavedQuoteByToken,
  listOpenSavedQuoteTokens,
  markSavedQuoteBooked,
  markSavedQuoteExpiredIfNeeded,
  patchSavedQuoteEmailTimestamps,
} from "./saved-quote-store";
import { trySendBrandedCustomerEmail, type WorkerEmailEnv } from "./worker-email";

export type SavedQuoteEnv = WorkerEmailEnv & {
  TRACKING_STORE: KVNamespace;
  SITE_ORIGIN?: string;
};

const DEFAULT_SITE_ORIGIN = "https://www.myairporttaxini.co.uk";

function siteOrigin(env: SavedQuoteEnv): string {
  return (env.SITE_ORIGIN || DEFAULT_SITE_ORIGIN).replace(/\/$/, "");
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

export function isSavedQuotesCreatePath(pathname: string): boolean {
  return pathname === "/saved-quotes" || pathname === "/api/saved-quotes";
}

export function isSavedQuotesLookupPath(pathname: string): boolean {
  return (
    pathname === "/saved-quotes/by-token" || pathname === "/api/saved-quotes/by-token"
  );
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function asOptionalNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  const s = String(value ?? "").trim();
  return s || undefined;
}

function parseJourney(raw: unknown): SavedQuoteJourneySnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Record<string, unknown>;
  const pickupLabel = String(j.pickupLabel ?? j.pickupAddress ?? "").trim();
  const dropoffLabel = String(j.dropoffLabel ?? j.destinationAddress ?? "").trim();
  const tripDate = String(j.tripDate ?? j.pickupDate ?? "").trim();
  const tripTime = String(j.tripTime ?? j.pickupTime ?? "").trim();
  if (!pickupLabel || !dropoffLabel || !tripDate || !tripTime) return null;

  const passengers = Math.max(1, Math.min(16, Number(j.passengers) || 1));
  const suitcases = Math.max(0, Math.min(20, Number(j.suitcases ?? j.luggage) || 0));
  const childSeatsRaw = Number(j.childSeats);
  const childSeats =
    Number.isFinite(childSeatsRaw) && childSeatsRaw > 0
      ? Math.min(4, Math.floor(childSeatsRaw))
      : undefined;

  return {
    pickupLabel,
    dropoffLabel,
    pickupPlaceId: asOptionalString(j.pickupPlaceId),
    dropoffPlaceId: asOptionalString(j.dropoffPlaceId ?? j.destinationPlaceId),
    pickupLat: asOptionalNumber(j.pickupLat),
    pickupLng: asOptionalNumber(j.pickupLng),
    dropoffLat: asOptionalNumber(j.dropoffLat ?? j.destinationLat),
    dropoffLng: asOptionalNumber(j.dropoffLng ?? j.destinationLng),
    airportCode: asOptionalString(j.airportCode ?? j.selectedAirport),
    tripMode: asOptionalString(j.tripMode),
    tripDirection: asOptionalString(j.tripDirection ?? j.journeyDirection),
    isAirportTrip: Boolean(j.isAirportTrip ?? j.airportCode ?? j.selectedAirport),
    isFromAirport:
      typeof j.isFromAirport === "boolean"
        ? j.isFromAirport
        : String(j.tripDirection ?? j.journeyDirection ?? "").includes("from"),
    journeyType: asOptionalString(j.journeyType),
    tripDate,
    tripTime,
    returnJourney: Boolean(j.returnJourney),
    returnDate: asOptionalString(j.returnDate),
    returnTime: asOptionalString(j.returnTime),
    passengers,
    suitcases,
    childSeats,
    childSeatNotes: childSeats ? asOptionalString(j.childSeatNotes) : undefined,
    vehicle: String(j.vehicle ?? j.vehicleType ?? "Standard Saloon (1–4 passengers)").trim(),
    flightNumber: asOptionalString(j.flightNumber)?.toUpperCase(),
    returnFlightNumber: asOptionalString(j.returnFlightNumber)?.toUpperCase(),
    tripLabel: String(j.tripLabel ?? "Airport transfer").trim() || "Airport transfer",
    journeyDistance: asOptionalString(j.journeyDistance),
    journeyDuration: asOptionalString(j.journeyDuration),
  };
}

function parsePricing(raw: unknown): SavedQuotePricingSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const total = Number(p.totalAmount ?? p.totalPrice ?? p.amount);
  if (!Number.isFinite(total) || total < 1) return null;
  const rounded = Math.round(total * 100) / 100;
  const outbound = asOptionalNumber(p.outboundAmount ?? p.outboundPrice);
  const ret = asOptionalNumber(p.returnAmount ?? p.returnPrice);
  const meta =
    p.pricingMeta && typeof p.pricingMeta === "object"
      ? (p.pricingMeta as Record<string, unknown>)
      : p.pricingSnapshot && typeof p.pricingSnapshot === "object"
        ? (p.pricingSnapshot as Record<string, unknown>)
        : undefined;
  return {
    totalAmount: rounded,
    outboundAmount: outbound != null ? Math.round(outbound * 100) / 100 : undefined,
    returnAmount: ret != null ? Math.round(ret * 100) / 100 : undefined,
    currency: "GBP",
    amountLabel: formatSavedQuoteAmount(rounded),
    pricingMeta: meta
      ? {
          ...meta,
          ...(Array.isArray(p.surcharges) ? { surcharges: p.surcharges } : {}),
        }
      : Array.isArray(p.surcharges)
        ? { surcharges: p.surcharges }
        : undefined,
  };
}

/** POST /saved-quotes — create + send initial email. */
export async function handleCreateSavedQuote(
  request: Request,
  env: SavedQuoteEnv,
  origin: string | null,
): Promise<Response> {
  if (!env.TRACKING_STORE) {
    return jsonResponse({ error: "Quote store is not configured." }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400, origin);
  }

  const customerName = String(body.customerName ?? "").trim();
  const customerEmail = String(body.customerEmail ?? "").trim().toLowerCase();
  if (customerName.length < 2) {
    return jsonResponse({ error: "Please enter your name." }, 400, origin);
  }
  if (!isValidEmail(customerEmail)) {
    return jsonResponse({ error: "Please enter a valid email address." }, 400, origin);
  }

  const journey = parseJourney(body.journey);
  const pricing = parsePricing(body.pricing ?? body);
  if (!journey) {
    return jsonResponse(
      { error: "Pickup, destination, date and time are required to save a quote." },
      400,
      origin,
    );
  }
  if (!pricing) {
    return jsonResponse({ error: "A valid quoted price is required." }, 400, origin);
  }

  let record: SavedQuoteRecord;
  try {
    record = await createSavedQuote(env.TRACKING_STORE, {
      customerName,
      customerEmail,
      journey,
      pricing,
    });
  } catch (err) {
    console.error("[saved-quote] create failed", err);
    return jsonResponse({ error: "Could not save your quote. Please try again." }, 500, origin);
  }

  const email = buildSavedQuoteInitialEmail(record, { origin: siteOrigin(env) });
  let emailSent = false;
  let emailError: string | undefined;
  try {
    const result = await trySendBrandedCustomerEmail(env, {
      to: customerEmail,
      toName: customerName,
      subject: email.subject,
      body: email.text,
      htmlBody: email.html,
    });
    if (result.sent) {
      emailSent = true;
      await patchSavedQuoteEmailTimestamps(env.TRACKING_STORE, record.token, {
        initialEmailSentAt: new Date().toISOString(),
        lastEmailError: undefined,
      });
      record = {
        ...record,
        initialEmailSentAt: new Date().toISOString(),
        lastEmailError: undefined,
      };
    } else {
      emailError = result.error || "Email send failed";
      await patchSavedQuoteEmailTimestamps(env.TRACKING_STORE, record.token, {
        lastEmailError: emailError,
      });
      console.error("[saved-quote] initial email failed", {
        reference: record.reference,
        error: emailError,
      });
    }
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
    await patchSavedQuoteEmailTimestamps(env.TRACKING_STORE, record.token, {
      lastEmailError: emailError,
    });
    console.error("[saved-quote] initial email exception", {
      reference: record.reference,
      error: emailError,
    });
  }

  const summary = toSavedQuotePublicSummary(record, siteOrigin(env));
  return jsonResponse(
    {
      ok: true,
      token: record.token,
      reference: record.reference,
      expiresAt: record.expiresAt,
      expiresAtLabel: summary.expiresAtLabel,
      amount: summary.amount,
      amountLabel: summary.amountLabel,
      currency: "GBP",
      email: customerEmail,
      emailSent,
      emailError: emailSent ? undefined : emailError,
      quoteUrl: summary.bookUrl,
      quote: summary,
    },
    200,
    origin,
  );
}

/** GET /saved-quotes/by-token?t= — public lookup. */
export async function handleGetSavedQuote(
  request: Request,
  env: SavedQuoteEnv,
  origin: string | null,
): Promise<Response> {
  if (!env.TRACKING_STORE) {
    return jsonResponse({ error: "Quote store is not configured." }, 503, origin);
  }

  const url = new URL(request.url);
  const token = normalizeSavedQuoteToken(url.searchParams.get("t") || url.searchParams.get("token") || "");
  if (!token || token.length < 32) {
    return jsonResponse({ error: "Quote not found." }, 404, origin);
  }

  let record = await getSavedQuoteByToken(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Quote not found." }, 404, origin);
  }

  record = await markSavedQuoteExpiredIfNeeded(env.TRACKING_STORE, record);
  const access = evaluateSavedQuoteAccess(record);
  const summary = toSavedQuotePublicSummary(record, siteOrigin(env));

  if (!access.ok) {
    return jsonResponse(
      {
        ok: false,
        error: access.error,
        quote: summary,
        canBook: false,
        message:
          access.error === "booked"
            ? "This journey has already been booked."
            : access.error === "expired"
              ? "This quote has expired."
              : "Quote not found.",
      },
      access.error === "not_found" ? 404 : 409,
      origin,
    );
  }

  return jsonResponse(
    {
      ok: true,
      quote: summary,
      canBook: true,
    },
    200,
    origin,
  );
}

/**
 * Resolve a saved quote for SumUp payment — amount always from KV (fixed price).
 */
export async function resolveSavedQuoteForPayment(
  store: KVNamespace,
  tokenRaw: string,
): Promise<
  | { ok: true; record: SavedQuoteRecord; amount: number }
  | { ok: false; error: string; status: number }
> {
  const token = normalizeSavedQuoteToken(tokenRaw);
  if (!token || token.length < 32) {
    return { ok: false, error: "This saved quote link is invalid.", status: 404 };
  }
  let record = await getSavedQuoteByToken(store, token);
  if (!record) {
    return { ok: false, error: "This saved quote link is invalid or no longer available.", status: 404 };
  }
  record = await markSavedQuoteExpiredIfNeeded(store, record);
  const access = evaluateSavedQuoteAccess(record);
  if (!access.ok) {
    if (access.error === "booked") {
      return {
        ok: false,
        error: "This journey has already been booked.",
        status: 409,
      };
    }
    if (access.error === "expired") {
      return {
        ok: false,
        error:
          "This saved quote has expired. Please get a new quote to see the current price.",
        status: 410,
      };
    }
    return { ok: false, error: "This saved quote is no longer available.", status: 404 };
  }
  const amount = Math.round(record.pricing.totalAmount * 100) / 100;
  if (!Number.isFinite(amount) || amount < 1) {
    return { ok: false, error: "This saved quote has an invalid price.", status: 422 };
  }
  return { ok: true, record, amount };
}

export async function markSavedQuoteBookedFromPayment(
  store: KVNamespace,
  token: string,
  meta: { paymentReference: string; checkoutId?: string },
): Promise<SavedQuoteRecord | null> {
  return markSavedQuoteBooked(store, token, meta);
}

/**
 * Hourly cron: 24h + day-5 reminders; expire open quotes.
 * Re-checks status before every send. Idempotent via sent-at timestamps.
 */
export async function processSavedQuoteReminders(env: SavedQuoteEnv): Promise<{
  processed: number;
  firstReminders: number;
  finalReminders: number;
  expired: number;
  skipped: number;
  errors: number;
}> {
  if (!env.TRACKING_STORE) {
    return { processed: 0, firstReminders: 0, finalReminders: 0, expired: 0, skipped: 0, errors: 0 };
  }

  const store = env.TRACKING_STORE;
  const tokens = await listOpenSavedQuoteTokens(store);
  const now = new Date();
  let firstReminders = 0;
  let finalReminders = 0;
  let expired = 0;
  let skipped = 0;
  let errors = 0;
  const origin = siteOrigin(env);

  for (const token of tokens) {
    try {
      let record = await getSavedQuoteByToken(store, token);
      if (!record) {
        skipped += 1;
        continue;
      }

      if (record.status === "booked") {
        skipped += 1;
        continue;
      }

      record = await markSavedQuoteExpiredIfNeeded(store, record, now);
      if (record.status === "expired") {
        expired += 1;
        continue;
      }

      if (record.status !== "saved") {
        skipped += 1;
        continue;
      }

      if (shouldSendFirstReminder(record, now)) {
        const latest = await getSavedQuoteByToken(store, token);
        if (
          !latest ||
          latest.status !== "saved" ||
          latest.firstReminderSentAt ||
          !shouldSendFirstReminder(latest, now)
        ) {
          skipped += 1;
          continue;
        }
        const email = buildSavedQuoteFirstReminderEmail(latest, { origin });
        const result = await trySendBrandedCustomerEmail(env, {
          to: latest.customerEmail,
          toName: latest.customerName,
          subject: email.subject,
          body: email.text,
          htmlBody: email.html,
        });
        if (result.sent) {
          await patchSavedQuoteEmailTimestamps(store, token, {
            firstReminderSentAt: new Date().toISOString(),
            lastEmailError: undefined,
          });
          firstReminders += 1;
        } else {
          await patchSavedQuoteEmailTimestamps(store, token, {
            lastEmailError: result.error || "First reminder failed",
          });
          console.error("[saved-quote] first reminder failed", {
            reference: latest.reference,
            error: result.error,
          });
          errors += 1;
        }
        continue;
      }

      if (shouldSendFinalReminder(record, now)) {
        const latest = await getSavedQuoteByToken(store, token);
        if (
          !latest ||
          latest.status !== "saved" ||
          latest.finalReminderSentAt ||
          !shouldSendFinalReminder(latest, now)
        ) {
          skipped += 1;
          continue;
        }
        const email = buildSavedQuoteFinalReminderEmail(latest, { origin });
        const result = await trySendBrandedCustomerEmail(env, {
          to: latest.customerEmail,
          toName: latest.customerName,
          subject: email.subject,
          body: email.text,
          htmlBody: email.html,
        });
        if (result.sent) {
          await patchSavedQuoteEmailTimestamps(store, token, {
            finalReminderSentAt: new Date().toISOString(),
            lastEmailError: undefined,
          });
          finalReminders += 1;
        } else {
          await patchSavedQuoteEmailTimestamps(store, token, {
            lastEmailError: result.error || "Final reminder failed",
          });
          console.error("[saved-quote] final reminder failed", {
            reference: latest.reference,
            error: result.error,
          });
          errors += 1;
        }
        continue;
      }

      skipped += 1;
    } catch (err) {
      errors += 1;
      console.error("[saved-quote] reminder processor error", {
        token: token.slice(0, 8),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    processed: tokens.length,
    firstReminders,
    finalReminders,
    expired,
    skipped,
    errors,
  };
}

export { getSavedQuoteByToken, buildSavedQuoteCustomerUrl };
